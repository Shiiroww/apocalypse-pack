# Revente

L'app qui gère la revente sur Vinted, Leboncoin, eBay, Depop et Shopify :
stock, ventes, messages de toutes les plateformes, réponses automatiques,
suivi de la marge. Toi, tu n'as plus qu'à expédier.

## Installer sur le PC (Windows 10 ou 11)

1. Télécharge le code : sur GitHub, ouvre la branche
   `claude/multi-account-app-dashboard-x6mcqd`, bouton **Code → Download ZIP**.
2. Dézippe-le où tu veux (par exemple `C:\Revente`), puis ouvre le dossier `revente`.
3. Double-clique sur **`INSTALLER.bat`**. Il installe ce qu'il faut, te demande un mot de passe,
   crée l'icône **Revente** sur le Bureau et lance l'app au démarrage de Windows.
4. Si Windows affiche « Windows a protégé votre ordinateur » : « Informations complémentaires »,
   puis « Exécuter quand même ».
5. Si le pare-feu demande l'autorisation : coche **Réseaux privés** et clique **Autoriser**
   (c'est ce qui permet au téléphone de s'y connecter).

Ensuite, l'icône **Revente** du Bureau ouvre l'app dans sa propre fenêtre.
Pour l'arrêter : `windows\ARRETER.bat`.

## Sur l'iPhone

Dans l'app sur le PC : **Réglages → Sur ton téléphone**. Scanne le QR code avec l'appareil
photo (téléphone sur le même Wi-Fi que le PC), connecte-toi, puis dans Safari :
Partager → **Sur l'écran d'accueil**. L'app a alors son icône et s'ouvre en plein écran.
Les photos des articles peuvent être prises directement avec le téléphone.

## Pour les développeurs

```bash
cd revente
npm install
npm run demo     # avec des données d'exemple
npm start
```

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
- **Photos** : prises avec le téléphone ou choisies sur le PC, réduites automatiquement.
- **Ménage automatique** : 15 jours après l'expédition, les conversations, la photo et les
  annonces d'un article vendu sont supprimées ; la vente reste dans les chiffres.
- **Sauvegarde** : copie de la base chaque jour dans `data/backups` (14 jours gardés).

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

Pour l'utiliser en 4G (pas seulement en Wi-Fi à la maison), on installera un accès
sécurisé au PC (Tailscale), sans rien ouvrir au public.
