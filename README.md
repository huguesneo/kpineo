# NEO Admin

Tableau de bord admin pour NEO Performance — gestion des membres, objectifs, KPIs et tâches.

## Stack technique

- **Frontend** : React 18 + Vite + TailwindCSS
- **Backend / Auth / DB** : Supabase
- **Hébergement** : Netlify

## Setup local

### 1. Variables d'environnement

Copier `.env.example` en `.env` et renseigner les valeurs :

```bash
cp .env.example .env
```

```env
VITE_SUPABASE_URL=https://cbqwrmyctsfdqmenczhm.supabase.co
VITE_SUPABASE_ANON_KEY=votre_clé_anon_ici
```

La clé anon se trouve dans **Supabase Dashboard → Settings → API → Project API keys → anon public**.

### 2. Base de données

Dans **Supabase Dashboard → SQL Editor**, exécuter le fichier :

```
supabase/migrations/001_initial_schema.sql
```

Ce script crée les tables `profiles`, `objectives`, `kpi_entries`, `end_of_day_reports`, `tasks`, active le RLS sur chaque table, et configure les policies.

### 3. Créer le premier compte admin

Dans **Supabase Dashboard → Authentication → Users → Add user**, créer un utilisateur avec votre email et mot de passe.

Ensuite dans **SQL Editor**, mettre à jour son profil en admin :

```sql
UPDATE public.profiles
SET role = 'admin'
WHERE email = 'votre@email.com';
```

### 4. Installer et lancer

```bash
npm install
npm run dev
```

L'app tourne sur `http://localhost:5173`.

## Déploiement Netlify

### Option A — Interface Netlify (recommandé)

1. Pousser le code sur GitHub
2. Aller sur [app.netlify.com](https://app.netlify.com) → **New site from Git**
3. Sélectionner le dépôt
4. Configuration de build :
   - **Build command** : `npm run build`
   - **Publish directory** : `dist`
5. Dans **Site settings → Environment variables**, ajouter :
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
6. Déployer

### Option B — Netlify CLI

```bash
npm install -g netlify-cli
netlify login
netlify init
netlify env:set VITE_SUPABASE_URL https://cbqwrmyctsfdqmenczhm.supabase.co
netlify env:set VITE_SUPABASE_ANON_KEY votre_clé
netlify deploy --prod
```

Le fichier `netlify.toml` gère déjà les redirections SPA (toutes les routes → `index.html`).

## Structure des fichiers

```
src/
  components/
    layout/         Sidebar, Header, Layout
    tasks/          TaskSection, TaskItem, TaskModal
    shared/         Button, Card, Badge, Input, Modal, Skeleton
  pages/
    Login.jsx
    Dashboard.jsx
    Membres.jsx
    MembreDossier.jsx  (onglets Objectifs / Tâches / KPIs)
    Taches.jsx
    KPIs.jsx
    Parametres.jsx
  hooks/
    useAuth.js
    useMembers.js
    useObjectives.js
    useTasks.js
    useKPIs.js
  lib/
    supabase.js
  context/
    AuthContext.jsx
```

## Ajouter des membres

Depuis l'interface : **Membres → Ajouter un membre** (utilise `supabase.auth.admin.createUser`).

> Note : cette opération nécessite une clé **service_role** côté serveur en production. Pour une solution sans exposer cette clé, créer les membres directement depuis le dashboard Supabase ou implémenter une Edge Function Supabase.
