# Planet Raves développement

Vous êtes ici sur le dépôt GitHub de développement du site Planet Raves.


Ici se trouve tout le code nécessaire au déploiement du site.

## Outils utilisés

- [GitHub](https://github.com/planetraves/debug) : plateforme de développement, de versionnage et d'hébergement du site sur GitHub Pages.
- [Supabase](https://supabase.com/dashboard/project/jpicbqssqixagnwejefu) : gestion de la base de données, des comptes utilisateur·rice·s, de la sécurité et de l'automatisation.
- [MkDocs](https://www.mkdocs.org) : générateur de site statique (avec le thème [Material for MkDocs](https://squidfunk.github.io/mkdocs-material/)) utilisé pour construire les pages du site.
- [Resend](https://resend.com) : envoi des emails transactionnels (notifications de modération) via une fonction Edge Supabase.
- [Python](https://www.python.org) : langage des scripts d'outillage du projet (déploiement, gestion de la base de données via `sbdb.py`).
- [Pico CSS](https://picocss.com) : petite bibliothèque CSS minimaliste utilisée pour la mise en forme des formulaires et éléments d'interface.

## Développement

Le projet est un site statique généré par MkDocs, avec un backend Supabase. Les
scripts d'outillage sont en Python et tournent dans un environnement virtuel (`venv`).

### 1. Prérequis

- [Python](https://www.python.org/downloads/) 3.10 ou plus, avec `pip`.
- [Git](https://git-scm.com/).
- Un jeton d'accès Supabase placé dans `~/.supabase/planetraves.token` (nécessaire
  pour `sbdb.py` et le déploiement release).

### 2. Activer le projet

Depuis la racine du dépôt, lancez :

```bat
activate.bat
```

Ce script :

- crée l'environnement virtuel `venv/` s'il n'existe pas (`python -m venv venv`) ;
- l'active ;
- installe les dépendances de `requirements.txt` ;
- charge les variables d'environnement (`planetraves.env`) et le jeton Supabase.

> À faire une fois par session de terminal. Pour réinstaller les dépendances
> manuellement : `python -m pip install -r requirements.txt`.

### 3. Prévisualiser le site en local

```bat
serve.bat
```

Équivaut à `mkdocs serve --dev-addr=127.0.0.1:8000 --livereload`. Le site est alors
disponible sur <http://127.0.0.1:8000> et se recharge automatiquement à chaque
modification.

### 4. Déployer

Le déploiement génère le site (`mkdocs build`) puis le publie sur GitHub Pages via
`ghp-import`.

- **Debug / dev** (identifiants Supabase de développement, remote `origin`) :

  ```bat
  python deploy.py
  ```

- **Release / production** (identifiants Supabase de production, remote `release`) :

  ```bat
  python deploy.py --release
  ```

Le hash du commit courant est injecté dans les URLs des fichiers JS/CSS pour forcer
le rafraîchissement du cache.

## sbdb.py — outil base de données & Supabase

`sbdb.py` communique avec Supabase directement (Postgres via `psycopg2`) ou via
l'API de gestion (HTTPS), ce qui contourne les problèmes de proxy/TLS du CLI officiel.
Il gère deux environnements : `dev` et `prod`.

Commandes principales :

| Commande | Description |
| --- | --- |
| `py sbdb.py` | dump complet de `dev` |
| `py sbdb.py dump --env dev` | dump du schéma / des données |
| `py sbdb.py query --env dev "SELECT ..."` | exécuter une requête SQL |
| `py sbdb.py exec --env prod --file PATH` | exécuter un `.sql` ou un dossier de dump |
| `py sbdb.py migrate --from dev --to prod` | recopier `dev` vers `prod` |
| `py sbdb.py config get --env dev` | récupérer la config auth (URLs, templates…) |

Commandes propres à ce projet :

| Commande | Description |
| --- | --- |
| `py sbdb.py deploy-function send-email --env dev` | déployer la fonction Edge `send-email` |
| `py sbdb.py delete-user EMAIL_OU_ID --env dev` | supprimer un compte (cascade sur le profil) |
| `py sbdb.py update-email EMAIL_OU_ID NOUVEL_EMAIL` | changer l'email d'un compte |


> Les opérations utilisent le jeton `~/.supabase/planetraves.token`. Ajoutez `--yes` pour sauter la confirmation des actions
> destructrices, et `--help` sur n'importe quelle commande pour le détail des options.

## test/create.py — jeux de données de test

`test/create.py` remplit la base **DEV** avec de faux évènements et de faux comptes
pour tester le site. Il supprime d'abord les données de test existantes (évènements
marqués `is_test`, comptes dont l'email commence par `testuser`) avant d'en recréer.

| Commande | Description |
| --- | --- |
| `py test/create.py event 30` | crée 30 faux évènements (à partir d'aujourd'hui) |
| `py test/create.py user 10` | crée 10 faux comptes (avec profils) |
| `py test/create.py event -d` | supprime uniquement les faux évènements |
| `py test/create.py user -d` | supprime uniquement les faux comptes |

Chaque exécution écrit aussi le jeu généré dans `test/dummy-events.json` /
`test/dummy-users.json`.

> ⚠️ À n'utiliser que sur l'environnement **DEV**. Le script a besoin des variables
> `SUPABASE_DEV_URL` et `SUPABASE_DEV_ANON_KEY`, ainsi que de la **clé service_role**.

### Secret à stocker dans le wallet Windows

La clé `service_role` (droits admin) est lue depuis le gestionnaire d'identifiants
Windows via `keyring`, sous l'entrée :

| Service | Utilisateur | Valeur |
| --- | --- | --- |
| `planetraves.dev.servicerolekey` | `planetraves` | la clé **service_role** du projet DEV |

La clé se récupère dans Supabase : **Project Settings → API → `service_role` secret**.
Pour l'enregistrer une fois dans le wallet :

```bat
python -m keyring set planetraves.dev.servicerolekey planetraves
```

(le mot de passe demandé est la clé `service_role` à coller).






