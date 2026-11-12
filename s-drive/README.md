# S-Drive

Cloud privé fait maison : interface **React** + API **Node.js** + **PostgreSQL**, le tout dans Docker.

**Version 1 :** comptes et connexion.

## Démarrer

```powershell
cd D:\CLOUD\s-drive
docker compose up -d --build
```

Ouvrir **http://localhost:8090**, ou depuis un autre appareil du Wi‑Fi `http://<IP-du-PC>:8090`.

> Si `docker compose up --build` échoue avec « additional privileges requested: pass --allow=fs.read=… », construisez les images directement : `docker build -t s-drive/api:local server` et `docker build -t s-drive/web:local web`, puis `docker compose up -d --no-build`.

Au premier démarrage, le compte administrateur est créé avec les valeurs `ADMIN_*` de `.env` (identifiant `admin`, mot de passe `ADMIN_PASSWORD`). Modifier ces valeurs ensuite ne change pas le compte existant.

## Ce que fait la version 1

| Fonction | Détail |
|---|---|
| Inscription | L'utilisateur choisit son identifiant, son nom, son e-mail et un mot de passe (12 caractères au minimum). Désactivable avec `REGISTRATION_ENABLED=false`. |
| Connexion | Par identifiant ou par adresse e-mail. « Se souvenir de moi » : 30 jours, sinon 12 h. |
| Déconnexion | La session est supprimée côté serveur. |
| Anti force brute | Après 3 échecs, délai croissant (2 s, 4 s, 8 s… jusqu'à 5 min) par IP et identifiant. Au-delà de 30 échecs en 15 min, l'IP est bloquée. |
| Tableau de bord | Widget « Comptes S-Drive » (administrateurs) : comptes, présence en ligne, dernière connexion, actualisé toutes les minutes. |
| Interface | Même disposition que la version Nextcloud : barre du haut, navigation à gauche, thème sombre ou clair, tiroir de navigation sur mobile. |

Les applications Fichiers, Photos, Activité, Vidéos, Audio et Application sont déjà en place dans le menu et affichent « Bientôt disponible ».

## Stockage et quotas

- Chaque compte a un **quota** (par défaut `DEFAULT_QUOTA_GB=5` dans `.env`, ou `illimite`) et un compteur d’**espace utilisé**.
- Les fichiers sont stockés dans `STORAGE_PATH` (par défaut `./storage`, sur le disque du PC). La console mesure la capacité de ce disque.
- **Console > Comptes** : colonne « Stockage » (Utilisé / Quota), tri par espace, action « Modifier le quota » (5 Go, 20 Go, 100 Go, Illimité ou personnalisé).
- **Vue d’ensemble** : widgets « Stockage global » (jauge du disque) et « Plus gros consommateurs ».
- Contrôle des envois : `server/src/storage/quota.ts`. `reserveSpace()` réserve l’espace en **une seule requête SQL conditionnelle** (deux envois simultanés ne peuvent pas dépasser le quota), sinon erreur 413 ; `releaseSpace()` libère. `POST /api/me/storage/check` permet de refuser un fichier trop gros **avant** de l’envoyer. La route d’envoi de fichiers (version « Fichiers ») devra appeler `reserveSpace()` avant toute écriture.
- Un quota réduit sous l’espace déjà utilisé est accepté : les fichiers restent, les nouveaux envois sont refusés.

## Partages publics

- Table `shares` : lien à jeton secret (seule son empreinte SHA-256 est stockée), mot de passe facultatif (scrypt), date d’expiration facultative, compteurs de vues et de téléchargements.
- Module `server/src/sharing/shares.ts` : `createShare()` et `openShare()` (contrôle révoqué / expiré / mot de passe, puis comptage). La version « Fichiers » s’en servira pour créer et ouvrir les liens.
- **Console > Partages** : tous les liens (actifs, expirés, révoqués), recherche, filtres, alertes « sans mot de passe » / « sans expiration », bouton **Révoquer** (effet immédiat, inscrit au journal de sécurité ; la trace du partage est conservée).
- Widget « Partages publics actifs » disponible dans le catalogue de la vue d’ensemble.

## Maintenance du stockage (Console > Système)

- Organisation sur le disque : `STORAGE_PATH/blobs/<id du compte>/<clé>` (contenu des fichiers) et `STORAGE_PATH/tmp/` (envois en cours). Métadonnées dans la table `files` (corbeille = `trashed_at`). Un fichier à la corbeille compte dans le quota jusqu’à sa suppression définitive.
- **Répartition** : fichiers actifs, corbeilles (contenu des dossiers jetés inclus), temporaires et orphelins.
- **Vider les corbeilles de plus de 30 jours** : aperçu de l’espace libéré avant confirmation, suppression des entrées puis des contenus, quota des propriétaires libéré.
- **Analyser et nettoyer les orphelins** : fichiers sur le disque sans entrée, entrées sans fichier (retrait facultatif), envois abandonnés depuis plus de 24 h.
- Garde-fous : rien de récent (moins d’1 h) n’est touché, aucun lien symbolique suivi, aucune suppression hors du dossier de stockage, une seule opération à la fois, refus de retirer des entrées si la plupart des fichiers sont introuvables (disque non monté).
- Chaque action (vidage, analyse, nettoyage) est inscrite au journal de sécurité (filtre « Maintenance »).

## Sécurité

- Mots de passe hachés avec **scrypt** (sel aléatoire), jamais stockés en clair.
- Session : jeton aléatoire de 256 bits dans un cookie `HttpOnly` et `SameSite=Lax` (`Secure` en HTTPS). Seule son empreinte SHA-256 est en base.
- Protection CSRF : en-tête `Origin` vérifié, JSON obligatoire pour toute modification.
- Pas de délai différent selon que le compte existe ou non (on ne peut pas deviner les identifiants).
- La base de données est sur un réseau Docker interne, inaccessible de l'extérieur.
- En-têtes de sécurité Nginx : CSP stricte, interdiction de l'affichage dans un cadre, `nosniff`.

## Structure

```
s-drive/
├── docker-compose.yml     db (PostgreSQL) · api (Node.js) · web (Nginx + React)
├── .env                   secrets (non versionné) — modèle : .env.example
├── server/                API Fastify + TypeScript
│   └── src/
│       ├── index.ts       démarrage, migrations, création de l'admin
│       ├── app.ts         Fastify, protection CSRF, erreurs
│       ├── db.ts          connexion + migrations SQL
│       ├── routes/        auth.ts (inscription, connexion…) · admin.ts
│       └── security/      password.ts · sessions.ts · throttle.ts (+ tests)
└── web/                   Interface React + Vite + TypeScript
    ├── nginx.conf         fichiers statiques + relais /api
    └── src/
        ├── pages/         Login · Register · Dashboard · Apps (Fichiers…)
        └── components/    AppShell (barre + navigation) · Guest · Icons · Logo
```

## Développement

```powershell
# API (base PostgreSQL requise : DATABASE_URL=postgres://…)
cd server; npm install; npm run dev     # http://localhost:3000
npm test                                # tests de sécurité

# Interface (relaie /api vers localhost:3000)
cd web; npm install; npm run dev        # http://localhost:5173
```
