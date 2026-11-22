// Serveur de l'app : API + interface. Aucune dépendance à part le SDK Claude.
// Lancer : npm start   (ou npm run demo pour remplir avec des données d'exemple)
import http from 'node:http';
import os from 'node:os';
import QRCode from 'qrcode';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { PHOTO_DIR, deletePhotoFile, purgeOldSales } from './lib/maintenance.js';
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { db, getSettings, setSetting, plain, log } from './lib/db.js';
import { platformList, PLATFORMS } from './lib/connectors/index.js';
import { receiveMessage, sendManual, recordSale, startAutopilot, autoReply } from './lib/engine.js';
import { seedDemo } from './lib/demo.js';

// ---------- Fichier .env (facultatif) ----------
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const PORT = Number(process.env.PORT) || 3000;

// ---------- Accès protégé par mot de passe ----------
const secretFile = path.resolve('data/secret.json');
const secret = existsSync(secretFile) ? JSON.parse(readFileSync(secretFile, 'utf8')) : {};
if (!secret.cookieKey) secret.cookieKey = randomBytes(32).toString('hex');
if (!secret.password) secret.password = randomBytes(6).toString('base64url');
writeFileSync(secretFile, JSON.stringify(secret, null, 1), { mode: 0o600 });
const PASSWORD = process.env.APP_PASSWORD || secret.password;

const sign = (v) => `${v}.${createHmac('sha256', secret.cookieKey).update(v).digest('base64url')}`;
function authed(req) {
  const c = (req.headers.cookie || '').split(';').map((s) => s.trim()).find((s) => s.startsWith('session='));
  if (!c) return false;
  const val = c.slice(8);
  const [v] = val.split('.');
  const expected = sign(v);
  if (expected.length !== val.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(val))) return false;
  return Number(v) > Date.now();
}
const attempts = new Map();

// ---------- Utilitaires HTTP ----------
const send = (res, code, data) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
};
const body = (req) => new Promise((resolve, reject) => {
  let s = '';
  req.on('data', (c) => { s += c; if (s.length > 5e6) req.destroy(); });
  req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch (e) { reject(e); } });
});
const num = (v, d = 0) => (v === '' || v == null || Number.isNaN(Number(v)) ? d : Number(v));

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg' };
function serveStatic(req, res) {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  const file = path.join(path.resolve('public'), path.normalize(p));
  if (!file.startsWith(path.resolve('public')) || !existsSync(file)) {
    res.writeHead(200, { 'Content-Type': MIME['.html'] });
    return res.end(readFileSync('public/index.html'));
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
}

// ---------- Calculs du tableau de bord ----------
function dashboard() {
  const s = getSettings();
  const one = (sql, ...a) => db.prepare(sql).get(...a);
  const sales = one('SELECT COUNT(*) n, COALESCE(SUM(price),0) revenue, COALESCE(SUM(fees),0) fees FROM sales');
  const invested = one('SELECT COALESCE(SUM(cost),0) v FROM lots').v + one('SELECT COALESCE(SUM(cost),0) v FROM items WHERE lot_id IS NULL').v;
  const stock = one("SELECT COUNT(*) n, COALESCE(SUM(price),0) value FROM items WHERE status IN ('en_vente','reserve')");
  const days = one("SELECT AVG(julianday(sold_at) - julianday(created_at)) d FROM items WHERE status = 'vendu'").d;
  const byPlatform = plain(db.prepare(`SELECT s.platform, COUNT(*) n, SUM(s.price) revenue,
      AVG(julianday(s.sold_at) - julianday(i.created_at)) days
      FROM sales s JOIN items i ON i.id = s.item_id GROUP BY s.platform ORDER BY revenue DESC`).all())
    .map((r) => ({ ...r, name: PLATFORMS[r.platform]?.name, color: PLATFORMS[r.platform]?.color }));
  const weekly = plain(db.prepare(`SELECT date(sold_at, 'weekday 1', '-7 days') week, SUM(price) revenue, COUNT(*) n
      FROM sales WHERE sold_at >= date('now', '-84 days') GROUP BY week ORDER BY week`).all());
  const stale = plain(db.prepare(`SELECT id, title, size, price, min_price, CAST(julianday('now') - julianday(created_at) AS INT) age
      FROM items WHERE status = 'en_vente' AND julianday('now') - julianday(created_at) >= ? ORDER BY age DESC LIMIT 8`).all(num(s.stale_days, 7)));
  const ai = one(`SELECT COUNT(*) calls, COALESCE(SUM(input_tokens),0) inp, COALESCE(SUM(output_tokens),0) out
      FROM ai_usage WHERE created_at >= date('now', 'start of month')`);
  const auto = one(`SELECT SUM(author = 'auto') tpl, SUM(author = 'ia') ia, SUM(author = 'moi') me FROM messages
      WHERE direction = 'out' AND created_at >= date('now', 'start of month')`);
  return {
    goal: num(s.goal_revenue, 800),
    revenue: sales.revenue, fees: sales.fees, sold: sales.n, invested,
    profit: sales.revenue - sales.fees - invested,
    stock_count: stock.n, stock_value: stock.value,
    avg_days: days == null ? null : Math.round(days * 10) / 10,
    to_ship: one("SELECT COUNT(*) n FROM sales WHERE status = 'a_expedier'").n,
    to_handle: one('SELECT COUNT(*) n FROM conversations WHERE unread = 2').n,
    to_delist: one("SELECT COUNT(*) n FROM listings WHERE status = 'a_retirer'").n,
    by_platform: byPlatform, weekly, stale,
    ai: { ...ai, template_replies: auto.tpl || 0, ai_replies: auto.ia || 0, manual_replies: auto.me || 0 },
  };
}

const itemQuery = `SELECT i.*, (SELECT json_group_array(json_object('platform', platform, 'status', status, 'url', url))
  FROM listings WHERE item_id = i.id) AS listings FROM items i`;
const withListings = (rows) => plain(rows).map((r) => ({ ...r, listings: JSON.parse(r.listings || '[]') }));

function saveListings(itemId, platforms) {
  if (!Array.isArray(platforms)) return;
  const existing = plain(db.prepare('SELECT platform FROM listings WHERE item_id = ?').all(itemId)).map((r) => r.platform);
  for (const p of platforms) if (PLATFORMS[p] && !existing.includes(p)) db.prepare('INSERT INTO listings (item_id, platform) VALUES (?, ?)').run(itemId, p);
  for (const p of existing) if (!platforms.includes(p)) db.prepare("DELETE FROM listings WHERE item_id = ? AND platform = ? AND status = 'actif'").run(itemId, p);
}

const ITEM_FIELDS = ['title', 'brand', 'category', 'size', 'color', 'condition', 'measurements', 'description', 'cost', 'price', 'min_price', 'photo', 'status', 'lot_id'];
function itemValues(b) {
  const v = {};
  for (const f of ITEM_FIELDS) if (f in b) v[f] = ['cost', 'price', 'min_price'].includes(f) ? num(b[f]) : (b[f] === '' ? null : b[f]);
  if ('price' in v && !('min_price' in v)) v.min_price = Math.round(v.price * 0.85);
  return v;
}

// ---------- Routes ----------
const routes = [];
const on = (method, pattern, fn) => routes.push({ method, re: new RegExp(`^${pattern.replace(/:\w+/g, '(\\d+)')}$`), fn });

on('GET', '/api/dashboard', () => dashboard());
on('GET', '/api/platforms', () => platformList());
on('GET', '/api/settings', () => getSettings());
on('PUT', '/api/settings', (b) => { for (const [k, v] of Object.entries(b)) setSetting(k, v); return getSettings(); });
on('GET', '/api/activity', () => plain(db.prepare('SELECT * FROM activity ORDER BY id DESC LIMIT 60').all()));

on('GET', '/api/lots', () => plain(db.prepare(`SELECT l.*, COUNT(i.id) items, SUM(i.status = 'vendu') sold,
  COALESCE((SELECT SUM(s.price) FROM sales s JOIN items x ON x.id = s.item_id WHERE x.lot_id = l.id), 0) revenue
  FROM lots l LEFT JOIN items i ON i.lot_id = l.id GROUP BY l.id ORDER BY l.id DESC`).all()));
on('POST', '/api/lots', (b) => {
  const r = db.prepare('INSERT INTO lots (name, supplier, cost) VALUES (?, ?, ?)').run(b.name || 'Nouveau lot', b.supplier || null, num(b.cost));
  return { id: Number(r.lastInsertRowid) };
});

on('GET', '/api/items', () => withListings(db.prepare(`${itemQuery} ORDER BY (i.status = 'vendu'), i.id DESC`).all()));
on('POST', '/api/items', (b) => {
  const v = itemValues(b);
  if (!v.title || !v.price) throw Object.assign(new Error('Titre et prix obligatoires'), { code: 400 });
  const keys = Object.keys(v);
  const r = db.prepare(`INSERT INTO items (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map((k) => v[k]));
  const id = Number(r.lastInsertRowid);
  saveListings(id, b.platforms || ['vinted', 'leboncoin', 'ebay', 'depop']);
  log('stock', `Article ajouté : ${v.title}`);
  return { id };
});
on('PUT', '/api/items/:id', (b, [id]) => {
  const v = itemValues(b);
  delete v.status;
  const keys = Object.keys(v);
  if (keys.length) db.prepare(`UPDATE items SET ${keys.map((k) => `${k} = ?`).join(',')} WHERE id = ?`).run(...keys.map((k) => v[k]), id);
  saveListings(Number(id), b.platforms);
  return { ok: true };
});
on('DELETE', '/api/items/:id', (b, [id]) => {
  deletePhotoFile(db.prepare('SELECT photo FROM items WHERE id = ?').get(id)?.photo);
  db.prepare('DELETE FROM items WHERE id = ?').run(id);
  return { ok: true };
});
on('POST', '/api/items/:id/sell', async (b, [id]) => {
  await recordSale({ item_id: Number(id), platform: b.platform, price: num(b.price), fees: b.fees === '' || b.fees == null ? undefined : num(b.fees), shipping_paid: num(b.shipping_paid), buyer: b.buyer });
  return { ok: true };
});

on('GET', '/api/sales', () => plain(db.prepare(`SELECT s.*, i.title, i.size, i.photo, i.cost FROM sales s JOIN items i ON i.id = s.item_id
  ORDER BY (s.status != 'a_expedier'), s.sold_at DESC`).all()));
on('POST', '/api/sales/:id/ship', (b, [id]) => {
  db.prepare("UPDATE sales SET status = 'expedie', shipped_at = datetime('now') WHERE id = ?").run(id);
  return { ok: true };
});

on('GET', '/api/conversations', () => plain(db.prepare(`SELECT c.*, i.title item_title, i.price item_price,
  (SELECT body FROM messages WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1) last,
  (SELECT author FROM messages WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1) last_author
  FROM conversations c LEFT JOIN items i ON i.id = c.item_id ORDER BY (c.unread = 2) DESC, c.updated_at DESC`).all()));
on('GET', '/api/conversations/:id', (b, [id]) => {
  db.prepare('UPDATE conversations SET unread = 0 WHERE id = ? AND unread = 1').run(id);
  const c = plain(db.prepare('SELECT c.*, i.title item_title, i.price item_price, i.min_price item_min, i.size item_size FROM conversations c LEFT JOIN items i ON i.id = c.item_id WHERE c.id = ?').get(id));
  return { ...c, messages: plain(db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY id').all(id)) };
});
on('POST', '/api/conversations/:id/reply', async (b, [id]) => ({ delivered: await sendManual(Number(id), String(b.body || '').trim()) }));
on('POST', '/api/conversations/:id/auto', async (b, [id]) => ({ text: await autoReply(Number(id)) }));
// Simuler un message entrant (pour tester les réponses automatiques avant les connexions)
on('POST', '/api/test-message', async (b) => ({ id: await receiveMessage({ platform: b.platform || 'vinted', buyer: b.buyer || 'Test', item_id: b.item_id ? Number(b.item_id) : null, body: String(b.body || '') }) }));

// Photo envoyée depuis le téléphone ou le PC (déjà réduite par l'app, en JPEG)
on('POST', '/api/items/:id/photo', (b, [id]) => {
  const m = String(b.data || '').match(/^data:image\/(jpeg|png|webp);base64,(.+)$/);
  if (!m) throw new Error('Image invalide');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 4e6) throw new Error('Image trop lourde');
  const item = db.prepare('SELECT photo FROM items WHERE id = ?').get(id);
  if (!item) throw new Error('Article introuvable');
  deletePhotoFile(item.photo);
  const name = `${id}-${Date.now()}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
  writeFileSync(path.join(PHOTO_DIR, name), buf);
  db.prepare('UPDATE items SET photo = ? WHERE id = ?').run(`/photos/${name}`, id);
  return { photo: `/photos/${name}` };
});
on('POST', '/api/maintenance/purge', () => ({ archived: purgeOldSales() }));

// Adresses pour ouvrir l'app depuis le téléphone (même Wi-Fi)
function lanUrls() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(`http://${a.address}:${PORT}`);
  }
  return out.sort((a, b) => Number(/\/\/192\.168\./.test(b)) - Number(/\/\/192\.168\./.test(a)));
}
on('GET', '/api/network', async () => {
  const urls = lanUrls();
  const qr = urls[0] ? await QRCode.toString(urls[0], { type: 'svg', margin: 1, color: { dark: '#000000', light: '#ffffff' } }) : null;
  return { urls, qr };
});

// ---------- Serveur ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/photos/')) {
    const file = path.join(PHOTO_DIR, path.basename(url.pathname));
    if (!authed(req) || !existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'image/jpeg', 'Cache-Control': 'private, max-age=86400' });
    return res.end(readFileSync(file));
  }
  if (!url.pathname.startsWith('/api/')) return serveStatic(req, res);

  if (url.pathname === '/api/login' && req.method === 'POST') {
    const ip = req.socket.remoteAddress;
    const a = attempts.get(ip) || { n: 0, t: Date.now() };
    if (Date.now() - a.t > 15 * 60_000) { a.n = 0; a.t = Date.now(); }
    if (a.n >= 10) return send(res, 429, { error: 'Trop d\'essais, réessaie dans 15 minutes' });
    const b = await body(req).catch(() => ({}));
    const pw = Buffer.from(String(b.password || ''));
    const ok = pw.length === Buffer.byteLength(PASSWORD) && timingSafeEqual(pw, Buffer.from(PASSWORD));
    if (!ok) { a.n++; attempts.set(ip, a); return send(res, 401, { error: 'Mot de passe incorrect' }); }
    const exp = String(Date.now() + 30 * 24 * 3600_000);
    res.setHeader('Set-Cookie', `session=${sign(exp)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${30 * 24 * 3600}`);
    return send(res, 200, { ok: true });
  }
  if (url.pathname === '/api/logout') {
    res.setHeader('Set-Cookie', 'session=; Path=/; Max-Age=0');
    return send(res, 200, { ok: true });
  }
  if (!authed(req)) return send(res, 401, { error: 'Non connecté' });
  if (url.pathname === '/api/me') return send(res, 200, { ok: true, shop: getSettings().shop_name });

  for (const r of routes) {
    const m = url.pathname.match(r.re);
    if (m && r.method === req.method) {
      try {
        const b = ['POST', 'PUT'].includes(req.method) ? await body(req) : {};
        return send(res, 200, await r.fn(b, m.slice(1)));
      } catch (err) {
        return send(res, err.code || 400, { error: err.message });
      }
    }
  }
  send(res, 404, { error: 'Introuvable' });
});

if (process.argv.includes('--demo')) await seedDemo();
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') { console.log(`  Revente tourne déjà sur le port ${PORT}.`); process.exit(0); }
  throw err;
});
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  App de revente prête : http://localhost:${PORT}`);
  for (const u of lanUrls()) console.log(`  Sur le téléphone (même Wi-Fi) : ${u}`);
  console.log(`  Mot de passe : ${process.env.APP_PASSWORD ? '(celui de APP_PASSWORD)' : PASSWORD}\n`);
  startAutopilot();
});
