// Données d'exemple pour voir l'app remplie (npm run demo). Ne touche à rien si la base contient déjà des articles.
import { db } from './db.js';
import { receiveMessage } from './engine.js';

const PIECES = [
  ['Polo Ralph Lauren custom fit', 'Polo', 'M', 'Bleu marine', 'Aisselle à aisselle 52 cm, longueur 72 cm', 45],
  ['Polo Ralph Lauren slim fit', 'Polo', 'S', 'Blanc', 'Aisselle à aisselle 48 cm, longueur 69 cm', 40],
  ['Polo Ralph Lauren big pony', 'Polo', 'L', 'Rouge', 'Aisselle à aisselle 56 cm, longueur 75 cm', 50],
  ['Chemise Ralph Lauren oxford', 'Chemise', 'M', 'Bleu ciel', 'Aisselle à aisselle 54 cm, longueur 78 cm', 55],
  ['Chemise Ralph Lauren rayée', 'Chemise', 'L', 'Blanc / bleu', null, 50],
  ['Pull Ralph Lauren col rond câble', 'Pull', 'M', 'Gris chiné', 'Aisselle à aisselle 55 cm, longueur 68 cm', 70],
  ['Pull Ralph Lauren half zip', 'Pull', 'L', 'Vert forêt', 'Aisselle à aisselle 58 cm, longueur 70 cm', 65],
  ['Pull Ralph Lauren cachemire', 'Pull', 'S', 'Beige', null, 70],
  ['Sweat Ralph Lauren à capuche', 'Sweat', 'M', 'Noir', 'Aisselle à aisselle 56 cm, longueur 70 cm', 60],
  ['Polo Ralph Lauren manches longues', 'Polo', 'XL', 'Bordeaux', 'Aisselle à aisselle 60 cm, longueur 77 cm', 45],
  ['Chemise Ralph Lauren lin', 'Chemise', 'S', 'Blanc', 'Aisselle à aisselle 50 cm, longueur 74 cm', 55],
  ['Polo Ralph Lauren mesh', 'Polo', 'M', 'Jaune', 'Aisselle à aisselle 52 cm, longueur 71 cm', 45],
  ['Pull Ralph Lauren col V', 'Pull', 'M', 'Bleu marine', null, 55],
  ['Polo Ralph Lauren rugby', 'Polo', 'L', 'Vert / blanc', 'Aisselle à aisselle 57 cm, longueur 76 cm', 65],
  ['Veste Ralph Lauren Harrington', 'Veste', 'M', 'Beige', 'Aisselle à aisselle 56 cm, longueur 66 cm', 70],
];

const SOLD = [ // [index, plateforme, prix, jours après mise en ligne, statut colis]
  [0, 'vinted', 45, 2, 'expedie'], [2, 'vinted', 48, 3, 'expedie'], [5, 'ebay', 68, 6, 'expedie'],
  [3, 'leboncoin', 52, 4, 'a_expedier'], [11, 'vinted', 42, 1, 'a_expedier'], [8, 'depop', 60, 5, 'a_expedier'],
];

export async function seedDemo() {
  if (db.prepare('SELECT COUNT(*) n FROM items').get().n > 0) return;
  const lot = Number(db.prepare("INSERT INTO lots (name, supplier, cost, bought_at) VALUES ('Lot Ralph Lauren n°1', 'Grossiste', 280, date('now', '-20 days'))").run().lastInsertRowid);
  const ids = PIECES.map(([title, category, size, color, measurements, price], i) => {
    const r = db.prepare(`INSERT INTO items (lot_id, title, category, size, color, measurements, cost, price, min_price, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', ?))`)
      .run(lot, title, category, size, color, measurements, Math.round((280 / PIECES.length) * 100) / 100, price, Math.round(price * 0.85), `-${18 - (i % 9)} days`);
    const id = Number(r.lastInsertRowid);
    for (const p of ['vinted', 'leboncoin', 'ebay', 'depop']) db.prepare('INSERT INTO listings (item_id, platform) VALUES (?, ?)').run(id, p);
    return id;
  });
  for (const [i, platform, price, after, status] of SOLD) {
    const id = ids[i];
    const created = db.prepare('SELECT created_at FROM items WHERE id = ?').get(id).created_at;
    const fee = platform === 'ebay' ? Math.round(price * 13) / 100 : 0;
    db.prepare("INSERT INTO sales (item_id, platform, price, fees, buyer, status, sold_at) VALUES (?, ?, ?, ?, ?, ?, datetime(?, ?))")
      .run(id, platform, price, fee, ['lea_v', 'tom.r', 'jules75', 'Karim', 'manon_b', 'sacha'][SOLD.findIndex((s) => s[0] === i)], status, created, `+${after} days`);
    db.prepare("UPDATE items SET status = 'vendu', sold_at = datetime(created_at, ?) WHERE id = ?").run(`+${after} days`, id);
    db.prepare("UPDATE listings SET status = CASE WHEN platform = ? THEN 'vendu' ELSE 'retire' END WHERE item_id = ?").run(platform, id);
  }
  const msgs = [
    ['vinted', 'camille.d', 1, 'Bonjour, toujours dispo ?'],
    ['vinted', 'hugo_23', 6, 'Bonjour vous me la feriez à 45€ ?'],
    ['leboncoin', 'Nadia', 4, 'Bonjour, vous avez les mesures svp ?'],
    ['ebay', 'mark_uk', 9, 'Is it authentic? Ship to UK?'],
    ['depop', 'zoe.vtg', 13, 'Hello, c\'est authentique ?'],
    ['vinted', 'alex.b', 7, 'Je peux vous payer par PayPal directement ?'],
    ['vinted', 'romain', 12, 'Vous pourriez m\'envoyer une photo portée ?'],
  ];
  for (const [platform, buyer, idx, body] of msgs) await receiveMessage({ platform, buyer, item_id: ids[idx], external_id: `demo-${buyer}`, body });
  console.log('  Données de démonstration ajoutées.');
}
