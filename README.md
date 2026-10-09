# StbSports ⚽🏀

Application de pronostics sportifs **entre amis, sans argent réel**, pour iPhone et Android.
Ligue 1, Ligue des Champions et NBA. Le premier à **500 points** gagne la partie.

## Règles du jeu

| Pari | Coût | Si c'est gagné |
|---|---|---|
| Vainqueur (1 / N / 2) | gratuit | 10 × la cote (ex. cote 1,50 → 15 pts) |
| Score exact (foot) | 5 pts | mise rendue + 25 pts |
| Buteur (foot, 3 max) | 5 pts chacun | mise rendue + 25 pts |

- Chaque joueur démarre avec **20 points**.
- Buteur absent ou remplaçant : la mise est **remboursée**.
- Le score exact et les buteurs portent sur le temps réglementaire (90 min). Les buts contre son camp ne comptent pas.
- NBA : seul le pari sur le vainqueur est disponible (prolongations comprises).
- Match annulé ou reporté : toutes les mises sont rendues.
- Les paris des amis sont dévoilés au coup d'envoi. Un pari validé ne peut plus être modifié.
- Les cotes sont la **médiane** des bookmakers, figée au moment du pari.

Toutes ces valeurs se règlent dans [`supabase/functions/_shared/scoring.ts`](supabase/functions/_shared/scoring.ts)
(et dans `place_bet` dans la migration SQL pour les mises).

## Essayer tout de suite (mode démo)

```bash
npm install
npx expo start
```

Scanne le QR code avec l'application **Expo Go** sur ton téléphone. Sans configuration Supabase, l'appli
démarre en **mode démo** : matchs fictifs, amis fictifs (code de groupe `STB777`) et un bouton
« simuler les résultats ».

## Organisation du code

```
src/app/                 Écrans (Expo Router)
src/components/          Éléments visuels réutilisables
src/lib/                 Accès aux données (Supabase ou démo)
supabase/migrations/     Base de données, sécurité et règles côté serveur
supabase/functions/      Récupération des matchs, cotes et résultats
  _shared/scoring.ts     Règles du jeu (partagées appli + serveur)
```

## Mise en production : les étapes

### 1. Les comptes à créer

| Service | Rôle | Coût |
|---|---|---|
| [Supabase](https://supabase.com) | Comptes joueurs, groupes, paris | gratuit pour démarrer |
| [API-Football](https://www.api-football.com/pricing) | Matchs Ligue 1 / LDC, cotes, compositions, buteurs | ~19 $/mois (l'offre gratuite ne couvre pas la saison en cours) |
| [The Odds API](https://the-odds-api.com) | Matchs et cotes NBA | gratuit (500 crédits/mois) |
| [Expo / EAS](https://expo.dev) | Compilation iOS / Android dans le cloud | gratuit |
| [Apple Developer](https://developer.apple.com/programs/) | Publication App Store | 99 €/an |
| [Google Play Console](https://play.google.com/console) | Publication Google Play | 25 $ une fois |

### 2. Supabase

```bash
npx supabase login
npx supabase link --project-ref <PROJET>
npx supabase db push                       # crée les tables
npx supabase secrets set API_FOOTBALL_KEY=... ODDS_API_KEY=... CRON_SECRET=<un-long-secret>
npx supabase functions deploy sync-matches
npx supabase functions deploy settle-matches
```

Puis dans le SQL Editor : activer `pg_cron` et `pg_net`, et exécuter [`supabase/cron.sql`](supabase/cron.sql).

Copier `.env.example` en `.env.local` et y mettre l'URL et la clé `anon` du projet.

### 3. Publier sur les stores

```bash
npx eas-cli@latest login
npx eas-cli@latest build --platform all --profile production
npx eas-cli@latest submit --platform ios
npx eas-cli@latest submit --platform android
```

À prévoir dans les fiches App Store / Google Play :

- **Classification d'âge** : « jeux d'argent simulés fréquents » → **18+** chez Apple. L'appli demande de confirmer avoir 18 ans à l'inscription.
- Mention claire : *aucun argent réel ne peut être misé ni gagné*.
- **Politique de confidentialité** (URL obligatoire) : e-mail et pseudo uniquement.
- La **suppression du compte** est disponible dans l'appli (Mon compte), comme l'exige Apple.
- Identifiant de l'appli : `fr.stbsports.app` (modifiable dans `app.json` avant la première publication).

## Commandes utiles

```bash
npm test             # tests des règles de calcul des points
npm run typecheck    # vérification TypeScript
```
