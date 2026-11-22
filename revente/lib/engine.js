// Pilote automatique : traite les messages entrants, enregistre les ventes,
// retire les annonces vendues des autres plateformes, relance ce qui est en attente.
import { db, getSetting, log, plain } from './db.js';
import { connectors, PLATFORMS } from './connectors/index.js';
import { templateReply, aiReply } from './replies.js';
import { dailyMaintenance } from './maintenance.js';

const getItem = (id) => (id ? db.prepare('SELECT * FROM items WHERE id = ?').get(id) : null);
const history = (convId) => plain(db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY id').all(convId));

async function deliver(conv, msgId, text) {
  const res = await connectors[conv.platform].sendMessage(conv, text);
  db.prepare('UPDATE messages SET delivered = ? WHERE id = ?').run(res.ok ? 1 : 0, msgId);
  return res.ok;
}

function addOut(convId, body, author, intent) {
  const r = db.prepare('INSERT INTO messages (conversation_id, direction, body, author, intent, delivered) VALUES (?, ?, ?, ?, ?, 0)')
    .run(convId, 'out', body, author, intent || null);
  db.prepare("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?").run(convId);
  return Number(r.lastInsertRowid);
}

// Un message d'acheteur arrive (depuis un connecteur, ou ajouté à la main).
export async function receiveMessage({ platform, external_id, buyer, item_id, body }) {
  let conv = external_id
    ? db.prepare('SELECT * FROM conversations WHERE platform = ? AND external_id = ?').get(platform, external_id)
    : null;
  if (!conv) {
    const r = db.prepare('INSERT INTO conversations (platform, external_id, buyer, item_id) VALUES (?, ?, ?, ?)')
      .run(platform, external_id || null, buyer || 'Acheteur', item_id || null);
    conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(r.lastInsertRowid);
  }
  db.prepare('INSERT INTO messages (conversation_id, direction, body, author) VALUES (?, ?, ?, ?)').run(conv.id, 'in', body, 'acheteur');
  db.prepare("UPDATE conversations SET unread = 1, updated_at = datetime('now') WHERE id = ?").run(conv.id);
  await autoReply(conv.id);
  return conv.id;
}

export async function autoReply(convId) {
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(convId);
  const msgs = history(convId);
  const last = msgs[msgs.length - 1];
  if (!last || last.direction !== 'in') return null;
  const item = getItem(conv.item_id);
  const who = `${conv.buyer} (${PLATFORMS[conv.platform].name})`;

  let { text, intent, attention } = templateReply(last.body, item);
  let author = 'auto';
  if (!text && !attention) {
    text = await aiReply(conv, item, msgs);
    author = 'ia';
  }
  db.prepare('UPDATE messages SET intent = ? WHERE id = ?').run(intent || (text ? 'ia' : 'inconnu'), last.id);

  if (!text) {
    db.prepare('UPDATE conversations SET unread = 2 WHERE id = ?').run(convId); // 2 = à traiter par toi
    log('attention', `${who} : message à traiter toi-même (« ${last.body.slice(0, 60)} »)`);
    return null;
  }
  if (getSetting('autopilot') !== '1') {
    // Mode manuel : la réponse est préparée mais pas envoyée.
    addOut(convId, text, author, intent);
    db.prepare('UPDATE conversations SET unread = 2 WHERE id = ?').run(convId);
    return text;
  }
  const id = addOut(convId, text, author, intent);
  const ok = await deliver(conv, id, text);
  db.prepare('UPDATE conversations SET unread = ? WHERE id = ?').run(attention ? 2 : 0, convId);
  log('reponse', `${author === 'ia' ? 'IA' : 'Modèle'} → ${who}${ok ? '' : ' (en attente de connexion)'} : ${text.slice(0, 70)}`);
  return text;
}

export async function sendManual(convId, body) {
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(convId);
  const id = addOut(convId, body, 'moi');
  db.prepare('UPDATE conversations SET unread = 0 WHERE id = ?').run(convId);
  return deliver(conv, id, body);
}

// Une vente est confirmée : enregistrement + retrait des autres plateformes.
export async function recordSale({ item_id, platform, price, fees, shipping_paid, buyer }) {
  const item = getItem(item_id);
  if (!item) throw new Error('Article introuvable');
  if (item.status === 'vendu') throw new Error('Article déjà vendu');
  const fee = fees ?? Math.round(price * (PLATFORMS[platform]?.fee_pct || 0)) / 100;
  db.prepare('INSERT INTO sales (item_id, platform, price, fees, shipping_paid, buyer) VALUES (?, ?, ?, ?, ?, ?)')
    .run(item_id, platform, price, fee, shipping_paid || 0, buyer || null);
  db.prepare("UPDATE items SET status = 'vendu', sold_at = datetime('now') WHERE id = ?").run(item_id);
  db.prepare("UPDATE listings SET status = 'vendu' WHERE item_id = ? AND platform = ?").run(item_id, platform);
  db.prepare("UPDATE listings SET status = 'a_retirer' WHERE item_id = ? AND platform != ? AND status = 'actif'").run(item_id, platform);
  log('vente', `Vendu sur ${PLATFORMS[platform].name} : ${item.title} — ${price} € → à expédier`);
  await processDelists();
}

export async function processDelists() {
  const rows = plain(db.prepare("SELECT l.*, i.title FROM listings l JOIN items i ON i.id = l.item_id WHERE l.status = 'a_retirer'").all());
  for (const l of rows) {
    const res = await connectors[l.platform].delist(l);
    if (res.ok) {
      db.prepare("UPDATE listings SET status = 'retire' WHERE id = ?").run(l.id);
      log('retrait', `Annonce retirée de ${PLATFORMS[l.platform].name} : ${l.title}`);
    }
  }
}

async function retryUndelivered() {
  const rows = plain(db.prepare(`SELECT m.id, m.body, c.* FROM messages m JOIN conversations c ON c.id = m.conversation_id
    WHERE m.direction = 'out' AND m.delivered = 0 AND c.platform IN (${Object.keys(connectors).map(() => '?').join(',')})`)
    .all(...Object.keys(connectors)));
  for (const r of rows) {
    if (!connectors[r.platform].isConnected()) continue;
    await deliver(r, r.id, r.body);
  }
}

async function pullMessages() {
  for (const c of Object.values(connectors)) {
    if (!c.isConnected()) continue;
    const res = await c.fetchMessages();
    for (const m of res.messages || []) await receiveMessage({ platform: c.id, ...m });
  }
}

// Boucle de fond : toutes les minutes.
export function startAutopilot() {
  const tick = async () => {
    try {
      await pullMessages();
      await retryUndelivered();
      await processDelists();
      dailyMaintenance();
    } catch (err) {
      log('erreur', `Pilote automatique : ${err.message}`);
    }
  };
  setInterval(tick, 60_000);
  tick();
}
