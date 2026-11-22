// Entretien quotidien : ménage des ventes anciennes + sauvegarde de la base.
import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { db, getSetting, setSetting, log, plain } from './db.js';

export const PHOTO_DIR = path.resolve('data/photos');
const BACKUP_DIR = path.resolve('data/backups');
mkdirSync(PHOTO_DIR, { recursive: true });
mkdirSync(BACKUP_DIR, { recursive: true });

export function deletePhotoFile(photo) {
  if (!photo || !photo.startsWith('/photos/')) return;
  const file = path.join(PHOTO_DIR, path.basename(photo));
  if (existsSync(file)) unlinkSync(file);
}

// Articles vendus ET expédiés depuis plus de N jours : on supprime ce qui prend de la place
// (conversations, photo, annonces) mais on garde la ligne de vente pour les chiffres et la compta.
export function purgeOldSales() {
  const days = Number(getSetting('purge_days'));
  if (!days || days < 1) return 0;
  const items = plain(db.prepare(`SELECT DISTINCT i.id, i.photo FROM items i JOIN sales s ON s.item_id = i.id
    WHERE i.status = 'vendu' AND s.status != 'a_expedier' AND julianday('now') - julianday(s.sold_at) >= ?
    AND (i.photo IS NOT NULL OR i.description IS NOT NULL
      OR EXISTS (SELECT 1 FROM conversations c WHERE c.item_id = i.id)
      OR EXISTS (SELECT 1 FROM listings l WHERE l.item_id = i.id))`).all(days));
  for (const it of items) {
    db.prepare('DELETE FROM conversations WHERE item_id = ?').run(it.id);
    db.prepare('DELETE FROM listings WHERE item_id = ?').run(it.id);
    deletePhotoFile(it.photo);
    db.prepare('UPDATE items SET photo = NULL, description = NULL WHERE id = ?').run(it.id);
  }
  // Conversations sans article ni nouveau message depuis N jours
  const r = db.prepare("DELETE FROM conversations WHERE item_id IS NULL AND unread != 2 AND julianday('now') - julianday(updated_at) >= ?").run(days);
  db.prepare("DELETE FROM activity WHERE julianday('now') - julianday(created_at) >= 60").run();
  if (items.length || r.changes) log('menage', `Ménage : ${items.length} vente(s) archivée(s), ${r.changes} vieille(s) conversation(s) supprimée(s)`);
  return items.length;
}

export function backup() {
  const day = new Date().toISOString().slice(0, 10);
  const file = path.join(BACKUP_DIR, `revente-${day}.db`);
  if (!existsSync(file)) db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  const all = readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.db')).sort();
  for (const f of all.slice(0, Math.max(0, all.length - 14))) unlinkSync(path.join(BACKUP_DIR, f));
}

export function dailyMaintenance() {
  const today = new Date().toISOString().slice(0, 10);
  if (getSetting('last_maintenance') === today) return;
  setSetting('last_maintenance', today);
  try { backup(); } catch (err) { log('erreur', `Sauvegarde : ${err.message}`); }
  try { purgeOldSales(); } catch (err) { log('erreur', `Ménage : ${err.message}`); }
}
