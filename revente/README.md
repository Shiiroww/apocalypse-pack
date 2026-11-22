# Revente

L'app qui gère la revente sur Vinted, Leboncoin, eBay, Depop et Shopify :
stock, ventes, messages de toutes les plateformes, réponses automatiques,
suivi de la marge. Toi, tu n'as plus qu'à expédier.

## Lancer l'app

Il faut Node.js 22.13 ou plus récent (https://nodejs.org).

```bash
cd revente
npm install
npm run demo     # avec des données d'exemple, pour découvrir
npm start        # pour de vrai
```

Ouvre ensuite http://localhost:3000. Le mot de passe s'affiche dans le
terminal au démarrage (ou mets le tien dans `APP_PASSWORD`, voir `.env.example`).

Sur le téléphone : ouvre l'adresse de l'app dans Safari, puis
Partager → « Sur l'écran d'accueil ». Elle s'ouvre alors comme une vraie app.

## Ce qui marche déjà

- **Accueil** : chiffre d'affaires et objectif, bénéfice net (ventes − frais − lots achetés),
  délai de vente moyen, ventes par semaine et par plateforme, pièces qui ne bougent pas,
  journal de tout ce que le pilote automatique a fait.
- **Messages** : une seule boîte pour toutes les plateformes. Bouton « Tester une réponse »
  pour simuler un acheteur.
- **Réponses automatiques sans validation** : dispo, taille, mesures, état, authenticité,
  envoi, lots, offres (contre-offre automatique, jamais sous le prix plancher),
  tentatives de sortir de la plateforme (refus poli). Ce qui reste (demande de photo,
  mesures manquantes…) arrive dans « Pour toi ».
- **Stock** : fiche unique par article, choix des plateformes où il est publié.
- **Vente** : quand un article est vendu sur une plateforme, il passe « à retirer »
  sur toutes les autres, automatiquement.
- **À expédier** : la liste des colis à préparer.
- **Réglages** : pilote automatique, IA, objectif, remise lot, délai d'envoi, lots achetés, thème.

## Économiser l'IA

1. Les messages courants sont traités par des modèles de réponse : **0 token**.
2. L'IA n'est appelée que pour le reste, avec un contexte court (infos de l'article +
   6 derniers messages) et des réponses de 1 à 3 phrases.
3. Limite d'appels par jour réglable, compteur de tokens dans les réglages.
4. Le modèle est au choix dans les réglages (Opus, Sonnet ou Haiku, du plus cher au moins cher).
5. Garde-fous sur chaque réponse IA : jamais de prix sous le plancher, jamais de contact
   hors plateforme ; sinon le message passe dans « Pour toi ».

## Prochaine étape : les connexions

Le code de chaque plateforme est dans `lib/connectors/index.js`. Tant qu'une plateforme
n'est pas branchée, les réponses sont enregistrées « en attente d'envoi » et partent dès
qu'elle l'est.

- eBay : API officielle.
- Shopify : API officielle.
- Vinted, Leboncoin : accès pro selon ce que le compte pro donne, sinon lecture des
  notifications e-mail.
- Depop : notifications e-mail.

Pour l'utiliser depuis n'importe où (pas seulement en Wi-Fi à la maison), il faudra
héberger l'app en ligne ou passer par un accès sécurisé au PC.
