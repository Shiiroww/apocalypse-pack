// Interface de l'app (sans framework).
const $ = (s, el = document) => el.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (n, d = 0) => `${Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d })}\u00a0€`;
const icon = (d) => `<svg viewBox="0 0 24 24"><path d="${d}"/></svg>`;
const I = {
  box: 'M12 3 4 7v10l8 4 8-4V7zM4 7l8 4 8-4M12 11v10',
  msg: 'M4 5h16v11H8l-4 4z',
  truck: 'M3 7h13v10H3zM16 10h3l2 3v4h-5',
  x: 'M6 6l12 12M18 6 6 18',
  send: 'M5 12h14M13 6l6 6-6 6',
  plus: 'M12 5v14M5 12h14',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  chev: 'M9 6l6 6-6 6',
  back: 'M15 6l-6 6 6 6',
  bolt: 'M13 3 4 14h7l-1 7 9-11h-7z',
  tag: 'M3 12V3h9l9 9-9 9zM7.5 7.5h.01',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  sparkle: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6',
};

let PLATFORMS = [];

// Réduit la photo avant l'envoi (plus rapide depuis le téléphone, moins de place sur le PC).
function shrinkImage(file, max = 1280) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
const P = (id) => PLATFORMS.find((p) => p.id === id) || { name: id, color: '#8e8e93' };

async function api(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { 'Content-Type': 'application/json' }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && url !== '/api/login') { showLogin(); throw new Error('Non connecté'); }
  if (!res.ok) throw new Error(data.error || 'Erreur');
  return data;
}

function toast(text) {
  const t = $('#toast');
  t.textContent = text; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2600);
}

function ago(iso) {
  const d = (Date.now() - new Date(iso.replace(' ', 'T') + 'Z')) / 1000;
  if (d < 60) return 'à l\'instant';
  if (d < 3600) return `il y a ${Math.floor(d / 60)} min`;
  if (d < 86400) return `il y a ${Math.floor(d / 3600)} h`;
  if (d < 172800) return 'hier';
  return new Date(iso.replace(' ', 'T') + 'Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

// ---------- Feuille modale ----------
function sheet({ title, html, action = 'OK', onSubmit, onOpen }) {
  const bd = $('#sheet');
  const el = $('.sheet', bd);
  el.innerHTML = `<form><div class="sheet-head"><button type="button" class="linkbtn l" data-close>Annuler</button><h3>${esc(title)}</h3>
    <button class="linkbtn b r" type="submit">${esc(action)}</button></div><div class="body">${html}</div></form>`;
  bd.hidden = false;
  const close = () => { bd.hidden = true; el.innerHTML = ''; };
  bd.onclick = (e) => { if (e.target === bd || e.target.closest('[data-close]')) close(); };
  $('form', el).onsubmit = async (e) => {
    e.preventDefault();
    try { if ((await onSubmit(new FormData(e.target), e.target)) !== false) close(); } catch (err) { toast(err.message); }
  };
  onOpen?.(el);
}

// ---------- Connexion ----------
function showLogin() {
  $('#app').hidden = true; $('#login').hidden = false;
  $('#login input').focus();
}
$('#login-form').onsubmit = async (e) => {
  e.preventDefault();
  try {
    await api('/api/login', { method: 'POST', body: { password: e.target.password.value } });
    e.target.reset(); $('#login-error').textContent = '';
    start();
  } catch (err) { $('#login-error').textContent = err.message; }
};

// ---------- Navigation ----------
const views = { '': home, messages, stock, ventes: sales, reglages: settings };
async function route() {
  const [, name = '', id] = location.hash.replace(/^#\/?/, '/').split('/');
  const key = name in views ? name : '';
  const viewName = { '': 'home', messages: 'messages', stock: 'stock', ventes: 'sales', reglages: 'settings' }[key];
  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.view === viewName));
  $('#view').classList.remove('thread-open');
  try { await views[key](id); } catch (err) { if (err.message !== 'Non connecté') $('#view').innerHTML = `<div class="empty">${esc(err.message)}</div>`; }
  refreshBadges();
}
window.addEventListener('hashchange', route);

async function refreshBadges() {
  try {
    const d = await api('/api/dashboard');
    const set = (id, n) => { const b = $(id); b.hidden = !n; b.textContent = n; };
    set('#badge-messages', d.to_handle);
    set('#badge-sales', d.to_ship);
  } catch {}
}

// ---------- Accueil ----------
async function home() {
  const [d, act] = await Promise.all([api('/api/dashboard'), api('/api/activity')]);
  const pct = Math.min(100, (d.revenue / d.goal) * 100);
  const maxW = Math.max(1, ...d.weekly.map((w) => w.revenue));
  const maxP = Math.max(1, ...d.by_platform.map((p) => p.revenue));
  const totalReplies = d.ai.template_replies + d.ai.ai_replies + d.ai.manual_replies;
  const autoPct = totalReplies ? Math.round(((d.ai.template_replies + d.ai.ai_replies) / totalReplies) * 100) : 0;
  const feedIco = { vente: ['var(--green)', I.tag], reponse: ['var(--blue)', I.msg], attention: ['var(--orange)', I.alert], retrait: ['var(--indigo)', I.x], ia: ['var(--indigo)', I.sparkle], stock: ['#8e8e93', I.box], erreur: ['var(--red)', I.alert] };

  $('#view').innerHTML = `
  <div class="head"><div><h1>Bonjour 👋</h1><p class="muted">${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</p></div></div>

  <div class="card hero">
    <div class="row"><span class="muted">Chiffre d'affaires</span><span class="muted">Objectif ${eur(d.goal)}</span></div>
    <div class="big num">${eur(d.revenue)}</div>
    <div class="progress"><i style="width:${pct}%"></i></div>
    <div class="row small"><span class="muted">${Math.round(pct)} % de l'objectif · ${d.sold} pièce${d.sold > 1 ? 's' : ''} vendue${d.sold > 1 ? 's' : ''}</span>
      <span class="muted">Encore ${eur(Math.max(0, d.goal - d.revenue))}</span></div>
    <div class="todo">
      <a href="#/ventes"><span class="ico" style="background:var(--orange)">${icon(I.truck)}</span><span><strong class="num">${d.to_ship}</strong><span class="muted small">à expédier</span></span></a>
      <a href="#/messages"><span class="ico" style="background:var(--blue)">${icon(I.msg)}</span><span><strong class="num">${d.to_handle}</strong><span class="muted small">message${d.to_handle > 1 ? 's' : ''} pour toi</span></span></a>
      <a href="#/stock"><span class="ico" style="background:var(--indigo)">${icon(I.x)}</span><span><strong class="num">${d.to_delist}</strong><span class="muted small">annonce${d.to_delist > 1 ? 's' : ''} à retirer</span></span></a>
    </div>
  </div>

  <div class="grid kpis" style="margin-top:14px">
    <div class="card kpi"><div class="label">Bénéfice net</div><div class="value num ${d.profit >= 0 ? 'pos' : 'neg'}">${d.profit >= 0 ? '+' : ''}${eur(d.profit)}</div><div class="sub">Investi ${eur(d.invested)} · frais ${eur(d.fees)}</div></div>
    <div class="card kpi"><div class="label">Stock en vente</div><div class="value num">${d.stock_count}</div><div class="sub">Valeur ${eur(d.stock_value)}</div></div>
    <div class="card kpi"><div class="label">Délai de vente moyen</div><div class="value num">${d.avg_days == null ? '—' : `${d.avg_days} j`}</div><div class="sub">De la mise en ligne à la vente</div></div>
    <div class="card kpi"><div class="label">Réponses automatiques</div><div class="value num">${autoPct} %</div><div class="sub">${d.ai.template_replies} modèles · ${d.ai.ai_replies} IA ce mois</div></div>
  </div>

  <div class="grid two" style="margin-top:14px">
    <div class="card"><div class="kpi"><div class="label">Ventes par semaine</div></div>
      ${d.weekly.length ? `<div class="bars">${d.weekly.map((w) => `<div title="${eur(w.revenue)} · ${w.n} vente(s)"><i style="height:${(w.revenue / maxW) * 100}%"></i><span>${new Date(w.week).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span></div>`).join('')}</div>` : '<div class="empty">Pas encore de ventes</div>'}
    </div>
    <div class="card"><div class="kpi"><div class="label">Par plateforme</div></div>
      <div class="plat">${d.by_platform.length ? d.by_platform.map((p) => `<div class="plat-row"><span><span class="dot" style="background:${p.color}"></span> ${esc(p.name)}</span>
        <span class="num">${eur(p.revenue)} <span class="muted small">· ${p.n} · ${p.days == null ? '' : `${Math.round(p.days * 10) / 10} j`}</span></span>
        <span class="meter"><i style="width:${(p.revenue / maxP) * 100}%;background:${p.color}"></i></span></div>`).join('') : '<div class="empty">Pas encore de ventes</div>'}</div>
    </div>
  </div>

  <div class="grid two">
    <div>
      <div class="section-title">Pièces qui ne bougent pas</div>
      <div class="list">${d.stale.length ? d.stale.map((s) => `<a class="row tappable" href="#/stock/${s.id}"><div class="grow"><div class="title">${esc(s.title)}</div>
        <div class="sub">Taille ${esc(s.size || '?')} · en ligne depuis ${s.age} jours</div></div><div class="end"><div class="num">${eur(s.price)}</div>
        <div class="small muted">baisser à ${eur(Math.max(s.min_price, Math.round(s.price * 0.9)))} ?</div></div></a>`).join('') : '<div class="empty">Tout tourne bien 👌</div>'}</div>
    </div>
    <div>
      <div class="section-title">Ce que le pilote automatique a fait</div>
      <div class="list feed">${act.length ? act.slice(0, 12).map((a) => { const [c, p] = feedIco[a.kind] || ['#8e8e93', I.bolt]; return `<div class="row"><span class="ico" style="background:${c}">${icon(p)}</span>
        <div class="grow"><div style="white-space:normal">${esc(a.text)}</div><div class="sub">${ago(a.created_at)}</div></div></div>`; }).join('') : '<div class="empty">Rien pour l\'instant</div>'}</div>
    </div>
  </div>`;
}

// ---------- Messages ----------
async function messages(id) {
  const convs = await api('/api/conversations');
  const authorLabel = { auto: 'Réponse auto', ia: 'Réponse IA', moi: 'Toi', acheteur: '' };
  $('#view').innerHTML = `
  <div class="head"><div><h1>Messages</h1><p class="muted">Toutes les plateformes au même endroit</p></div>
    <button class="btn" id="test-msg">${icon(I.sparkle)} Tester une réponse</button></div>
  <div class="inbox ${id ? 'open' : ''}">
    <div class="list">${convs.length ? convs.map((c) => `<a class="row tappable" href="#/messages/${c.id}" ${String(c.id) === id ? 'style="background:var(--fill)"' : ''}>
      <span class="avatar" style="background:${P(c.platform).color}">${esc(c.buyer[0]?.toUpperCase())}</span>
      <div class="grow"><div class="title">${esc(c.buyer)} <span class="muted small">· ${esc(P(c.platform).name)}</span></div>
      <div class="sub">${c.last_author && c.last_author !== 'acheteur' ? `${authorLabel[c.last_author]} : ` : ''}${esc(c.last)}</div></div>
      <div class="end">${c.unread === 2 ? '<span class="pill orange">Pour toi</span>' : c.unread ? '<span class="unread-dot"></span>' : `<span class="small muted">${ago(c.updated_at)}</span>`}</div></a>`).join('') : '<div class="empty">Aucun message. Ils arriveront ici dès que les plateformes seront connectées.</div>'}</div>
    <div class="thread" id="thread"><div class="empty" style="margin:auto">Choisis une conversation</div></div>
  </div>`;
  $('#test-msg').onclick = testMessage;
  $('#view').classList.toggle('thread-open', Boolean(id));
  if (!id) return;

  const c = await api(`/api/conversations/${id}`);
  const t = $('#thread');
  t.innerHTML = `
    <div class="thread-head"><a href="#/messages" class="linkbtn">${icon(I.back)}</a>
      <span class="avatar" style="background:${P(c.platform).color}">${esc(c.buyer[0]?.toUpperCase())}</span>
      <div class="grow"><div class="title">${esc(c.buyer)}</div><div class="sub">${esc(P(c.platform).name)}${c.item_title ? ` · ${esc(c.item_title)} · ${eur(c.item_price)} (plancher ${eur(c.item_min)})` : ''}</div></div></div>
    <div class="bubbles">${c.messages.map((m) => `<div class="bubble ${m.direction} ${m.author === 'ia' ? 'ia' : ''}">${esc(m.body)}</div>
      ${m.direction === 'out' ? `<div class="meta r">${authorLabel[m.author]}${m.delivered ? '' : ' · en attente d\'envoi'}</div>` : ''}`).join('')}</div>
    <form class="compose"><textarea rows="1" name="body" placeholder="Message"></textarea><button class="btn primary" aria-label="Envoyer">${icon(I.send)}</button></form>`;
  const b = $('.bubbles', t); b.scrollTop = b.scrollHeight;
  const ta = $('textarea', t);
  ta.oninput = () => { ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight}px`; };
  $('form', t).onsubmit = async (e) => {
    e.preventDefault();
    if (!ta.value.trim()) return;
    const r = await api(`/api/conversations/${id}/reply`, { method: 'POST', body: { body: ta.value } });
    toast(r.delivered ? 'Envoyé' : 'Enregistré, envoyé dès que la plateforme sera connectée');
    messages(id); refreshBadges();
  };
}

async function testMessage() {
  const items = (await api('/api/items')).filter((i) => i.status !== 'vendu');
  sheet({
    title: 'Tester une réponse', action: 'Envoyer',
    html: `<p class="hint" style="margin:16px 0 8px">Simule un message d'acheteur pour voir comment l'app répond toute seule.</p>
      <div class="list"><div class="field"><label>Plateforme</label><select name="platform">${PLATFORMS.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Acheteur</label><input name="buyer" value="test_${Math.floor(Math.random() * 900 + 100)}"></div>
      <div class="field"><label>Article</label><select name="item_id"><option value="">Aucun</option>${items.map((i) => `<option value="${i.id}">${esc(i.title)} · ${esc(i.size || '')} · ${eur(i.price)}</option>`).join('')}</select></div>
      <div class="field stack"><label>Message</label><textarea name="body" required placeholder="Ex : Bonjour, vous la feriez à 35 € ?"></textarea></div></div>`,
    onSubmit: async (f) => {
      const r = await api('/api/test-message', { method: 'POST', body: Object.fromEntries(f) });
      location.hash = `#/messages/${r.id}`;
    },
  });
}

// ---------- Stock ----------
let stockFilter = 'en_vente';
async function stock(id) {
  const items = await api('/api/items');
  const render = () => {
    const q = ($('#q')?.value || '').toLowerCase();
    const list = items.filter((i) => (stockFilter === 'tout' || (stockFilter === 'vendu' ? i.status === 'vendu' : i.status !== 'vendu'))
      && `${i.title} ${i.size} ${i.color}`.toLowerCase().includes(q));
    $('#items').innerHTML = list.length ? list.map((i) => `<button class="row tappable" data-id="${i.id}">
      <span class="thumb">${i.photo ? `<img src="${esc(i.photo)}" alt="">` : icon(I.tag)}</span>
      <div class="grow"><div class="title">${esc(i.title)}</div><div class="sub">${esc([i.size && `Taille ${i.size}`, i.color].filter(Boolean).join(' · '))}</div>
        <div class="plats">${i.listings.map((l) => `<span class="dot ${l.status === 'retire' ? 'off' : ''}" title="${esc(P(l.platform).name)} : ${esc(l.status)}" style="background:${P(l.platform).color}"></span>`).join('')}</div></div>
      <div class="end"><div class="num" style="font-weight:600">${eur(i.price)}</div>${i.status === 'vendu' ? '<span class="pill green">Vendu</span>' : `<span class="small muted">mini ${eur(i.min_price)}</span>`}</div>
      ${icon(I.chev).replace('<svg', '<svg class="chev"')}</button>`).join('') : '<div class="empty">Aucun article</div>';
  };
  $('#view').innerHTML = `
  <div class="head"><div><h1>Stock</h1><p class="muted">${items.filter((i) => i.status !== 'vendu').length} en vente · ${items.filter((i) => i.status === 'vendu').length} vendus</p></div>
    <button class="btn primary" id="add">${icon(I.plus)} Ajouter</button></div>
  <div class="toolbar"><label class="search">${icon(I.search)}<input id="q" placeholder="Rechercher" type="search"></label>
    <div class="seg" id="seg">${[['en_vente', 'En vente'], ['vendu', 'Vendus'], ['tout', 'Tout']].map(([k, l]) => `<button data-k="${k}" class="${stockFilter === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
  <div class="list" id="items"></div>`;
  render();
  $('#q').oninput = render;
  $('#seg').onclick = (e) => { const k = e.target.dataset.k; if (!k) return; stockFilter = k; $('#seg').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.k === k)); render(); };
  $('#items').onclick = (e) => { const r = e.target.closest('[data-id]'); if (r) itemSheet(items.find((i) => i.id === Number(r.dataset.id))); };
  $('#add').onclick = () => itemSheet();
  if (id) { const it = items.find((i) => i.id === Number(id)); if (it) itemSheet(it); }
}

async function itemSheet(item) {
  const lots = await api('/api/lots');
  const v = item || { brand: 'Ralph Lauren', condition: 'Très bon état', listings: ['vinted', 'leboncoin', 'ebay', 'depop'].map((platform) => ({ platform })) };
  const on = new Set(v.listings.map((l) => l.platform));
  const sold = item?.status === 'vendu';
  let newPhoto = null;
  sheet({
    title: item ? 'Article' : 'Nouvel article', action: 'Enregistrer',
    html: `
    <div class="photo-pick">
      <label class="photo-box" for="photo-input">${v.photo ? `<img id="photo-preview" src="${esc(v.photo)}" alt="">` : `<span id="photo-empty">${icon(I.camera)}<span>Ajouter une photo</span></span><img id="photo-preview" alt="" hidden>`}</label>
      <input id="photo-input" type="file" accept="image/*" hidden>
    </div>
    <div class="section-title">Annonce</div>
    <div class="list">
      <div class="field stack"><label>Titre (avec les mots que les acheteurs tapent)</label><input name="title" required value="${esc(v.title)}" placeholder="Polo Ralph Lauren homme M bleu marine custom fit"></div>
      <div class="field"><label>Taille</label><input name="size" value="${esc(v.size)}" placeholder="M"></div>
      <div class="field"><label>Couleur</label><input name="color" value="${esc(v.color)}" placeholder="Bleu marine"></div>
      <div class="field"><label>Catégorie</label><input name="category" value="${esc(v.category)}" placeholder="Polo"></div>
      <div class="field"><label>État</label><select name="condition">${['Neuf avec étiquette', 'Neuf sans étiquette', 'Très bon état', 'Bon état', 'Satisfaisant'].map((c) => `<option ${c === v.condition ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
      <div class="field stack"><label>Mesures à plat (servent aux réponses automatiques)</label><input name="measurements" value="${esc(v.measurements)}" placeholder="Aisselle à aisselle 52 cm, longueur 72 cm"></div>
      <div class="field stack"><label>Description</label><textarea name="description">${esc(v.description)}</textarea></div>
    </div>
    <div class="section-title">Prix</div>
    <div class="list">
      <div class="field"><label>Prix affiché</label><input name="price" type="number" step="1" min="0" required value="${esc(v.price)}" placeholder="55"></div>
      <div class="field"><label>Prix plancher</label><input name="min_price" type="number" step="1" min="0" value="${esc(v.min_price)}" placeholder="auto : −15 %"></div>
      <div class="field"><label>Coût d'achat</label><input name="cost" type="number" step="0.01" min="0" value="${esc(v.cost)}" placeholder="0"></div>
      <div class="field"><label>Lot</label><select name="lot_id"><option value="">Aucun</option>${lots.map((l) => `<option value="${l.id}" ${l.id === v.lot_id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></div>
    </div>
    <p class="hint">Les réponses automatiques n'acceptent jamais une offre sous le prix plancher.</p>
    <div class="section-title">Publier sur</div>
    <div class="list"><div class="checks">${PLATFORMS.map((p) => `<label><input type="checkbox" name="platforms" value="${p.id}" ${on.has(p.id) ? 'checked' : ''}><span class="dot" style="background:${p.color}"></span>${esc(p.name)}</label>`).join('')}</div></div>
    ${item && !sold ? `<div style="display:grid;gap:10px;margin-top:22px"><button type="button" class="btn green wide" id="sell">Marquer comme vendu</button>
      <button type="button" class="btn danger wide" id="del">Supprimer l'article</button></div>` : ''}`,
    onSubmit: async (f) => {
      const b = Object.fromEntries(f); b.platforms = f.getAll('platforms');
      delete b.photo;
      if (b.min_price === '') delete b.min_price;
      let itemId = item?.id;
      if (item) await api(`/api/items/${item.id}`, { method: 'PUT', body: b }); else itemId = (await api('/api/items', { method: 'POST', body: b })).id;
      if (newPhoto) await api(`/api/items/${itemId}/photo`, { method: 'POST', body: { data: newPhoto } });
      toast(item ? 'Enregistré' : 'Article ajouté'); route();
    },
    onOpen: (el) => {
      $('#photo-input', el).onchange = async (e) => {
        const file = e.target.files[0]; if (!file) return;
        try {
          newPhoto = await shrinkImage(file);
          const img = $('#photo-preview', el); img.src = newPhoto; img.hidden = false;
          $('#photo-empty', el)?.remove();
        } catch { toast('Impossible de lire cette photo'); }
      };
      $('#sell', el)?.addEventListener('click', () => sellSheet(item));
      $('#del', el)?.addEventListener('click', async () => {
        if (!confirm('Supprimer cet article ?')) return;
        await api(`/api/items/${item.id}`, { method: 'DELETE' }); $('#sheet').hidden = true; toast('Supprimé'); route();
      });
    },
  });
}

function sellSheet(item) {
  const plats = item.listings.length ? item.listings.map((l) => l.platform) : PLATFORMS.map((p) => p.id);
  sheet({
    title: 'Vendu !', action: 'Valider',
    html: `<p class="hint" style="margin:16px 0 8px">${esc(item.title)}. L'article sera retiré automatiquement des autres plateformes.</p>
    <div class="list">
      <div class="field"><label>Vendu sur</label><select name="platform">${plats.map((p) => `<option value="${p}">${esc(P(p).name)}</option>`).join('')}</select></div>
      <div class="field"><label>Prix de vente</label><input name="price" type="number" step="0.01" required value="${esc(item.price)}"></div>
      <div class="field"><label>Frais</label><input name="fees" type="number" step="0.01" placeholder="auto"></div>
      <div class="field"><label>Acheteur</label><input name="buyer" placeholder="pseudo"></div>
    </div>`,
    onSubmit: async (f) => { await api(`/api/items/${item.id}/sell`, { method: 'POST', body: Object.fromEntries(f) }); toast('Vente enregistrée 🎉'); location.hash = '#/ventes'; },
  });
}

// ---------- À expédier ----------
async function sales() {
  const list = await api('/api/sales');
  const todo = list.filter((s) => s.status === 'a_expedier');
  const done = list.filter((s) => s.status !== 'a_expedier');
  const row = (s) => `<div class="row"><span class="avatar" style="background:${P(s.platform).color}">${esc(P(s.platform).name[0])}</span>
    <div class="grow"><div class="title">${esc(s.title)}</div><div class="sub">${esc(P(s.platform).name)}${s.buyer ? ` · ${esc(s.buyer)}` : ''} · ${ago(s.sold_at)}</div></div>
    <div class="end"><div class="num" style="font-weight:600">${eur(s.price)}</div>${s.status === 'a_expedier' ? `<button class="btn green" data-ship="${s.id}" style="margin-top:4px;padding:6px 12px">Expédié</button>` : '<span class="pill green">Expédié</span>'}</div></div>`;
  $('#view').innerHTML = `
  <div class="head"><div><h1>À expédier</h1><p class="muted">Ta seule mission : emballer et déposer 📦</p></div></div>
  <div class="list" id="todo">${todo.length ? todo.map(row).join('') : '<div class="empty">Rien à expédier pour l\'instant</div>'}</div>
  <div class="section-title">Historique</div>
  <div class="list">${done.length ? done.map(row).join('') : '<div class="empty">Aucune vente expédiée</div>'}</div>`;
  $('#todo').onclick = async (e) => {
    const b = e.target.closest('[data-ship]'); if (!b) return;
    await api(`/api/sales/${b.dataset.ship}/ship`, { method: 'POST' }); toast('Marqué comme expédié'); sales(); refreshBadges();
  };
}

// ---------- Réglages ----------
async function settings() {
  const [s, d, lots, net] = await Promise.all([api('/api/settings'), api('/api/dashboard'), api('/api/lots'), api('/api/network')]);
  const sw = (name, label, sub) => `<div class="field"><div class="grow"><div>${label}</div>${sub ? `<div class="small muted">${sub}</div>` : ''}</div>
    <label class="switch"><input type="checkbox" data-k="${name}" ${s[name] === '1' ? 'checked' : ''}><i></i></label></div>`;
  const inp = (name, label, type = 'text', extra = '') => `<div class="field"><label>${label}</label><input data-k="${name}" type="${type}" value="${esc(s[name])}" ${extra}></div>`;
  const theme = (() => { try { return localStorage.getItem('theme') || 'auto'; } catch { return 'auto'; } })();
  $('#view').innerHTML = `
  <div class="head"><div><h1>Réglages</h1></div></div>
  <div class="section-title">Plateformes</div>
  <div class="list">${PLATFORMS.map((p) => `<div class="row"><span class="avatar" style="background:${p.color}">${esc(p.name[0])}</span>
    <div class="grow"><div class="title">${esc(p.name)}</div><div class="sub">${esc(p.note)}</div></div>
    ${p.connected ? '<span class="pill green">Connecté</span>' : '<span class="pill">À connecter</span>'}</div>`).join('')}</div>
  <p class="hint">Les connexions se font à la prochaine étape. En attendant, les réponses sont préparées et partent dès qu'une plateforme est branchée.</p>

  <div class="section-title">Pilote automatique</div>
  <div class="list">
    ${sw('autopilot', 'Répondre tout seul', 'Les réponses partent sans validation')}
    ${sw('ai_enabled', 'Utiliser l\'IA en dernier recours', 'Seulement si aucun modèle de réponse ne convient')}
    <div class="field"><label>Modèle IA</label><select data-k="ai_model">${[['claude-opus-5-5', 'Claude Opus 5.5 (meilleure qualité)'], ['claude-sonnet-5-5', 'Claude Sonnet 5.5 (équilibré)'], ['claude-haiku-5-5', 'Claude Haiku 5.5 (le moins cher)']].map(([v, l]) => `<option value="${v}" ${s.ai_model === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    ${inp('ai_daily_limit', 'Max. appels IA / jour', 'number', 'min="0"')}
  </div>
  <p class="hint">Ce mois-ci : ${d.ai.calls} appel${d.ai.calls > 1 ? 's' : ''} IA, ${(d.ai.inp + d.ai.out).toLocaleString('fr-FR')} tokens. ${d.ai.template_replies} réponses faites par les modèles, sans IA.</p>

  <div class="section-title">Ventes</div>
  <div class="list">
    ${inp('shop_name', 'Nom de la boutique')}
    ${inp('goal_revenue', 'Objectif (€)', 'number', 'min="0"')}
    ${inp('bundle_discount', 'Remise lot (%)', 'number', 'min="0" max="50"')}
    ${inp('shipping_delay', 'Délai d\'envoi')}
    ${inp('stale_days', 'Alerte après (jours)', 'number', 'min="1"')}
    ${inp('signature', 'Signature')}
  </div>

  <div class="section-title">Lots achetés</div>
  <div class="list">${lots.map((l) => `<div class="row"><div class="grow"><div class="title">${esc(l.name)}</div><div class="sub">${esc(l.supplier || '')} · ${l.items} pièces · ${l.sold || 0} vendues</div></div>
    <div class="end"><div class="num">${eur(l.revenue)} <span class="muted">/ ${eur(l.cost)}</span></div><div class="small ${l.revenue - l.cost >= 0 ? 'pos' : 'muted'}">${l.revenue - l.cost >= 0 ? 'rentabilisé' : `reste ${eur(l.cost - l.revenue)} à rentrer`}</div></div></div>`).join('')}
    <button class="row tappable" id="add-lot" style="color:var(--blue)">${icon(I.plus)} Ajouter un lot</button></div>

  <div class="section-title">Sur ton téléphone</div>
  <div class="list"><div class="phone-card">
    ${net.qr ? `<div class="qr">${net.qr}</div>` : ''}
    <div class="grow">
      <div class="title">Ouvre l'app sur ton iPhone</div>
      <ol class="steps">
        <li>Connecte le téléphone au même Wi-Fi que ce PC.</li>
        <li>Scanne le QR code avec l'appareil photo, ou tape <b class="sel">${esc(net.urls[0] || 'l\'adresse affichée au démarrage')}</b> dans Safari.</li>
        <li>Dans Safari : Partager, puis « Sur l'écran d'accueil ».</li>
      </ol>
      ${net.urls.length > 1 ? `<div class="small muted">Autres adresses : ${net.urls.slice(1).map(esc).join(' · ')}</div>` : ''}
    </div>
  </div></div>
  <p class="hint">Depuis l'extérieur (4G), il faudra l'accès sécurisé qu'on installera avec toi.</p>

  <div class="section-title">Ménage automatique</div>
  <div class="list">
    ${inp('purge_days', 'Après (jours)', 'number', 'min="0"')}
    <button class="row tappable" id="purge" style="color:var(--blue)">Faire le ménage maintenant</button>
  </div>
  <p class="hint">Pour les ventes expédiées : conversations, photo et annonces supprimées. Le prix, la date et la plateforme restent pour tes chiffres. 0 = jamais. Une sauvegarde de la base est faite chaque jour (14 jours gardés).</p>

  <div class="section-title">Apparence</div>
  <div class="list"><div class="field"><label>Thème</label><div class="seg" id="theme">${[['auto', 'Auto'], ['light', 'Clair'], ['dark', 'Sombre']].map(([k, l]) => `<button type="button" data-k="${k}" class="${theme === k ? 'on' : ''}">${l}</button>`).join('')}</div></div></div>

  <div class="list" style="margin-top:28px"><button class="row tappable" id="logout" style="color:var(--red);justify-content:center">Se déconnecter</button></div>`;

  $('#view').onchange = async (e) => {
    const k = e.target.dataset.k; if (!k) return;
    const value = e.target.type === 'checkbox' ? (e.target.checked ? '1' : '0') : e.target.value;
    await api('/api/settings', { method: 'PUT', body: { [k]: value } }); toast('Enregistré');
    if (k === 'shop_name') $('#shop-name').textContent = value;
  };
  $('#theme').onclick = (e) => {
    const k = e.target.dataset.k; if (!k) return;
    try { localStorage.setItem('theme', k); } catch {}
    applyTheme(); settings();
  };
  $('#add-lot').onclick = () => sheet({
    title: 'Nouveau lot', action: 'Ajouter',
    html: `<div class="list" style="margin-top:16px"><div class="field"><label>Nom</label><input name="name" required placeholder="Lot Ralph Lauren n°2"></div>
      <div class="field"><label>Fournisseur</label><input name="supplier" placeholder="Grossiste"></div>
      <div class="field"><label>Prix payé (€)</label><input name="cost" type="number" step="0.01" required></div></div>`,
    onSubmit: async (f) => { await api('/api/lots', { method: 'POST', body: Object.fromEntries(f) }); toast('Lot ajouté'); settings(); },
  });
  $('#purge').onclick = async () => { const r = await api('/api/maintenance/purge', { method: 'POST' }); toast(r.archived ? `${r.archived} vente(s) archivée(s)` : 'Rien à nettoyer'); };
  $('#logout').onclick = async () => { await api('/api/logout', { method: 'POST' }); showLogin(); };
}

function applyTheme() {
  let t = 'auto'; try { t = localStorage.getItem('theme') || 'auto'; } catch {}
  if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = t;
}

async function start() {
  applyTheme();
  try {
    const me = await api('/api/me');
    $('#shop-name').textContent = me.shop;
    PLATFORMS = await api('/api/platforms');
    $('#login').hidden = true; $('#app').hidden = false;
    route();
    clearInterval(start.t); start.t = setInterval(() => { if (!document.hidden && $('#sheet').hidden) refreshBadges(); }, 30_000);
  } catch {}
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
start();
