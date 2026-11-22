// Connecteurs vers les plateformes de vente.
//
// Chaque connecteur expose la même interface. Tant qu'une plateforme n'est pas
// branchée, ses fonctions renvoient { ok: false } et l'action reste dans la file
// d'attente de l'app (message "en attente", annonce "à retirer").
//
// Branchement prévu :
//  - eBay     : API officielle (OAuth) — messages, annonces, commandes.
//  - Vinted   : accès Vinted Pro si disponible pour le compte, sinon lecture des
//               notifications e-mail (Gmail) et lien direct vers la conversation.
//  - Leboncoin: idem (Leboncoin Pro, sinon notifications e-mail).
//  - Depop    : notifications e-mail, puis API si un accès partenaire est obtenu.
//  - Shopify  : API officielle (Admin GraphQL) — boutique en propre.

export const PLATFORMS = {
  vinted:    { name: 'Vinted',    color: '#09B1BA', fee_pct: 0,  note: 'Frais côté vendeur pro à confirmer à l\'ouverture du compte pro' },
  leboncoin: { name: 'Leboncoin', color: '#EC5A13', fee_pct: 0,  note: 'Frais pro à confirmer' },
  ebay:      { name: 'eBay',      color: '#E53238', fee_pct: 13, note: 'Estimation pour un compte pro, à ajuster' },
  depop:     { name: 'Depop',     color: '#FF2300', fee_pct: 0,  note: 'Frais à confirmer pour la France' },
  shopify:   { name: 'Shopify',   color: '#5E8E3E', fee_pct: 2,  note: 'Frais de paiement, selon l\'abonnement' },
};

function makeConnector(id) {
  return {
    id,
    ...PLATFORMS[id],
    // Renseigné demain lors des connexions (jetons OAuth, accès e-mail…)
    isConnected() {
      return Boolean(process.env[`${id.toUpperCase()}_TOKEN`]);
    },
    async fetchMessages() {
      return { ok: false, reason: 'non connecté', messages: [] };
    },
    async sendMessage(/* conversation, text */) {
      return { ok: false, reason: 'non connecté' };
    },
    async delist(/* listing */) {
      return { ok: false, reason: 'non connecté' };
    },
    async publish(/* item */) {
      return { ok: false, reason: 'non connecté' };
    },
  };
}

export const connectors = Object.fromEntries(Object.keys(PLATFORMS).map((id) => [id, makeConnector(id)]));

export function platformList() {
  return Object.values(connectors).map((c) => ({
    id: c.id, name: c.name, color: c.color, fee_pct: c.fee_pct, note: c.note, connected: c.isConnected(),
  }));
}
