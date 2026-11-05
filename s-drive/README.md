# S-Drive

Cloud privé fait maison : interface **React** + API **Node.js** + **PostgreSQL**, le tout dans Docker.

**Version 1 :** comptes et connexion.

## Démarrer

```powershell
cd D:\CLOUD\s-drive
docker compose up -d --build
```

Ouvrir **http://localhost:8090**, ou depuis un autre appareil du Wi‑Fi `http://<IP-du-PC>:8090`.

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
