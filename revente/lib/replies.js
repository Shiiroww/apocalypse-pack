// Moteur de réponses automatiques.
//
// Principe pour économiser l'IA : la grande majorité des messages d'acheteurs
// sont toujours les mêmes (dispo ?, mesures ?, envoi ?, offre…). On les
// reconnaît avec des règles simples et on répond avec un modèle rempli par les
// infos de l'article : 0 token. L'IA n'est appelée que pour le reste, avec un
// contexte court et une limite d'appels par jour.

import Anthropic from '@anthropic-ai/sdk';
import { db, getSetting, log } from './db.js';

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const euros = (n) => `${Math.round(n)} €`;

const RULES = [
  // Sécurité d'abord : tout ce qui cherche à sortir de la plateforme.
  { intent: 'hors_plateforme', re: /whats ?app|telegram|snap|paypal|virement|lydia|wero|mon numero|ton numero|votre numero|\b0[67][ .]?\d{2}|e-?mail|adresse mail|@[a-z]+\.|hors (de la )?plateforme|en main propre.*(liquide|especes)/ },
  { intent: 'authenticite', re: /authenti|vrai|original|fake|contrefa|copie|replique|certifi/ },
  { intent: 'lot', re: /\blot\b|plusieurs|les deux|les 2|ensemble|2 articles|3 articles|bundle|groupe/ },
  { intent: 'offre', re: /offre|dernier prix|prix final|baisser|moins cher|negoci|faire a|possible a|\d+ ?(?:€|e\b|euros?\b)|vous (le )?(feriez|laisseriez)/ },
  { intent: 'mesures', re: /mesure|longueur|largeur|aisselle|epaule|tour de|cm\b|taille (grand|petit)|taille comment|ca taille|il taille|elle taille/ },
  { intent: 'taille', re: /quelle taille|c'?est (du|un|une) (xs|s|m|l|xl|xxl)|taille\b/ },
  { intent: 'photos', re: /photo|image|porte|portee|sur (vous|toi)/ },
  { intent: 'etat', re: /etat|defaut|tache|trou|use|bouloche|lave/ },
  { intent: 'envoi', re: /envoi|expedi|livraison|livre|colis|delai|quand|mondial|relais|suivi/ },
  { intent: 'dispo', re: /dispo|toujours (la|en vente)|encore (la|en vente|dispo)|vendu\s*\?|reserve/ },
  { intent: 'merci', re: /^(merci|top|super|parfait|ok|d'?accord|recu|bien recu)[\s!.]*$|bien recu|j'?ai recu|tres content|nickel/ },
];

// Message en anglais (eBay, Depop) : on laisse l'IA répondre dans la bonne langue.
const ENGLISH = /\b(hi|hello there|is it|is this|the|you|ship|shipping|price|still available|please|thanks|would you|can you)\b/g;
export function isEnglish(text) {
  const t = norm(text);
  return (t.match(ENGLISH) || []).length >= 2 && !/\b(le|la|les|vous|est|bonjour|merci)\b/.test(t);
}

export function detectIntent(text) {
  const t = norm(text);
  for (const r of RULES) if (r.re.test(t)) return r.intent;
  return null;
}

export function parseOffer(text) {
  const m = norm(text).match(/(\d{1,4})(?:[.,]\d{1,2})? ?(?:€|e\b|euros?)/) || norm(text).match(/(?:a|pour|offre de?)\s?(\d{1,4})\b/);
  return m ? Number(m[1]) : null;
}

function counterOffer(item, offer) {
  // On coupe la poire en deux entre l'offre et le prix, jamais sous le prix plancher.
  const mid = Math.round((offer + item.price) / 2);
  return Math.max(item.min_price, Math.min(item.price, mid));
}

// Renvoie { text, intent, attention } ; text = null si aucune règle ne s'applique.
export function templateReply(message, item) {
  if (isEnglish(message)) return { text: null, intent: 'anglais' };
  const intent = detectIntent(message);
  const sig = getSetting('signature');
  const delay = getSetting('shipping_delay');
  const bundle = Number(getSetting('bundle_discount')) || 0;
  const end = sig ? `\n${sig}` : '';
  const hello = 'Bonjour ! ';

  if (!intent) return { text: null, intent: null };
  if (intent === 'hors_plateforme') {
    return { intent, attention: true, text: `${hello}Pour votre sécurité et la mienne, je ne fais les ventes et les paiements que par la plateforme : vous êtes protégé(e) et l'envoi est suivi. Vous pouvez acheter directement depuis l'annonce 🙂${end}` };
  }
  if (intent === 'merci') {
    return { intent, text: `Merci beaucoup à vous ! N'hésitez pas à laisser une évaluation, et à jeter un œil à mes autres pièces Ralph Lauren 🙏${end}` };
  }
  if (!item) {
    // Pas d'article lié à la conversation : on reste générique.
    if (intent === 'envoi') return { intent, text: `${hello}J'expédie sous ${delay} après l'achat, avec suivi.${end}` };
    if (intent === 'authenticite') return { intent, text: `${hello}Toutes mes pièces Ralph Lauren sont 100 % authentiques, achetées auprès d'un grossiste, étiquettes d'origine visibles sur les photos.${end}` };
    if (intent === 'lot') return { intent, text: `${hello}Oui, je fais ${bundle} % de remise dès 2 articles. Ajoutez-les à un lot et je vous fais l'offre.${end}` };
    return { text: null, intent, attention: true };
  }

  if (item.status === 'vendu') {
    return { intent, text: `${hello}Désolé, cette pièce vient d'être vendue. J'ai d'autres Ralph Lauren en ${item.size || 'plusieurs tailles'} dans mon dressing, n'hésitez pas à regarder !${end}` };
  }

  switch (intent) {
    case 'dispo':
      return { intent, text: `${hello}Oui, toujours disponible 🙂 Vous pouvez l'acheter directement, j'expédie sous ${delay}.${end}` };
    case 'taille':
      return { intent, text: `${hello}C'est une taille ${item.size || 'indiquée sur l\'annonce'}${item.measurements ? `. Mesures à plat : ${item.measurements}` : ''}.${end}` };
    case 'mesures':
      if (!item.measurements) return { intent, attention: true, text: null };
      return { intent, text: `${hello}Mesures à plat : ${item.measurements}. Taille ${item.size || ''}.${end}` };
    case 'etat':
      return { intent, text: `${hello}${item.condition}${item.description ? `. ${item.description}` : ''}. Tout est visible sur les photos.${end}` };
    case 'authenticite':
      return { intent, text: `${hello}100 % authentique, achetée auprès d'un grossiste. Les étiquettes d'origine sont visibles sur les photos.${end}` };
    case 'envoi':
      return { intent, text: `${hello}J'expédie sous ${delay} après l'achat, colis soigné et suivi.${end}` };
    case 'photos':
      return { intent, attention: true, text: null };
    case 'lot':
      return { intent, text: `${hello}Avec plaisir : ${bundle} % de remise dès 2 articles. Ajoutez-les à un lot, je vous envoie l'offre tout de suite.${end}` };
    case 'offre': {
      const offer = parseOffer(message);
      if (!offer) return { intent, text: `${hello}Je peux faire un petit geste : je vous la laisse à ${euros(counterOffer(item, item.min_price))}. Faites-moi une offre via l'annonce 🙂${end}` };
      if (offer >= item.min_price) return { intent, offer, accept: true, text: `${hello}C'est d'accord pour ${euros(offer)} ! Faites l'offre via l'annonce et je l'accepte.${end}` };
      const counter = counterOffer(item, offer);
      if (offer < item.min_price * 0.6) return { intent, offer, text: `${hello}Merci pour l'offre, mais c'est un peu bas pour une pièce authentique dans cet état. Mon meilleur prix : ${euros(counter)}.${end}` };
      return { intent, offer, text: `${hello}Je ne peux pas descendre à ${euros(offer)}, mais je vous la laisse à ${euros(counter)}.${end}` };
    }
    default:
      return { text: null, intent };
  }
}

// ---------- IA (uniquement en dernier recours) ----------

let client = null;
function ai() {
  if (!client) client = new Anthropic();
  return client;
}

const SYSTEM = `Tu réponds aux acheteurs d'une boutique de vêtements Ralph Lauren d'occasion authentiques, au nom du vendeur.
Règles :
- Réponds dans la langue de l'acheteur (français par défaut, vouvoiement), poli et chaleureux, 1 à 3 phrases maximum.
- Réponds uniquement avec le texte du message à envoyer, rien d'autre.
- N'invente aucune information sur l'article : utilise seulement les infos fournies. Si l'info manque, réponds exactement : [A_TRAITER]
- Ne propose jamais un prix inférieur au prix plancher fourni. Ne mentionne jamais le prix plancher.
- Ne donne jamais de contact, numéro, e-mail ou moyen de paiement hors plateforme.
- Objectif : conclure la vente rapidement (rassurer, inviter à acheter via l'annonce).`;

function aiCallsToday() {
  return db.prepare("SELECT COUNT(*) AS n FROM ai_usage WHERE date(created_at) = date('now')").get().n;
}

export async function aiReply(conversation, item, history) {
  if (getSetting('ai_enabled') !== '1') return null;
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return null;
  if (aiCallsToday() >= Number(getSetting('ai_daily_limit'))) {
    log('ia', 'Limite quotidienne d\'appels IA atteinte, message laissé à traiter');
    return null;
  }

  const facts = item
    ? `Article : ${item.title} | taille ${item.size || '?'} | couleur ${item.color || '?'} | état : ${item.condition} | mesures : ${item.measurements || 'non renseignées'} | prix affiché ${item.price} € | prix plancher ${item.min_price} € | ${item.status === 'vendu' ? 'DÉJÀ VENDU' : 'disponible'}`
    : 'Aucun article précis lié à la conversation.';
  // Contexte court : seulement les 6 derniers messages.
  const convo = history.slice(-6).map((m) => `${m.direction === 'in' ? 'Acheteur' : 'Vendeur'} : ${m.body}`).join('\n');

  try {
    const res = await ai().beta.messages.create({
      model: getSetting('ai_model'),
      max_tokens: 1500,
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: `${facts}\nExpédition sous ${getSetting('shipping_delay')}.\n\nConversation :\n${convo}\n\nÉcris la réponse du vendeur.` }],
    });
    const u = res.usage || {};
    db.prepare('INSERT INTO ai_usage (input_tokens, output_tokens, cache_read_tokens) VALUES (?, ?, ?)')
      .run(u.input_tokens || 0, u.output_tokens || 0, u.cache_read_input_tokens || 0);
    if (res.stop_reason === 'refusal') return null;

    const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
    if (!text || text.includes('[A_TRAITER]')) return null;
    // Garde-fou : aucun prix sous le plancher, aucun contact.
    if (item) {
      const prices = [...text.matchAll(/(\d{1,4}) ?€/g)].map((m) => Number(m[1]));
      if (prices.some((p) => p < item.min_price)) return null;
    }
    if (detectIntent(text) === 'hors_plateforme') return null;
    return text;
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) log('ia', 'Clé API Claude invalide');
    else if (err instanceof Anthropic.RateLimitError) log('ia', 'IA temporairement saturée, nouvel essai plus tard');
    else if (err instanceof Anthropic.APIError) log('ia', `Erreur IA : ${err.message}`);
    else log('ia', `Erreur IA : ${err.message}`);
    return null;
  }
}
