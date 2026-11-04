# my-private-cloud — Cloud personnel auto-hébergé (Nextcloud)

Stockage personnel privé et rapide, accessible depuis le **Web, iOS, Android, Windows, macOS et Linux**.
Il fonctionne **tout de suite en local** sur votre PC et se **migre sur un VPS** sans modifier `docker-compose.yml` : seul `.env` change.

| Composant | Rôle |
|---|---|
| **Nextcloud** (Apache) | Application cloud : fichiers, photos, agenda, contacts… |
| **PostgreSQL 17** | Base de données (réseau interne, jamais exposée) |
| **Redis 7** | Cache + **verrouillage transactionnel des fichiers** (anti-corruption) |
| **APCu + OPcache** | Cache PHP en mémoire |
| **cron** | Tâches de fond toutes les 5 min |
| **init-perms** | Prépare les droits du dossier de données au démarrage |
| **Nginx Proxy Manager** *(VPS, option A)* | HTTPS Let's Encrypt |
| **Cloudflare Tunnel** *(VPS, option B)* | HTTPS sans ouvrir de port |

```
 LOCAL :  PC / téléphone du Wi-Fi ──HTTP──► :8080 ─┐
 VPS   :  Internet ──HTTPS──► NPM | cloudflared ───┤ réseau "frontend"
                                                   ▼
                                   Nextcloud (app) + cron ──► ./cloud_data (disque)
                                                   │ réseau "backend" (interne)
                                           PostgreSQL  ·  Redis
```

---

## 1. Démarrage rapide en LOCAL (Windows)

**Prérequis** : [Docker Desktop](https://www.docker.com/products/docker-desktop/) (backend WSL 2), au moins 4 Go de RAM libres.

> ⚠️ **Espace disque de Docker Desktop** : par défaut, Docker stocke son disque virtuel (images, base PostgreSQL, volumes) sur **C:**, dans `%LOCALAPPDATA%\Docker\wsl`. Comptez **10 à 20 Go libres** sur C:. Si C: est presque plein, déplacez-le après l'installation : *Docker Desktop → Settings → Resources → Advanced → **Disk image location*** → par ex. `D:\DockerData`. Les fichiers utilisateurs, eux, vont dans `NEXTCLOUD_DATA_DIR`.

```powershell
cd D:\CLOUD\my-private-cloud

# 1. Générer .env (IP locale détectée, mots de passe aléatoires)
.\scripts\init-env.ps1 -Mode local
#    Pour stocker sur un autre disque :
#    .\scripts\init-env.ps1 -Mode local -DataDir "E:/NextcloudData"

# 2. Vérifier la configuration
docker compose config --quiet

# 3. Lancer le serveur (le 1er lancement construit l'image Nextcloud + ffmpeg : 3 à 5 min)
docker compose up -d

# 4. Suivre l'installation jusqu'à "==> [optimize] Terminé."
docker compose logs -f app

# 5. Bilan de performance et de santé
.\scripts\optimize.ps1 -CheckOnly
```

**Accès :**
- Sur ce PC : **http://localhost:8080**
- Depuis un autre appareil du même Wi-Fi/Ethernet : **http://\<IP-du-PC\>:8080** (l'IP est affichée par `init-env.ps1` et inscrite dans `NEXTCLOUD_URL`)
- Identifiant : `admin`, mot de passe : `NEXTCLOUD_ADMIN_PASSWORD` dans `.env`
- 🔐 À la **première connexion**, la double authentification étant obligatoire pour les administrateurs, Nextcloud demande de configurer une **application TOTP** (Aegis, 2FAS, Google Authenticator, Bitwarden…) et propose des **codes de secours**. Imprimez-les ou rangez-les dans un gestionnaire de mots de passe (voir §9).

> **Pare-feu Windows** : si les autres appareils n'accèdent pas au cloud, autorisez le port (PowerShell **administrateur**) :
> `New-NetFirewallRule -DisplayName "Nextcloud 8080" -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow -Profile Private`
> et vérifiez que votre réseau Wi-Fi est en profil **Privé**.

> **IP qui change** : si la box attribue une nouvelle IP au PC, relancez `.\scripts\init-env.ps1 -Mode local` puis `docker compose up -d`. Les domaines autorisés sont resynchronisés à chaque démarrage. Le mieux est de réserver une IP fixe au PC (bail DHCP) dans l'interface de la box.

---

## 2. Stockage local « illimité »

Les fichiers utilisateurs sont écrits **directement sur votre disque**, dans le dossier `NEXTCLOUD_DATA_DIR` (par défaut `./cloud_data`). La seule limite est la place disponible sur le disque, aucun quota n'est appliqué.

| Hôte | Exemple de `NEXTCLOUD_DATA_DIR` |
|---|---|
| Windows | `./cloud_data`, `D:/NextcloudData`, `E:/Cloud` |
| Linux / VPS | `/srv/cloud_data`, `/mnt/disque2/nextcloud` |

**Droits d'écriture** : le service `init-perms` donne le dossier à l'utilisateur `www-data` (UID 33, celui de Nextcloud) en `0770`. Un `chown -R` est fait au premier lancement uniquement : le fichier témoin `.perms-initialized` évite de le refaire à chaque démarrage.
- Sous **Windows/macOS**, Docker Desktop accorde automatiquement l'écriture au conteneur. Le contrôle Unix des droits est donc désactivé dans [`config/nextcloud/local.config.php`](config/nextcloud/local.config.php).
- Sous **Linux/VPS**, les droits `0770` s'appliquent réellement et le contrôle est réactivé ([`vps.config.php`](config/nextcloud/vps.config.php)).
- Nous n'utilisons **pas** `0777` : Nextcloud refuse un dossier de données lisible par tous, pour des raisons de sécurité.

**Changer de dossier après l'installation** : arrêtez la stack (`docker compose down`), déplacez **tout** le contenu (y compris `.ocdata` et `.htaccess`), modifiez `NEXTCLOUD_DATA_DIR`, puis `docker compose up -d`.

**Ajouter des fichiers directement dans le dossier** (sans passer par Nextcloud) : lancez ensuite
`docker compose exec -u www-data app php occ files:scan --all`.

---

## 3. Gros fichiers & performances

| Réglage | Valeur | Où |
|---|---|---|
| `upload_max_filesize` / `post_max_size` | **16G** | `.env` → `PHP_UPLOAD_LIMIT` |
| `memory_limit` | **2147483648** (2 Go) | `.env` → `PHP_MEMORY_LIMIT` |
| Limite de requête Apache | illimitée | `.env` → `APACHE_BODY_LIMIT=0` |
| Timeouts PHP | 3600 s | [`config/php/zz-performance.ini`](config/php/zz-performance.ini) |
| OPcache / APCu | 256 Mo + JIT / 128 Mo | `zz-performance.ini` |
| Verrouillage de fichiers | **Redis**, TTL 2 h | `local.config.php` / `vps.config.php` + `optimize.sh` |
| Envoi par morceaux | 50 Mo | `scripts/occ/optimize.sh` |
| Compression Brotli / Gzip, timeouts Apache | XML/JSON/JS/CSS/SVG | [`config/apache/zz-nextcloud-network.conf`](config/apache/zz-nextcloud-network.conf) |

L'image Nextcloud écrit ces valeurs dans le `nextcloud.ini` du conteneur à chaque démarrage.

### 3.1 Tuning hautes performances

| Composant | Ce qui est fait | Effet |
|---|---|---|
| **Tâches de fond** | Conteneur **`cron`** dédié : `cron.php` toutes les **5 min**, mode `background:cron` | Aucune tâche lourde (nettoyage, indexation, notifications) n'est exécutée pendant les requêtes web ou mobiles |
| **Vignettes** | App **Preview Generator** installée et lancée par le conteneur `cron` toutes les **10 min** (`preview:pre-generate`, verrou anti-chevauchement) | Les galeries s'ouvrent instantanément : les vignettes sont prêtes **avant** d'être demandées |
| | Taille max **2048×2048**, JPEG qualité 70, tailles pré-générées limitées (32, 256, 384 px) | Moins d'espace disque, galeries plus légères sur smartphone |
| | Image Nextcloud enrichie ([`docker/nextcloud/Dockerfile`](docker/nextcloud/Dockerfile)) : **ffmpeg** + ImageMagick complet | Vignettes des **vidéos**, des photos **HEIC** d'iPhone, des TIFF et SVG |
| **PostgreSQL** | `shared_buffers` 1 Go, `effective_cache_size` 3 Go, `work_mem` 32 Mo, réglages SSD (`random_page_cost=1.1`, `effective_io_concurrency=200`), checkpoints étalés, autovacuum plus fréquent sur la table des fichiers | Requêtes servies depuis la mémoire, pas de pics d'écriture |
| **Redis** (100 % mémoire, sans écriture disque) | Cache distribué + **verrouillage transactionnel** + **sessions PHP** (`session.save_handler=redis`, défini automatiquement par l'image) | Pages et API servies depuis la RAM, sessions partagées, aucun verrou en base |
| **PHP** | OPcache 256 Mo + JIT, APCu 128 Mo | Code PHP précompilé, cache local ultra-rapide |

**Dimensionnement de la base** : les valeurs de `.env` (`PG_SHARED_BUFFERS`, `PG_EFFECTIVE_CACHE_SIZE`, …) sont réglées pour ce PC (16 Go de RAM, dont ~8 Go pour Docker Desktop). Sur un VPS plus petit, reprenez la ligne adaptée du tableau dans [`.env.example`](.env.example) : environ **25 %** de la RAM pour `shared_buffers` et **50–75 %** pour `effective_cache_size`.

**Génération initiale des vignettes** : Preview Generator ne traite automatiquement que les **nouveaux** fichiers. Pour ceux déjà présents, lancez une fois la génération en arrière-plan (cela peut prendre plusieurs heures sur une grosse photothèque) :
```powershell
docker compose exec -d -u www-data app php occ preview:generate-all
docker compose logs -f cron        # suivre ensuite le traitement continu
```

### 3.2 Appliquer et vérifier (bilan de santé)

```powershell
.\scripts\optimize.ps1              # applique toutes les optimisations puis affiche le bilan
.\scripts\optimize.ps1 -CheckOnly   # bilan seulement
```
(Linux/VPS : `./scripts/optimize.sh` ou `./scripts/optimize.sh --check-only`)

Le bilan ([`scripts/occ/health-check.php`](scripts/occ/health-check.php)) contrôle :
- le **cron** (mode et dernière exécution) ;
- **PHP** (mémoire, envois, OPcache, APCu) ;
- les **caches** (APCu, Redis, verrous, sessions) ;
- **Redis** (mémoire, taux de succès, évictions) ;
- **PostgreSQL** (paramètres, taux de cache, taille) ;
- les **aperçus** (Preview Generator, ffmpeg, HEIC, SVG) ;
- la totalité des **contrôles officiels** de *Administration → Vue d'ensemble* (`occ setupchecks`).

Il se termine par un résumé, avec le code retour **1** s'il reste une **erreur** critique. En mode local HTTP, les avertissements liés au HTTPS et à l'e-mail sont normaux : ils sont signalés comme *attendus* et disparaissent sur le VPS.

À voir aussi dans *Administration → Vue d'ensemble* : « Tous les contrôles ont réussi », sauf ces points HTTPS en local.

---

## 4. Mode LOCAL vs mode VPS

Le même `docker-compose.yml` sert dans les deux cas : `init-env` remplit `.env` selon le mode choisi.

| Variable `.env` | LOCAL | VPS |
|---|---|---|
| `CLOUD_MODE` | `local` | `vps` |
| `NEXTCLOUD_URL` | `http://192.168.x.x:8080` | `https://cloud.mondomaine.fr` |
| `NEXTCLOUD_TRUSTED_DOMAINS` | `localhost 127.0.0.1 <IP> <nom-PC>` | `cloud.mondomaine.fr` |
| `NEXTCLOUD_TRUSTED_LAN` | `true` (toute IP privée) | `false` |
| `OVERWRITE_PROTOCOL` | *(vide → HTTP accepté)* | `https` |
| `OVERWRITE_HOST` | *(vide)* | `cloud.mondomaine.fr` |
| `APP_BIND` | `0.0.0.0` (réseau local) | `127.0.0.1` (seul le proxy est public) |
| `NEXTCLOUD_DATA_DIR` | `./cloud_data` | `/srv/cloud_data` |

> ⚠️ Le mode local fonctionne en **HTTP non chiffré** : réservez-le à votre réseau domestique et **ne redirigez pas le port 8080 sur votre box**. Pour un accès depuis l'extérieur, passez au mode VPS avec HTTPS.

---

## 5. Sauvegarde & migration vers un VPS

### 5.1 Sauvegarder (sur le PC, avec Git Bash sous Windows)

```bash
./scripts/backup.sh                    # complet : BDD + appli + fichiers + .env
./scripts/backup.sh --no-data          # sans les fichiers (copiés ensuite avec rsync)
./scripts/backup.sh --dest /e/Backups --keep 7   # autre disque, garder les 7 dernières
```

Le script active le **mode maintenance**, ce qui garantit une sauvegarde cohérente, puis produit `backups/nc-backup-AAAAMMJJ-HHMMSS/` :

| Fichier | Contenu |
|---|---|
| `db.dump` | Base PostgreSQL (`pg_dump -Fc`) |
| `html.tar.gz` | `config.php`, apps installées, thèmes, version |
| `data.tar` | Fichiers utilisateurs |
| `env.backup` | Copie de `.env` : **contient les mots de passe, à protéger** |
| `MANIFEST.txt`, `SHA256SUMS` | Versions et empreintes pour vérifier le transfert |

### 5.2 Migrer

**Sur le VPS** (Ubuntu/Debian) :
```bash
curl -fsSL https://get.docker.com | sudo sh
sudo mkdir -p /srv/my-private-cloud /srv/cloud_data && sudo chown $USER /srv/my-private-cloud
```

**Depuis le PC** : copiez le projet et la sauvegarde.
```bash
scp -r my-private-cloud utilisateur@VPS:/srv/
# Gros volume de fichiers ? Préférez backup.sh --no-data + rsync (reprise possible) :
rsync -aP --rsync-path="sudo rsync" ./cloud_data/ utilisateur@VPS:/srv/cloud_data/
```

**Sur le VPS** :
```bash
cd /srv/my-private-cloud
./scripts/init-env.sh vps cloud.mondomaine.fr /srv/cloud_data   # garde les mots de passe
./scripts/restore.sh backups/nc-backup-AAAAMMJJ-HHMMSS
```

`restore.sh` vérifie les empreintes et restaure la base, l'application et les fichiers. Il corrige ensuite les droits, démarre la stack, désactive le mode maintenance, relance un scan des fichiers et les optimisations.

> Gardez **la même version d'image Nextcloud** (`NEXTCLOUD_IMAGE_TAG`) sur le PC et sur le VPS au moment de la migration.

### 5.3 Activer le HTTPS sur le VPS

**Option A — Nginx Proxy Manager**
1. DNS : enregistrement **A** `cloud.mondomaine.fr` → IP du VPS. Ouvrez les ports 80/443 du pare-feu du VPS.
2. `docker compose --profile npm up -d`
3. Interface d'admin via tunnel SSH : `ssh -L 8181:127.0.0.1:81 utilisateur@VPS`, puis http://localhost:8181 (`admin@example.com` / `changeme` → **à changer immédiatement**).
4. **Proxy Host** : domaine `cloud.mondomaine.fr` → `http` · `app` · `80`. Cochez *Websockets*, mais laissez **décochée** l'option *Block Common Exploits*, qui peut bloquer des requêtes WebDAV légitimes (Nextcloud a sa propre protection anti-force brute). Onglet SSL : *Request new certificate*, *Force SSL*, *HTTP/2*. Onglet *Advanced* : collez [`config/npm/nextcloud-advanced.conf`](config/npm/nextcloud-advanced.conf).

**Option B — Cloudflare Tunnel** (aucun port ouvert)
1. Zero Trust → Networks → Tunnels → *Create* → Docker : copiez le token dans `CLOUDFLARE_TUNNEL_TOKEN`.
2. *Public Hostname* : `cloud.mondomaine.fr` → `HTTP` → `app:80`.
3. `docker compose --profile cloudflare up -d`

> Cloudflare (offre gratuite) limite chaque requête à 100 Mo. Les applications Nextcloud envoient par morceaux de 50 Mo, donc les fichiers de plusieurs Go passent sans problème.

---

## 6. Accès multi-appareils en réseau local

### 6.0 Ce qui est configuré automatiquement

**Domaines autorisés (`trusted_domains` dans `config.php`)** : ils sont réécrits à **chaque démarrage** par [`scripts/occ/trusted-domains.sh`](scripts/occ/trusted-domains.sh), sans toucher à la base de données. En mode local (`NEXTCLOUD_TRUSTED_LAN=true`), Nextcloud accepte :

| Entrée | Rôle |
|---|---|
| `localhost`, `127.0.0.1` | Accès depuis le PC hôte |
| IP détectée (ex. `192.168.100.216`) et nom du PC | Accès explicite |
| `192.168.*`, `10.*`, `172.16.*` … `172.31.*` | **Toute IP privée** du réseau local : l'accès continue de fonctionner même si la box change l'IP du PC |
| `*.local`, `*.lan`, `*.home` | Noms locaux (ex. `mon-pc.local`, `mon-pc.lan`) |

Sur le VPS (`NEXTCLOUD_TRUSTED_LAN=false`), seul le domaine public est accepté.

**Appliquer un changement du `.env`, sans réinitialisation** :
```powershell
docker compose up -d     # recrée uniquement le conteneur modifié ; base et fichiers conservés
# ou, sans redémarrer :
docker compose exec -u www-data app sh /opt/scripts/trusted-domains.sh
docker compose exec -u www-data app php occ config:system:get trusted_domains   # vérifier
```

**WebDAV / CORS** : les applications Nextcloud (Android, iOS, Desktop) synchronisent via **WebDAV** (`/remote.php/dav`), que Nextcloud gère nativement (PROPFIND, MOVE, envoi par morceaux…). Les en-têtes **CORS** ne concernent que les pages web qui appellent un autre site depuis un navigateur. Les applications natives n'y sont **pas soumises**, il n'y a donc rien à ouvrir. Nous n'ajoutons volontairement **pas** de `Access-Control-Allow-Origin: *` : n'importe quel site web pourrait alors interroger votre cloud avec votre session. Ce qui a été réglé côté serveur pour la synchronisation :
- aucune limite de taille côté Apache (`APACHE_BODY_LIMIT=0`) et des timeouts longs pour les envois lents depuis un smartphone ([`config/apache/zz-nextcloud-network.conf`](config/apache/zz-nextcloud-network.conf)) ;
- la découverte CalDAV/CardDAV (`/.well-known/caldav` et `/.well-known/carddav`) est gérée par le `.htaccess` de Nextcloud.

**Compression Brotli / Gzip** ([`config/apache/zz-nextcloud-network.conf`](config/apache/zz-nextcloud-network.conf)) :
- **Brotli** si le client l'accepte, sinon **Gzip**. La compression s'applique aux listes de dossiers WebDAV (XML), aux réponses JSON de l'API, au HTML/JS/CSS et aux icônes SVG : c'est ce qui accélère la navigation dans les dossiers sur smartphone.
- Les **aperçus d'images** (JPEG/PNG/WebP) sont déjà compressés et ne sont donc pas recompressés. Leur légèreté vient de la taille maximale des miniatures (2048 px, qualité 80, réglée par `optimize.sh`).
- Les **téléchargements de fichiers** WebDAV et les requêtes `Range` ne sont **pas** compressés, pour préserver la reprise des transferts interrompus.

Vérifier (après `docker compose up -d`) :
```powershell
curl.exe -s -o NUL -D - -H "Accept-Encoding: br, gzip" http://localhost:8080/login | findstr /i "content-encoding"
# -> Content-Encoding: br
```

### 6.a Trouver l'IP locale du PC hôte

L'IP est **déjà détectée** par `init-env.ps1` et inscrite dans `.env` (`NEXTCLOUD_URL=http://192.168.x.x:8080`). Pour la retrouver manuellement :

| Système hôte | Commande | À lire |
|---|---|---|
| **Windows** | `ipconfig` | « Adresse IPv4 » de la carte **Wi-Fi** ou **Ethernet** (ignorez les cartes `vEthernet (WSL)` ou `Hyper-V`) |
| Windows (PowerShell) | `(Get-NetIPConfiguration \| ? IPv4DefaultGateway).IPv4Address.IPAddress` | l'IP directement |
| **macOS** | `ipconfig getifaddr en0` | l'IP directement |
| **Linux** | `hostname -I` | première adresse |

Une IP locale commence presque toujours par `192.168.`, `10.` ou `172.16.` à `172.31.`.

**Test depuis le téléphone** : connecté au **même Wi-Fi**, ouvrez le navigateur sur `http://192.168.x.x:8080`. La page de connexion Nextcloud doit s'afficher. Si ce n'est pas le cas, voir le pare-feu Windows (§1).

> 💡 Réservez une **IP fixe** au PC dans la box (menu *DHCP → baux statiques*). Ce n'est pas indispensable, puisque toute IP locale est acceptée, mais cela évite d'avoir à changer l'adresse dans les applications.

### 6.b Configurer l'application Nextcloud sur smartphone

1. Installez **Nextcloud** : [Android (Play Store)](https://play.google.com/store/apps/details?id=com.nextcloud.client), [F-Droid](https://f-droid.org/packages/com.nextcloud.client/) ou [iOS (App Store)](https://apps.apple.com/app/nextcloud/id1125420102).
2. Vérifiez que le téléphone est sur le **même Wi-Fi** que le PC (données mobiles désactivées pour ce premier test).
3. Ouvrez l'application → **Se connecter**.
4. Dans le champ **Adresse du serveur**, saisissez l'adresse **complète, avec `http://` et le port** :
   ```
   http://192.168.100.216:8080
   ```
   ⚠️ Sans `http://`, l'application tente le HTTPS et échoue. Sans `:8080`, elle vise le port 80, qui ne répond pas.
5. L'application signale une **connexion non sécurisée (HTTP)** : acceptez. C'est normal en mode local, et la connexion ne sort pas de votre réseau.
6. Une page de connexion s'ouvre : saisissez votre identifiant et votre mot de passe Nextcloud, puis **Autoriser l'accès**.
7. L'application crée son **propre mot de passe d'application**. Il est visible et révocable dans *Paramètres → Sécurité → Appareils et sessions* sur le web.

**Clients de bureau** ([Nextcloud Desktop](https://nextcloud.com/install/#install-clients)) : même adresse `http://192.168.100.216:8080`, même procédure. Choisissez ensuite les dossiers à synchroniser, ou les *fichiers virtuels* qui se téléchargent à la demande.

**Agenda et contacts** : sur iOS, *Réglages → Calendrier → Comptes → Ajouter un compte → Autre → CalDAV* avec le serveur `192.168.100.216:8080`. Sur Android, [DAVx⁵](https://www.davx5.com/) avec la connexion « URL et nom d'utilisateur ».

> 🔒 Utilisez un **compte personnel** plutôt que `admin` (créé dans *Paramètres → Comptes*) et activez la **2FA** (app *Two-Factor TOTP*).

### 6.c Synchronisation automatique des photos et vidéos

**Android**
1. Application Nextcloud → menu **☰** → **Paramètres** → **Téléversement automatique** (*Auto upload*).
2. Le dossier **Camera** (`DCIM/Camera`) apparaît : activez son interrupteur. Activez aussi *Screenshots* ou *WhatsApp Images* si vous le souhaitez.
3. Les **⋮** à côté du dossier → **Configurer** :
   - *Dossier distant* : par ex. `/Photos/Téléphone`
   - **Téléverser uniquement en Wi-Fi** : ✅ (indispensable en mode local, car le serveur n'est joignable qu'à la maison)
   - *Téléverser uniquement en charge* : ✅ recommandé pour les vidéos
   - *Utiliser des sous-dossiers* (par date) : ✅
   - *Fichier d'origine* : **conserver** (ou supprimer après envoi pour libérer de la place)
   - *Fichiers existants* : cochez **Téléverser aussi les fichiers existants** pour envoyer la galerie actuelle
4. **Important** : dans *Paramètres Android → Applications → Nextcloud → Batterie*, choisissez **Non restreinte**. Sinon Android suspend les envois en arrière-plan.

**iOS / iPadOS**
1. Application Nextcloud → onglet **Plus** → **Paramètres** → **Téléversement automatique** (*Auto upload*).
2. Activez **Téléverser automatiquement les photos** et **Téléverser automatiquement les vidéos**, puis choisissez le **dossier de destination**.
3. Options recommandées : *Utiliser des sous-dossiers* (par date) ✅, *Uniquement en Wi-Fi* ✅, *Téléverser l'intégralité de la photothèque* ✅ pour envoyer les photos existantes.
4. Autorisez l'accès à **toutes les photos** (*Réglages iOS → Confidentialité → Photos → Nextcloud → Accès complet*).
5. iOS limite fortement l'arrière-plan : **ouvrez l'application régulièrement**, surtout pour le premier envoi. Activez aussi l'option d'envoi en arrière-plan proposée par l'application, et le *Rafraîchissement en arrière-plan* dans les réglages iOS.

**Bon à savoir**
- En mode local, les envois se font **uniquement quand le téléphone est sur le Wi-Fi de la maison**. Hors de chez vous, les fichiers sont mis en attente puis envoyés au retour. Après la migration sur VPS (HTTPS), ils partiront de n'importe où : il suffira de changer l'adresse du compte dans l'application.
- Les vidéos de plusieurs Go passent sans problème : envoi par morceaux, limite de 16 Go, timeouts d'une heure.
- Les photos s'affichent dans l'application **Photos** du web (`http://192.168.x.x:8080/apps/photos`) avec une vue chronologique.

---

## 7. Sauvegarde WhatsApp, Telegram & applications tierces

### 7.0 Prérequis Android : accès aux dossiers des applications

Depuis Android 11, les dossiers `Android/media/…` ne sont lisibles que par une application qui dispose de l'autorisation **« Accès à tous les fichiers »**.

1. *Paramètres Android → Applications → Nextcloud → Autorisations → Fichiers et contenus multimédias → **Autoriser la gestion de tous les fichiers*** (ou bien l'application le propose au premier dossier personnalisé).
2. Si cette option n'apparaît pas (Google a déjà restreint cette autorisation pour la version Play Store), installez la version **[F-Droid](https://f-droid.org/packages/com.nextcloud.client/)** de l'application. Elle a l'accès complet et utilise le même serveur.
3. Batterie **« Non restreinte »** pour Nextcloud (voir §6.c), sinon les envois nocturnes sont suspendus.

> ℹ️ Le dossier `Android/data/` reste **inaccessible** à toutes les applications. Ce n'est pas grave : WhatsApp et Telegram écrivent leurs médias et sauvegardes dans `Android/media/`.

**Ajouter un dossier personnalisé** : application Nextcloud → **☰ → Paramètres → Téléversement automatique** → menu **⋮** (en haut à droite) → **Configurer un dossier personnalisé**. Choisissez ensuite le *dossier local* (sur le téléphone) et le *dossier distant* (sur le cloud).

### 7.1 Médias WhatsApp, Telegram et photos

Créez une entrée de téléversement automatique **par ligne** :

| Dossier local (téléphone) | Dossier distant (cloud) | Remarques |
|---|---|---|
| `DCIM/Camera` | `/Photos/Téléphone` | Activé par défaut (§6.c) |
| `Pictures/Screenshots` | `/Photos/Captures` | Facultatif |
| `Android/media/com.whatsapp/WhatsApp/Media` | `/Sauvegardes/WhatsApp/Media` | Images, vidéos, documents, notes vocales (sous-dossiers inclus) |
| `Android/media/org.telegram.messenger/Telegram` | `/Sauvegardes/Telegram` | Android 11+ : contient `Telegram Images`, `Telegram Video`, `Telegram Documents`, `Telegram Audio` |
| `Telegram` (racine du stockage) | `/Sauvegardes/Telegram` | Anciennes versions de Telegram / Android ≤ 10 |

Réglages recommandés pour les **médias** :
- **Téléverser uniquement en Wi-Fi** ✅ (obligatoire en mode local)
- **Exclure les fichiers cachés** ✅ : ignore `.Statuses`, `.Shared`, `.trash` et les miniatures de WhatsApp
- **Utiliser des sous-dossiers** : ✅ pour DCIM, ❌ pour WhatsApp/Telegram (on garde leur arborescence)
- **Si le fichier existe déjà** : *Renommer la nouvelle version* ou *Ne pas envoyer*
- **Fichier d'origine** : *Conserver*. WhatsApp et Telegram gèrent eux-mêmes leurs fichiers.

> **Telegram** ne copie dans ces dossiers que les médias **ouverts ou téléchargés**, ou tous si *Paramètres → Discussions → Enregistrer dans la galerie* est activé. Le reste est stocké dans le cloud Telegram et dans un cache inaccessible. Pour WhatsApp, vérifiez *Paramètres → Discussions → Visibilité des médias* ✅.

### 7.2 Bases de données WhatsApp (conversations)

Chaque nuit vers **2 h**, WhatsApp écrit une sauvegarde **chiffrée** de vos conversations dans :

```text
Android/media/com.whatsapp/WhatsApp/Databases/
├── msgstore.db.crypt14                 ← sauvegarde du jour (même nom, écrasée chaque nuit)
├── msgstore-2026-11-03.1.db.crypt14    ← copies datées (WhatsApp en garde 7)
└── msgstore-2026-11-02.1.db.crypt14
```

Dossier personnalisé à créer :

| Réglage | Valeur |
|---|---|
| Dossier local | `Android/media/com.whatsapp/WhatsApp/Databases` |
| Dossier distant | **`/Sauvegardes/WhatsApp/Databases`** (c'est ce chemin que surveille la purge serveur) |
| Uniquement en Wi-Fi | ✅ |
| Uniquement en charge | ✅ (le téléphone charge la nuit, l'envoi se fait juste après la sauvegarde de 2 h) |
| Utiliser des sous-dossiers | ❌ **désactivé**, sinon le fichier n'atterrit pas au même endroit et ne peut pas être remplacé |
| **Si le fichier existe déjà** | **Remplacer la version distante** |
| Fichier d'origine | **Conserver** ⚠️ ne jamais choisir « supprimer » : WhatsApp ne pourrait plus restaurer |

Ajoutez aussi, avec les mêmes réglages, `Android/media/com.whatsapp/WhatsApp/Backups` → `/Sauvegardes/WhatsApp/Backups` (paramètres, stickers, fonds d'écran).

**Ce que fait le serveur pour éviter la saturation** :
- `msgstore.db.crypt14` est **remplacé** chaque nuit grâce à la règle de conflit. Nextcloud en garde quelques **versions** précédentes, nettoyées automatiquement : au plus 90 jours, et jamais plus de 50 % de l'espace libre.
- Les **copies datées** (`msgstore-AAAA-MM-JJ…`) sont de **nouveaux fichiers** chaque jour. Le téléphone n'en garde que 7, mais elles s'accumuleraient indéfiniment sur le cloud. La tâche planifiée [`cleanup-app-backups.sh`](scripts/occ/cleanup-app-backups.sh) les **supprime chaque jour à 5 h 30** au-delà de **14 jours**, puis met à jour l'index Nextcloud.

Ces réglages se trouvent dans le `.env` :
```ini
APP_BACKUP_CLEANUP_DIRS=Sauvegardes/WhatsApp/Databases   # plusieurs dossiers : séparés par ";"
APP_BACKUP_RETENTION_DAYS=14
APP_BACKUP_DRY_RUN=false                                 # true = simulation
```
Tester sans rien supprimer :
```powershell
docker compose exec -u www-data -e APP_BACKUP_DRY_RUN=true cron sh /opt/scripts/cleanup-app-backups.sh
```

**Vérifier que l'envoi quotidien fonctionne** : le lendemain de la configuration, ouvrez `/Sauvegardes/WhatsApp/Databases` sur le web. La date de modification de `msgstore.db.crypt14` doit être celle de la nuit, et une copie datée doit être apparue. Si le fichier n'est pas mis à jour, dans l'application : *Téléversement automatique → ⋮ du dossier → Téléverser maintenant*. Vérifiez aussi la batterie « Non restreinte ».

**Restaurer les conversations sur un téléphone (même numéro)** :
1. Installez WhatsApp **sans l'ouvrir**.
2. Avec l'application Nextcloud, téléchargez `msgstore.db.crypt14`, ou une copie datée renommée en `msgstore.db.crypt14`, dans `Android/media/com.whatsapp/WhatsApp/Databases/`. Utilisez *Ouvrir avec → Gestionnaire de fichiers* ou un câble USB.
3. Ouvrez WhatsApp, validez **le même numéro** et choisissez **Restaurer**.

> 🔐 Ces fichiers sont **chiffrés par WhatsApp**. La clé n'est pas dans le dossier : elle est liée à votre numéro. Si la **sauvegarde chiffrée de bout en bout** est activée (fichiers `.crypt15`), conservez précieusement votre **mot de passe ou la clé à 64 chiffres**, sans lesquels la restauration est impossible.

### 7.3 Types de fichiers acceptés par le serveur

Rien n'est filtré par extension, ni par Nextcloud, ni par Apache, ni par Nginx ou Cloudflare : `.crypt12/14/15`, `.db`, `.bak`, `.tar`, `.gz`, `.zst`, `.7z`, etc. sont stockés tels quels. Seuls `.htaccess` et les fichiers temporaires `.part` / `.filepart` sont refusés par Nextcloud, ce qui est normal.

Ajouts de cette configuration :
- **Types MIME explicites** ([`config/nextcloud/mimetypemapping.json`](config/nextcloud/mimetypemapping.json)) : `.crypt14` → `application/vnd.whatsapp.backup`, `.db` → `application/vnd.sqlite3`, `.bak` → `application/x-backup`… Ces fichiers sont reconnus avec une icône « archive », ne déclenchent pas de génération d'aperçu inutile, et restent téléchargeables. Ils sont appliqués par `optimize.sh` (`occ maintenance:mimetype:update-db --repair-filecache`).
- **Pas de recompression** des téléchargements de fichiers (§6.0), ce qui garantit l'intégrité et la reprise des gros fichiers.
- **NPM** : l'option *Block Common Exploits* doit rester décochée (§5.3).
- **Taille** : aucune limite côté serveur, et envoi par morceaux pour les sauvegardes de plusieurs Go.

### 7.4 Et sur iPhone ?

iOS isole chaque application : **aucune application tierce**, Nextcloud compris, ne peut lire les fichiers internes de WhatsApp ou de Telegram.
- **Photos et vidéos reçues** : activez *WhatsApp → Réglages → Discussions → Enregistrer dans Photos* (et l'équivalent dans Telegram). Elles arrivent alors dans la photothèque, que Nextcloud envoie automatiquement (§6.c).
- **Conversations** : la sauvegarde WhatsApp sur iPhone ne se fait que vers **iCloud**. Pour garder une copie sur votre cloud, utilisez *Discussion → nom du contact → Exporter la discussion → Nextcloud*, ce qui produit un `.zip` avec ou sans médias.
- **Documents Telegram** : *appui long → Partager → Nextcloud*.

---

## 8. WebDAV : sauvegardes automatiques d'applications tierces

Nextcloud expose nativement vos fichiers en **WebDAV**, un protocole standard. N'importe quelle application compatible (FolderSync, rclone, gestionnaires de fichiers, logiciels de sauvegarde) peut donc y déposer ses sauvegardes, sans l'application Nextcloud. Il n'y a rien à activer côté serveur : WebDAV est toujours actif.

### 8.1 Structure de l'URL WebDAV

```text
http://<IP_LOCALE>:8080/remote.php/dav/files/<USERNAME>/
```

| Contexte | URL WebDAV |
|---|---|
| **Local (ce PC)** | `http://192.168.100.216:8080/remote.php/dav/files/<USERNAME>/` |
| Local, depuis le PC hôte | `http://localhost:8080/remote.php/dav/files/<USERNAME>/` |
| **VPS** (HTTPS) | `https://cloud.mondomaine.fr/remote.php/dav/files/<USERNAME>/` |
| Ancienne forme (applications anciennes) | `http://192.168.100.216:8080/remote.php/webdav/` (sans nom d'utilisateur) |

- **`<USERNAME>`** est l'**identifiant de connexion** Nextcloud, et non le nom affiché ni l'adresse e-mail. Le plus sûr est de copier l'URL complète depuis le web : *Fichiers* → **⚙ Paramètres des fichiers** (en bas à gauche) → section **WebDAV**.
- L'URL désigne la **racine** de vos fichiers. Un dossier s'y ajoute à la fin, par exemple `…/files/alice/Sauvegardes/Notes/`.
- Les espaces et accents des noms de dossiers sont gérés par les applications. Dans une URL saisie à la main, un espace s'écrit `%20`.
- En mode local, l'URL commence par **`http://`** (pas de HTTPS) et contient le port **`:8080`**.

**Créez un mot de passe d'application** pour chaque application de sauvegarde, au lieu de votre mot de passe principal :
web → avatar → **Paramètres personnels → Sécurité → Appareils et sessions** → nom « FolderSync – Téléphone » → **Créer un nouveau mot de passe d'application**. Copiez-le, il ne sera plus affiché. Il est révocable à tout moment, il fonctionne même si la 2FA est activée, et ne donne pas accès aux paramètres du compte.

### 8.2 Préparer et tester l'accès (script)

[`scripts/webdav-setup.ps1`](scripts/webdav-setup.ps1) construit l'URL à partir du `.env`, vérifie l'identifiant et le mot de passe d'application, teste l'écriture, crée les dossiers cibles et affiche le récapitulatif à recopier dans FolderSync :

```powershell
.\scripts\webdav-setup.ps1 -User alice
# dossiers personnalisés :
.\scripts\webdav-setup.ps1 -User alice -Folders "Sauvegardes/Notes","Sauvegardes/SMS"
```

Dossiers créés par défaut : `Sauvegardes/WhatsApp/{Databases,Backups,Media}`, `Sauvegardes/Notes`, `Sauvegardes/Telechargements`, `Sauvegardes/Applications`.

Équivalent `curl` (Linux, macOS, VPS) :
```bash
# Test d'accès (doit renvoyer HTTP 207)
curl -u alice:MOT_DE_PASSE_APPLI -X PROPFIND -H "Depth: 0" -o /dev/null -w "%{http_code}\n" \
  http://192.168.100.216:8080/remote.php/dav/files/alice/
# Créer un dossier
curl -u alice:MOT_DE_PASSE_APPLI -X MKCOL http://192.168.100.216:8080/remote.php/dav/files/alice/Sauvegardes
```

### 8.3 FolderSync (Android) : configuration pas à pas

[FolderSync](https://play.google.com/store/apps/details?id=dk.tacit.android.foldersync.lite) synchronise n'importe quel dossier du téléphone avec le cloud, **selon un planning**, en arrière-plan. C'est l'outil idéal pour les dossiers de sauvegarde des applications.

> **FolderSync ou Nextcloud ?** Pour un même dossier, utilisez **l'un ou l'autre**, jamais les deux : le téléversement automatique de l'application Nextcloud (§7) **ou** une paire de dossiers FolderSync. Sinon les fichiers sont envoyés deux fois et des conflits apparaissent.

**Étape 1 : autorisations**
- Au premier lancement, accordez **« Accès à tous les fichiers »**, nécessaire pour `Android/media/…` (WhatsApp, Telegram).
- *Paramètres Android → Applications → FolderSync → Batterie → **Non restreinte***, sinon la synchronisation planifiée ne se déclenche pas.

**Étape 2 : créer le compte WebDAV**
1. FolderSync → **Comptes** → **+** → **WebDAV**.
2. Renseignez :

   | Champ | Valeur |
   |---|---|
   | Nom | `Cloud maison` |
   | **Adresse du serveur (URL)** | `http://192.168.100.216:8080/remote.php/dav/files/alice/` |
   | **Nom d'utilisateur** | `alice` (identifiant Nextcloud) |
   | **Mot de passe** | le **mot de passe d'application** (§8.1) |
   | Connexion sécurisée / HTTPS | **désactivé** en local (activé sur le VPS) |
   | Certificats non sécurisés | désactivé (inutile en HTTP, et à proscrire en HTTPS) |

3. **Tester la connexion** → « Connexion réussie » → **Enregistrer**.

> FolderSync propose aussi un type de compte **Nextcloud**, qui fonctionne également. Le type WebDAV présenté ici est générique et fonctionne avec toutes les versions.

**Étape 3 : créer les paires de dossiers (*Folderpairs*)**

**Paires de dossiers** → **+** → choisissez le compte `Cloud maison`, puis une paire par ligne :

| Nom | Dossier local (téléphone) | Dossier distant (cloud) | Type de synchro | Supprimer les fichiers effacés | Si le fichier existe/modifié |
|---|---|---|---|---|---|
| WhatsApp – Conversations | `Android/media/com.whatsapp/WhatsApp/Databases` | `/Sauvegardes/WhatsApp/Databases` | **Vers le dossier distant** | ❌ **Non** | **Écraser** (le plus récent gagne) |
| WhatsApp – Réglages | `Android/media/com.whatsapp/WhatsApp/Backups` | `/Sauvegardes/WhatsApp/Backups` | Vers le dossier distant | ❌ Non | Écraser |
| WhatsApp – Médias | `Android/media/com.whatsapp/WhatsApp/Media` | `/Sauvegardes/WhatsApp/Media` | Vers le dossier distant | ❌ Non | Ignorer (les médias ne changent pas) |
| Notes | ex. `Documents/Notes` (Markor, Obsidian…) | `/Sauvegardes/Notes` | **Bidirectionnelle** | ✅ Oui | Le plus récent gagne |
| Téléchargements | `Download` | `/Sauvegardes/Telechargements` | Vers le dossier distant | ❌ Non | Écraser |
| Applications | dossier d'export de l'application (ex. `SMSBackupRestore`, `Signal/Backups`) | `/Sauvegardes/Applications/<nom>` | Vers le dossier distant | ❌ Non | Écraser |

Options à régler dans chaque paire :
- **Synchroniser les sous-dossiers** : ✅
- **Synchroniser les fichiers cachés** : ❌ (ignore les miniatures et `.trash` de WhatsApp)
- **Supprimer les fichiers effacés** : ❌ pour toutes les **sauvegardes**. Si le téléphone est perdu ou WhatsApp réinstallé, la sauvegarde distante serait sinon effacée elle aussi. Ne l'activez que pour les **notes** en synchro bidirectionnelle.
- **Conserver les dates de modification** : ✅ si l'option est proposée

**Étape 4 : planification quotidienne**

Dans la paire → section **Planification** :
1. Activez **Utiliser la synchronisation planifiée**.
2. Intervalle : **Quotidien**, heure **03:00**. WhatsApp écrit sa sauvegarde vers 2 h ; à 3 h, le fichier est complet et le téléphone en charge.
3. **Conditions** :
   - **Wi-Fi uniquement** ✅. En mode local, ajoutez le **SSID de votre Wi-Fi** dans les réseaux autorisés : le serveur n'est joignable qu'à la maison.
   - **Uniquement en charge** ✅
   - Données mobiles ❌
4. Option conseillée pour les notes : **Synchronisation instantanée** (dès qu'un fichier change), en plus du planning.
5. Enregistrez, puis faites une première **Synchroniser maintenant** pour envoyer l'existant.

Le lendemain, vérifiez dans FolderSync → **Historique de synchronisation** (statut « Terminé ») et sur le web que `msgstore.db.crypt14` porte bien la date de la nuit.

**Côté serveur, rien à ajouter** : le dossier `/Sauvegardes/WhatsApp/Databases` est déjà surveillé par la purge des copies datées (§7.2, `APP_BACKUP_CLEANUP_DIRS`). Si vous envoyez d'autres sauvegardes **datées** (par ex. `signal-2026-11-04.backup`), ajoutez leur dossier dans `.env` :
```ini
APP_BACKUP_CLEANUP_DIRS=Sauvegardes/WhatsApp/Databases;Sauvegardes/Applications/Signal
```
puis `docker compose up -d`.

### 8.4 Autres clients WebDAV

| Plateforme | Client | Configuration |
|---|---|---|
| Windows / macOS / Linux (sauvegardes planifiées) | [rclone](https://rclone.org/webdav/) | `rclone config` → type `webdav`, vendor `nextcloud`, URL ci-dessus. Puis `rclone sync C:\Documents cloud:Sauvegardes/PC` dans le Planificateur de tâches ou cron |
| Windows (lecteur réseau) | [WinSCP](https://winscp.net/), [RaiDrive](https://www.raidrive.com/) | Protocole WebDAV, hôte `192.168.100.216`, port `8080`, chemin `/remote.php/dav/files/alice/` |
| Windows (Explorateur natif) | « Connecter un lecteur réseau » | ⚠️ Refuse l'authentification en **HTTP** par défaut. À utiliser seulement sur le VPS en HTTPS ; en local, préférez le client Nextcloud Desktop ou WinSCP |
| macOS | Finder → **⌘K** | `http://192.168.100.216:8080/remote.php/dav/files/alice/` |
| Linux | Nautilus / Dolphin | `dav://192.168.100.216:8080/remote.php/dav/files/alice/` (`davs://` en HTTPS) |
| iOS | Documents (Readdle), FE File Explorer | Ajouter un serveur WebDAV avec l'URL ci-dessus |

### 8.5 Limites et bonnes pratiques

- **Gros fichiers** : sans limite en local. Sur le VPS via **Cloudflare Tunnel**, chaque requête est limitée à **100 Mo**. Or les clients WebDAV génériques comme FolderSync en mode WebDAV ou rclone envoient souvent un fichier **d'un seul bloc**. Pour des sauvegardes de plus de 100 Mo, utilisez l'option **Nginx Proxy Manager** (§5.3), ou rclone avec `--webdav-nextcloud-chunk-size 50M`.
- **Mauvais mot de passe** : après plusieurs échecs, la protection anti-force brute de Nextcloud **ralentit** les connexions venant de cette adresse. En mode local, tous les appareils passent par Docker et partagent souvent la même adresse vue par Nextcloud : un FolderSync mal configuré peut donc ralentir tout le monde. Corrigez le mot de passe, puis réinitialisez (voir §12).
- **Un mot de passe d'application par appareil ou application**, révoqué en cas de perte du téléphone.
- **Après la migration sur VPS** : dans FolderSync, modifiez simplement l'URL du compte (`https://cloud.mondomaine.fr/remote.php/dav/files/alice/`) et activez le HTTPS. Retirez aussi la restriction au SSID du Wi-Fi pour pouvoir sauvegarder depuis n'importe où.

---

## 9. Utilisateurs, sécurité & administration

Tout ce qui suit est appliqué **automatiquement** à l'installation puis à chaque `.\scripts\optimize.ps1`. Seule la **configuration** est modifiée : aucun compte, fichier ou partage existant n'est supprimé, et la base n'est pas réinitialisée. Les réglages se trouvent dans `.env` :

```ini
USER_GROUPS=Entreprises Clients Equipe             # groupes créés automatiquement
SECURITY_ALLOW_PUBLIC_LINKS=false                  # liens publics anonymes
SECURITY_2FA_ENFORCED_GROUPS=admin Entreprises Equipe   # 2FA obligatoire (liste | all | none)
PASSWORD_MIN_LENGTH=12
DEFAULT_QUOTA=none                                 # ou "50 GB", "1 TB"…
```
Après une modification : `docker compose up -d` puis `.\scripts\optimize.ps1`.

### 9.1 Portail de connexion & accès anonyme

| Mesure | Détail | Script |
|---|---|---|
| **Page d'accueil = page de connexion** | Toute adresse ouverte sans session redirige vers `/login`. Après connexion : *Tableau de bord* puis *Fichiers* (`defaultapp`) | [`security.sh`](scripts/occ/security.sh) |
| **Aucun accès anonyme** | Liens de partage publics **désactivés**, envoi public désactivé, partage par e-mail désactivé, application `guests` désactivée, partage fédéré et annuaire public désactivés | `security.sh` |
| Si les liens sont réactivés | `SECURITY_ALLOW_PUBLIC_LINKS=true` : **mot de passe obligatoire** et **expiration à 14 jours** imposée | `security.sh` |
| **Mots de passe d'application obligatoires** | Les clients (WebDAV, CalDAV, FolderSync, rclone…) n'acceptent **pas** le mot de passe principal (`token_auth_enforced`). Les applications Nextcloud mobiles et de bureau passent par la page de connexion, ce qui est transparent | `security.sh` |
| Anti-force brute | Ralentissement progressif après des échecs de connexion, avec une liste blanche possible (*Administration → Sécurité*) | app `bruteforcesettings` |
| Sessions | 24 h d'inactivité, « Rester connecté » 15 jours | `security.sh` |

### 9.2 Mots de passe complexes & double authentification

**Politique de mots de passe** (app `password_policy`, *Administration → Sécurité*) :
- au moins **12 caractères**, avec majuscules et minuscules, chiffres et caractères spéciaux ;
- refus des mots de passe **courants** et de ceux ayant **déjà fuité** (vérification anonyme *Have I Been Pwned*) ;
- les 5 derniers mots de passe ne peuvent pas être réutilisés ;
- pas de blocage du compte après N échecs : c'est voulu, car un FolderSync mal configuré bloquerait le compte. L'anti-force brute ralentit les attaques à la place.

**Double authentification (2FA)** :
- Fournisseurs installés : **TOTP** (application d'authentification), **WebAuthn** (clés de sécurité YubiKey et *passkeys*), **codes de secours**.
- **Obligatoire** pour les groupes `admin`, `Entreprises` et `Equipe` ; facultative mais conseillée pour `Clients` et les particuliers. Pour l'imposer à tout le monde : `SECURITY_2FA_ENFORCED_GROUPS=all`.
- À la connexion suivante, chaque compte concerné est **guidé** pour configurer sa 2FA.
- Les applications mobiles et de bureau déjà connectées continuent de fonctionner, puisqu'elles utilisent des mots de passe d'application.
- **Téléphone perdu** : l'utilisateur se connecte avec un code de secours. Sinon, un administrateur peut désactiver la 2FA du compte : `docker compose exec -u www-data app php occ twofactorauth:disable <compte> totp`.

### 9.3 Groupes & isolation des comptes

| Groupe | Usage type | 2FA |
|---|---|---|
| `Entreprises` | Comptes professionnels | obligatoire |
| `Equipe` | Votre équipe interne et les administrateurs délégués | obligatoire |
| `Clients` | Clients ou particuliers à qui vous fournissez un espace | facultative |
| `admin` | Administrateurs Nextcloud | obligatoire |

**Isolation** :
- **Stockage propre** : chaque compte a son propre dossier (`cloud_data/<compte>/files`), invisible des autres. Les nouveaux comptes démarrent **vides**, sans fichiers d'exemple.
- **Cloisonnement par groupe** : un compte ne peut partager qu'avec les **membres de ses groupes**, et l'autocomplétion du partage ne révèle que ces comptes, ou un compte dont l'identifiant exact est saisi. Les membres de `Clients` ne voient donc ni les comptes d'`Entreprises` ni les autres clients.
- Pour isoler plusieurs **entreprises** entre elles, créez **un groupe par entreprise** (ex. `Ent-Dupont`, `Ent-Martin`) en plus du groupe générique `Entreprises`.
- **Quota** : illimité par défaut (`DEFAULT_QUOTA`), réglable **par compte**.
- **Administrateur délégué** : *Comptes* → compte → *Administrateur de groupe pour…*. Il peut gérer les comptes de son groupe, et seulement ceux-là.

Créer un groupe supplémentaire :
```powershell
docker compose exec -u www-data app php occ group:add Ent-Dupont --display-name "Entreprise Dupont"
```

### 9.4 Ajouter des comptes

**A. Via l'interface d'administration**
1. Connectez-vous en administrateur → avatar (en haut à droite) → **Comptes**.
2. **+ Nouveau compte**.
3. Renseignez :
   - **Identifiant** (ex. `alice.martin`) : définitif, sert à la connexion et à l'URL WebDAV ;
   - **Nom affiché** ;
   - **Mot de passe** temporaire conforme à la politique, ou laissez vide et renseignez l'**e-mail** pour qu'un lien de définition du mot de passe soit envoyé (nécessite un serveur d'e-mail configuré, *Administration → Paramètres de base*) ;
   - **Groupes** : `Entreprises`, `Clients`, `Equipe`, `Ent-Dupont`… ;
   - **Administrateur de groupe** (facultatif) ;
   - **Quota** : `Illimité` ou une valeur, par ex. `50 GB`.
4. **Ajouter un nouveau compte**. Transmettez l'identifiant et le mot de passe temporaire par un canal sûr.

**B. En ligne de commande (`occ user:add`)**

Script fourni : il génère un mot de passe temporaire conforme et applique groupes, e-mail et quota.
```powershell
.\scripts\new-user.ps1 -User alice.martin -Name "Alice Martin" -Email alice@dupont.fr -Group Entreprises,Ent-Dupont -Quota "100 GB"
.\scripts\new-user.ps1 -User client.durand -Name "M. Durand" -Group Clients -Quota "20 GB"
```

Commandes `occ` brutes, équivalentes (Linux, macOS, VPS, ou pour les automatiser) :
```bash
# Créer le compte (mot de passe lu dans OC_PASS pour ne pas apparaître dans l'historique)
docker compose exec -u www-data -e OC_PASS='Mot-De-Passe-Temp-42!' app \
  php occ user:add --password-from-env --display-name="Alice Martin" \
  --group=Entreprises --group=Ent-Dupont alice.martin

# E-mail et quota
docker compose exec -u www-data app php occ user:setting alice.martin settings email alice@dupont.fr
docker compose exec -u www-data app php occ user:setting alice.martin files quota "100 GB"

# Gestion courante
docker compose exec -u www-data app php occ group:adduser Equipe alice.martin     # ajouter à un groupe
docker compose exec -u www-data app php occ group:removeuser Clients alice.martin # retirer d'un groupe
docker compose exec -u www-data -e OC_PASS='Nouveau-Mdp-2026!' app php occ user:resetpassword --password-from-env alice.martin
docker compose exec -u www-data app php occ user:disable alice.martin   # suspendre (données conservées)
docker compose exec -u www-data app php occ user:enable alice.martin
docker compose exec -u www-data app php occ user:info alice.martin       # détails, groupes, quota, stockage
docker compose exec -u www-data app php occ user:list                    # tous les comptes
docker compose exec -u www-data app php occ user:delete alice.martin     # ⚠ SUPPRIME aussi ses fichiers
```

À sa première connexion, l'utilisateur change son mot de passe (*Paramètres personnels → Sécurité*) et configure sa 2FA si son groupe l'exige. Il crée ensuite des **mots de passe d'application** pour ses clients WebDAV (§8).

### 9.5 Tableau de bord d'administration & audit

| Besoin | Où le voir | Source |
|---|---|---|
| **Consommation de stockage par compte** | *Comptes* : colonne **Quota / Utilisé** avec barre de progression | natif |
| **Stockage par compte ET par groupe** (fichiers, versions, corbeille, dernière connexion) | Fichier **`/Administration/Rapport-stockage.md`** dans l'espace de l'admin, régénéré **chaque jour à 6 h**. À la demande : `.\scripts\status.ps1` | [`storage-report.php`](scripts/occ/storage-report.php) |
| **Ressources du serveur** (CPU, RAM, disque, réseau), nombre de fichiers et de partages, comptes actifs, taille de la base, versions PHP et PostgreSQL | *Administration → **Système*** | app `serverinfo` |
| **Flux d'activité** de chaque compte (envois, modifications, suppressions, partages, commentaires) | Application **Activité** (icône ⚡) et widget du *Tableau de bord* : chaque compte voit **son** flux et celui de ses partages | app `activity` |
| **Audit global « qui a fait quoi »** sur **tous** les comptes : connexions et échecs, fichiers créés, modifiés, renommés, supprimés, restaurés, partages, création et suppression de comptes, changements de groupes, actions d'administration | *Administration → **Journalisation*** : filtrer sur l'application `admin_audit` (cochez le niveau **Info**). La liste se met à jour **en direct** | apps `admin_audit` + `logreader` |
| **Santé des conteneurs Docker** et ressources par conteneur | `.\scripts\status.ps1` (ou `./scripts/status.sh`) | `docker compose ps` / `docker stats` |
| **Tableau de bord système temps réel** (CPU, RAM, disques, réseau, chaque conteneur) | http://localhost:61208 après `docker compose --profile monitoring up -d` | Glances (optionnel) |

**Lire l'audit en ligne de commande** (utile pour rechercher) :
```powershell
# 50 dernières actions de tous les comptes
docker compose exec -u www-data app sh -c "grep admin_audit /var/www/html/data/nextcloud.log | tail -n 50"
# Toutes les actions d'un compte
docker compose exec -u www-data app sh -c "grep admin_audit /var/www/html/data/nextcloud.log | grep alice.martin"
# Les suppressions
docker compose exec -u www-data app sh -c "grep admin_audit /var/www/html/data/nextcloud.log | grep -i delet"
```

**État global en une commande** :
```powershell
.\scripts\status.ps1          # conteneurs (santé), CPU/RAM par conteneur, disque, stockage par compte/groupe
.\scripts\status.ps1 -Full    # + bilan complet de performance et de sécurité
```

> **Glances (profil `monitoring`)** : il a un accès en **lecture** au socket Docker, ce qui est puissant. Il n'écoute que sur `127.0.0.1` : ne l'exposez **jamais** sur Internet. Sur le VPS, consultez-le via un tunnel SSH : `ssh -L 61208:127.0.0.1:61208 utilisateur@VPS`.

---

## 10. E-mail Gmail & alertes de sécurité centralisées

Toutes les alertes (sécurité, connexions, comptes, stockage) et les e-mails système (mot de passe oublié, partages, activité) partent par **Gmail** vers **`styvekentsa@gmail.com`**, l'adresse associée au compte administrateur.

### 10.1 Configuration (`.env`)

```ini
ADMIN_EMAIL=styvekentsa@gmail.com     # e-mail du compte admin + destinataire des alertes
SMTP_HOST=smtp.gmail.com              # → mail_smtpmode=smtp, mail_smtphost
SMTP_PORT=587                         # → mail_smtpport
SMTP_SECURE=tls                       # → mail_smtpsecure (STARTTLS sur 587)
SMTP_AUTHTYPE=LOGIN                   # → mail_smtpauth=true, mail_smtpauthtype
SMTP_NAME=styvekentsa@gmail.com       # → mail_smtpname
SMTP_PASSWORD=                        # ← COLLER ICI le mot de passe d'application Gmail
MAIL_FROM_ADDRESS=styvekentsa         # → mail_from_address
MAIL_DOMAIN=gmail.com                 # → mail_domain   (expéditeur : styvekentsa@gmail.com)
```

**Pourquoi des variables Docker plutôt que `config.php`** : l'image Nextcloud convertit ces variables en paramètres `mail_*` **à chaque requête** (fichier `config/smtp.config.php`). Le mot de passe n'est donc **jamais écrit dans `config.php`** : il reste dans `.env`, qui est exclu de Git et protégé. Conséquence : une modification faite dans *Administration → Paramètres de base → Serveur e-mail* est **ignorée**. Modifiez toujours `.env`, puis `docker compose up -d`.

### 10.2 Générer le mot de passe d'application Gmail

Gmail **refuse** le mot de passe normal du compte Google pour SMTP. Il faut un **mot de passe d'application** de 16 lettres :

1. Connectez-vous au compte Google **styvekentsa@gmail.com**.
2. Activez la **Validation en deux étapes**, indispensable : <https://myaccount.google.com/signinoptions/twosv>.
3. Ouvrez **<https://myaccount.google.com/apppasswords>** (ou *Compte Google → Sécurité → Validation en deux étapes → Mots de passe des applications*, tout en bas).
4. **Nom de l'application** : `Nextcloud my-private-cloud` → **Créer**.
5. Google affiche un code de **16 lettres** (ex. `abcd efgh ijkl mnop`). Copiez-le **sans les espaces**.
6. Collez-le dans `.env` :
   ```ini
   SMTP_PASSWORD=abcdefghijklmnop
   ```
   (sans guillemets ni espace en fin de ligne)
7. Appliquez :
   ```powershell
   docker compose up -d          # recrée les conteneurs app et cron avec la nouvelle variable
   .\scripts\optimize.ps1        # associe l'e-mail à l'admin, active les notifications
   ```

> Le menu « Mots de passe des applications » est absent ? La validation en deux étapes n'est pas active, ou le compte relève de Google Workspace et l'administrateur l'a désactivé, ou le compte utilise uniquement des clés d'accès (*passkeys*) : ajoutez alors une méthode de validation en deux étapes classique. Le mot de passe d'application est **révocable** sur la même page, et se révoque automatiquement si vous changez le mot de passe du compte Google.

### 10.3 Tester l'envoi

```powershell
.\scripts\mail-test.ps1                          # e-mail de test vers styvekentsa@gmail.com
.\scripts\mail-test.ps1 -To autre@exemple.fr     # vers une autre adresse
.\scripts\mail-test.ps1 -Alert                   # exemple d'alerte de sécurité
```
(Linux/VPS : `./scripts/mail-test.sh`, `./scripts/mail-test.sh autre@exemple.fr`, `./scripts/mail-test.sh --alert`)

En CLI directe :
```powershell
docker compose exec -u www-data app php /opt/scripts/notify.php test styvekentsa@gmail.com
```

> **À propos de `occ mail:send-test`** : cette commande n'existe pas dans toutes les versions de Nextcloud (vérifiez avec `docker compose exec -u www-data app php occ list mail`). Le script [`notify.php`](scripts/occ/notify.php) fait le même travail sur **toutes** les versions : il utilise le **moteur d'envoi de Nextcloud** avec la configuration SMTP du `.env`. En cas de succès, il marque le test comme réussi, ce qui supprime l'avertissement « e-mail non vérifié » de *Administration → Vue d'ensemble*. Le bouton **Envoyer un e-mail** de *Administration → Paramètres de base* fonctionne aussi.

Résultat attendu : `OK : e-mail envoyé à styvekentsa@gmail.com`. Pensez à vérifier le dossier **Spam** au premier envoi. En cas d'échec, le script indique la cause probable :

| Message | Cause | Solution |
|---|---|---|
| `535 … Username and Password not accepted` | Mot de passe normal utilisé, ou mot de passe d'application mal copié | Recréer un mot de passe d'application, le coller **sans espaces** |
| `530 Authentication Required` | `SMTP_NAME` ou `SMTP_PASSWORD` vide | Compléter `.env`, puis `docker compose up -d` |
| `Connection could not be established` / délai dépassé | Port 587 sortant bloqué (pare-feu, FAI, hébergeur VPS) | Autoriser le port 587 sortant, ou essayer `SMTP_PORT=465` et `SMTP_SECURE=ssl` |
| L'e-mail arrive en Spam | Premier envoi | Marquer « Non spam » ; l'expéditeur doit rester l'adresse Gmail elle-même |

Limite Gmail : environ **500 e-mails par jour** pour un compte gratuit, largement suffisant pour un cloud personnel.

### 10.4 Alertes de sécurité et notifications

**Ce qui déclenche un e-mail vers `styvekentsa@gmail.com`** :

| Événement | Règle | Fréquence |
|---|---|---|
| 🔐 **Nouvelle connexion réussie** depuis un **nouvel appareil ou une nouvelle IP** (n'importe quel compte) | Combinaison compte + IP + appareil jamais vue (une mise à jour d'application n'est pas un nouvel appareil) | immédiate (≤ 5 min) |
| 🚨 **Échecs de connexion répétés** (tentative d'intrusion) | ≥ **5 échecs en 15 min** depuis une même IP ou sur un même compte | au plus 1×/heure par IP ou compte |
| 🚨 **Attaque par force brute** détectée par Nextcloud | IP mise en ralentissement | 1×/heure par IP |
| 👤 **Compte créé, supprimé, activé ou désactivé**, ajouté ou retiré d'un groupe, mot de passe modifié par un admin | Journal d'audit (`admin_audit`) | immédiate |
| ⚠️ **Changement de rôle** : ajout au groupe `admin`, droits d'administrateur de groupe | Signalé comme « **Élévation de privilèges** » | immédiate |
| 💾 **Stockage saturé** : disque des données, disque Docker (base de données), quota d'un compte | ≥ **90 %** | 1×/jour par disque ou compte |

**Fonctionnement** : le conteneur `cron` lance [`notify.php alerts`](scripts/occ/notify.php) toutes les **5 minutes**. Il lit les nouvelles lignes du journal Nextcloud, alimenté par `admin_audit` (§9.5), et regroupe les événements d'un même passage dans **un seul e-mail**. Il ajoute aussi une **notification Nextcloud** (cloche et push sur le téléphone de l'admin). Si Gmail est momentanément indisponible, les alertes sont **conservées et renvoyées** au passage suivant. Au premier lancement, l'historique existant est ignoré : seuls les nouveaux événements sont signalés.

Réglages dans `.env` :
```ini
ALERT_EMAIL=                       # autre destinataire (vide = ADMIN_EMAIL)
ALERT_NEW_LOGIN=true               # false = ne pas signaler les nouvelles connexions
ALERT_FAILED_LOGIN_THRESHOLD=5     # nombre d'échecs…
ALERT_FAILED_LOGIN_WINDOW=900      # …dans cette fenêtre (secondes)
ALERT_ACCOUNT_CHANGES=true
ALERT_STORAGE_PERCENT=90
```

**Notifications natives de Nextcloud**, configurées en complément par [`mail-notifications.sh`](scripts/occ/mail-notifications.sh) :
- L'e-mail `styvekentsa@gmail.com` est associé au compte **admin**, ce qui permet aussi la réinitialisation du mot de passe par e-mail.
- Applications `notifications` et `activity` actives. Le flux d'activité de l'admin envoie un **e-mail immédiat** pour la catégorie **Sécurité** (connexion avec 2FA, mot de passe d'application créé) et pour les **paramètres personnels** (mot de passe ou e-mail modifié).
- `admin_notifications` : activée si elle est disponible pour votre version. Sa fonction (envoyer des notifications aux comptes) est désormais assurée par `occ notification:generate`.
- Mises à jour de Nextcloud disponibles : notification native aux administrateurs.

> **Limite en mode local** : derrière Docker Desktop, toutes les connexions du réseau local peuvent apparaître avec la **même IP** (passerelle Docker). Un nouvel appareil est alors détecté grâce à son **identité de navigateur ou d'application**, ce qui fonctionne. L'IP affichée n'est fiable qu'en mode VPS, derrière le proxy.

---

## 11. Exploitation courante

```bash
docker compose ps                                              # état
docker compose logs -f app                                     # journaux
docker compose exec -u www-data app php occ status             # état Nextcloud
docker compose exec -u www-data app php occ setupchecks        # contrôles
docker compose down                                            # arrêt (données conservées)
```

### 11.1 Indexation et maintenance des fichiers

Nextcloud tient un **index** (table `oc_filecache`) de tous les fichiers. Un fichier copié **directement sur le disque** (dans `cloud_data/`, via l'Explorateur Windows, un disque USB, `rsync`…) **n'apparaît pas** dans Nextcloud tant qu'il n'a pas été indexé :

```powershell
# Indexer TOUS les fichiers de TOUS les utilisateurs (rapide si peu de changements)
docker compose exec -u www-data app php occ files:scan --all

# Plus rapide : un seul utilisateur, ou un seul dossier
docker compose exec -u www-data app php occ files:scan alice
docker compose exec -u www-data app php occ files:scan --path="/alice/files/Photos/2026"

# Dossier racine seulement, sans descendre dans les sous-dossiers
docker compose exec -u www-data app php occ files:scan --path="/alice/files/Photos" --shallow
```

Les fichiers doivent être placés dans `cloud_data/<utilisateur>/files/…`, et non à la racine de `cloud_data`. Après un gros import de photos, générez aussi leurs vignettes :
`docker compose exec -d -u www-data app php occ preview:generate-all alice`

Autres commandes de maintenance utiles :

| Commande (`docker compose exec -u www-data app php occ …`) | Rôle |
|---|---|
| `files:cleanup` | Supprime de l'index les entrées orphelines (fichiers effacés du disque) |
| `files:repair-tree` | Répare les incohérences d'arborescence |
| `files:scan-app-data` | Réindexe les données internes (aperçus, avatars) |
| `preview:generate-all` | Génère les vignettes manquantes |
| `db:add-missing-indices` | Ajoute les index de base manquants (aussi fait à chaque démarrage) |
| `maintenance:repair --include-expensive` | Réparations complètes, types MIME compris |
| `trashbin:cleanup --all-users` / `versions:cleanup` | Libère de l'espace (corbeille / anciennes versions) |
| `background-job:list` | Liste les tâches de fond planifiées |

PostgreSQL (après un gros import ou un grand ménage) :
```powershell
docker compose exec db sh -c 'vacuumdb -U "$POSTGRES_USER" -d "$POSTGRES_DB" --analyze --verbose'
```

### 11.2 Mise à jour

Augmentez `NEXTCLOUD_IMAGE_TAG` d'**une version majeure à la fois** (`32-apache` → `33-apache`) et faites une sauvegarde, puis :
```powershell
docker compose build --pull     # reconstruit l'image enrichie (ffmpeg…) sur la nouvelle base
docker compose pull db redis    # met à jour PostgreSQL/Redis (même version majeure)
docker compose up -d
.\scripts\optimize.ps1          # réapplique les réglages et affiche le bilan
```

## 12. Dépannage

| Symptôme | Solution |
|---|---|
| « Accès via un domaine non approuvé » | Vérifiez `NEXTCLOUD_TRUSTED_LAN=true` (local) ou ajoutez le nom dans `NEXTCLOUD_TRUSTED_DOMAINS`, puis `docker compose up -d` |
| L'app mobile ne trouve pas le serveur | Adresse avec `http://` **et** `:8080`, téléphone sur le même Wi-Fi, pas de VPN actif sur le téléphone, pare-feu Windows (§1) |
| Photos non envoyées en arrière-plan | Android : batterie « Non restreinte ». iOS : ouvrir l'application, rafraîchissement en arrière-plan activé |
| Dossier `Android/media/…` invisible dans le sélecteur | Autorisation « Accès à tous les fichiers » (§7.0), ou version F-Droid de l'application |
| `msgstore.db.crypt14` pas mis à jour sur le cloud | Règle « Remplacer la version distante », sous-dossiers désactivés, batterie non restreinte, *Téléverser maintenant* |
| Le disque se remplit de `msgstore-AAAA-MM-JJ…` | Vérifiez que le dossier distant correspond à `APP_BACKUP_CLEANUP_DIRS` ; `docker compose logs cron` |
| FolderSync / WebDAV : erreur **401** | Identifiant = ID de connexion (pas l'e-mail) ; mot de passe d'**application** ; tester avec `.\scripts\webdav-setup.ps1 -User <id>` |
| FolderSync / WebDAV : erreur **404** | URL incomplète : elle doit se terminer par `/remote.php/dav/files/<USERNAME>/` |
| Connexions très lentes après des erreurs de mot de passe | Protection anti-force brute : `docker compose exec -u www-data app php occ security:bruteforce:reset <IP>`. L'IP bloquée est indiquée dans *Paramètres d'administration → Journalisation* |
| Envoi de plus de 100 Mo en échec (**413**) sur le VPS | Limite de Cloudflare Tunnel : passez par NPM, ou utilisez un client qui envoie par morceaux (§8.5) |
| FolderSync ne se lance pas la nuit | Batterie « Non restreinte », SSID du Wi-Fi correct, téléphone en charge ; consulter l'historique de synchronisation |
| Fichiers copiés sur le disque invisibles dans Nextcloud | `occ files:scan --all` (§11.1) ; vérifier qu'ils sont dans `cloud_data/<utilisateur>/files/` |
| Galeries lentes / vignettes grises | `occ preview:generate-all` une fois ; `docker compose logs cron` pour le traitement continu |
| Pas de vignettes vidéo / HEIC | Image enrichie non utilisée : `docker compose build --pull && docker compose up -d`, puis `.\scripts\optimize.ps1` |
| Le bilan indique « Dernière exécution de cron.php : jamais » | Attendre 5 min ; sinon `docker compose logs cron` |
| Échec de construction de l'image (`docker compose up`) | Accès Internet nécessaire pour `apt-get` ; relancer `docker compose build --no-cache` |
| Admin bloqué : téléphone 2FA perdu, sans code de secours | `docker compose exec -u www-data app php occ twofactorauth:disable admin totp`, puis reconfigurer la 2FA |
| Mot de passe admin oublié | `docker compose exec -u www-data app php occ user:resetpassword admin` |
| Un client WebDAV refuse le mot de passe du compte | Normal : utilisez un **mot de passe d'application** (`token_auth_enforced`, §9.1) |
| « Le mot de passe ne respecte pas la politique » | 12 caractères minimum, majuscules et minuscules, chiffre, caractère spécial, mot de passe non compromis |
| Un compte ne trouve pas un collègue pour partager | Ils doivent avoir **un groupe en commun** (§9.3) |
| L'audit n'apparaît pas dans *Journalisation* | Cochez le niveau **Info** dans le filtre ; relancez `.\scripts\optimize.ps1` |
| Aucun e-mail ne part | `.\scripts\mail-test.ps1` : le message indique la cause (§10.3) ; `SMTP_PASSWORD` rempli ? `docker compose up -d` après modification |
| Trop d'alertes « nouvelle connexion » | Normal les premiers jours, le temps que les appareils habituels soient appris ; sinon `ALERT_NEW_LOGIN=false` |
| Aucune alerte reçue | `docker compose logs cron \| findstr alerts` ; vérifier que `admin_audit` est actif (`.\scripts\optimize.ps1 -CheckOnly`) |
| Apache ne démarre plus après une modification de `zz-nextcloud-network.conf` | `docker compose logs app` ; tester avec `docker compose exec app apachectl -t` |
| Inaccessible depuis le téléphone | Pare-feu Windows (§1), réseau en profil *Privé*, `APP_BIND=0.0.0.0` |
| « Data directory is readable by other users » | Mode local : vérifiez `CLOUD_MODE=local`. Linux : `sudo chown -R 33:33 <data> && sudo chmod 770 <data>` |
| Hook ignoré (« not executable ») sous Linux | `chmod +x scripts/*.sh scripts/occ/*.sh scripts/hooks/*/*.sh` |
| Erreur `\r` / `bad interpreter` | Scripts en CRLF → `dos2unix scripts/*.sh scripts/*/*.sh scripts/hooks/*/*.sh` |
| Fichier verrouillé (« locked ») après une coupure | `docker compose exec redis sh -c 'redis-cli -a "$REDIS_PASSWORD" --no-auth-warning FLUSHALL'` |
| Boucle de redirection en HTTPS | Le proxy doit viser `http://app:80`, et `TRUSTED_PROXIES` doit être égal à `FRONTEND_SUBNET` |
| Lenteur avec beaucoup de petits fichiers (Windows) | Normal avec un dossier Windows monté dans Docker ; les performances seront meilleures sur le VPS Linux |
