// Base de données locale (SQLite intégré à Node, aucune installation).
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const dir = path.resolve('data');
mkdirSync(dir, { recursive: true });
export const db = new DatabaseSync(path.join(dir, 'revente.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS lots (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  supplier TEXT,
  cost REAL NOT NULL DEFAULT 0,
  bought_at TEXT NOT NULL DEFAULT (date('now'))
);

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY,
  lot_id INTEGER REFERENCES lots(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  brand TEXT NOT NULL DEFAULT 'Ralph Lauren',
  category TEXT,
  size TEXT,
  color TEXT,
  condition TEXT NOT NULL DEFAULT 'Très bon état',
  measurements TEXT,
  description TEXT,
  cost REAL NOT NULL DEFAULT 0,
  price REAL NOT NULL,
  min_price REAL NOT NULL,
  photo TEXT,
  status TEXT NOT NULL DEFAULT 'en_vente', -- brouillon | en_vente | reserve | vendu
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  sold_at TEXT
);

-- Où chaque article est publié (une ligne par plateforme)
CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  external_id TEXT,
  url TEXT,
  status TEXT NOT NULL DEFAULT 'actif', -- actif | a_retirer | retire | vendu
  UNIQUE(item_id, platform)
);

CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  price REAL NOT NULL,
  fees REAL NOT NULL DEFAULT 0,
  shipping_paid REAL NOT NULL DEFAULT 0,
  buyer TEXT,
  status TEXT NOT NULL DEFAULT 'a_expedier', -- a_expedier | expedie | livre
  sold_at TEXT NOT NULL DEFAULT (datetime('now')),
  shipped_at TEXT
);

CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY,
  platform TEXT NOT NULL,
  external_id TEXT,
  buyer TEXT NOT NULL,
  item_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
  unread INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(platform, external_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL, -- in | out
  body TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT 'acheteur', -- acheteur | moi | auto | ia
  intent TEXT,
  delivered INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Journal de tout ce que le pilote automatique fait
CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Compteur de consommation de l'IA
CREATE TABLE IF NOT EXISTS ai_usage (
  id INTEGER PRIMARY KEY,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

export const DEFAULT_SETTINGS = {
  shop_name: 'Ma boutique',
  goal_revenue: '800',
  autopilot: '1',            // réponses envoyées sans validation
  ai_enabled: '1',           // l'IA ne sert qu'aux messages que les modèles ne savent pas traiter
  ai_model: 'claude-opus-5-5',
  ai_daily_limit: '40',      // nombre max d'appels IA par jour
  bundle_discount: '10',     // % de remise sur les lots de 2+
  shipping_delay: '24 à 48 h',
  stale_days: '7',
  signature: '',
  purge_days: '15',         // ménage des ventes expédiées après N jours (0 = jamais)
  last_maintenance: '',
};

const getStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
const setStmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');

export function getSetting(key) {
  const row = getStmt.get(key);
  return row ? row.value : DEFAULT_SETTINGS[key];
}
export function getSettings() {
  const out = { ...DEFAULT_SETTINGS };
  for (const r of db.prepare('SELECT key, value FROM settings').all()) out[r.key] = r.value;
  return out;
}
export function setSetting(key, value) {
  if (!(key in DEFAULT_SETTINGS)) return;
  setStmt.run(key, String(value));
}

export function log(kind, text) {
  db.prepare('INSERT INTO activity (kind, text) VALUES (?, ?)').run(kind, text);
}

// Convertit les lignes SQLite (objets sans prototype) en objets JSON normaux.
export const plain = (rows) => JSON.parse(JSON.stringify(rows));
