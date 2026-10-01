# Module Montage vidéo — progression

Branche `feat/montage-video`, feature flag `VITE_MONTAGE_VIDEO` (pas encore créé).
Plan de référence : `PROMPT-CLAUDE-CODE-MONTAGE-VIDEO-2026-10-01.md` (hors dépôt).

## État au 1er octobre 2026

| Phase | Contenu | État |
|---|---|---|
| 0 | Préalables hors code (skill `neo-video-montage`, catalogue de cartes, Drive pour ordinateur, clé Anthropic, licence Remotion) | Côté Hugues |
| **1a** | **Tables Supabase, RLS, bucket des aperçus** | **Fait, testé en local. PAS appliqué en production.** |
| 1b | Agent vidéo (`video-neo/agent/`) avec heartbeat et file d'attente | À faire |
| 1c | Sous-menus Réseaux sociaux (Analyse et pub + Montage vidéo), redirection de `/reseaux-sociaux`, pastille Mac en ligne, file d'attente | À faire |
| 2 | Upload résumable Drive, Google Picker, galerie de templates, prompt, transcription, premier montage | À faire |
| 3 | Éditeur : Player en direct, fil de prompts, sous-titres éditables, versions, Terminer et export Drive | À faire |
| 4 | Templates proposés et approbation par Hugues, enregistrement du style, variantes | À faire |

**Ne pas appliquer la migration en production (projet soma-hq) avant que l'agent vidéo soit prêt, et seulement avec l'OK explicite de Hugues.**
Prérequis vérifié : `public.is_hugues()` existe en production.

## Phase 1a : ce qui est fait

Fichiers :
- `supabase/migrations/20261001e_montage_video.sql` : la migration (se rejoue sans erreur).
- `src/lib/montageVideoAccess.js` : liste d'accès côté hub, miroir de `has_montage_access()`.
- `supabase/tests/montage_video/` : imitation Supabase + 73 tests RLS et triggers.

Accès :
- `has_montage_access()` : `hugues@neoperformance.ca`, `info@neoperformance.ca`. Pour ajouter un courriel : modifier la fonction (nouvelle migration `CREATE OR REPLACE`) **et** `montageVideoAccess.js`.
- Approbation des templates : `is_hugues()` seulement.
- L'agent vidéo écrit avec la clé `service_role`, dans `video-neo/agent/.env` sur le Mac (jamais dans le hub, Supabase ou Netlify).

Tables :

| Table | Rôle | Hub (utilisateurs du module) | Agent (`service_role`) |
|---|---|---|---|
| `video_jobs` | Un montage | Lire, créer, renommer | Statut, étape, progression, branche git, file, export |
| `video_versions` | Une ronde (commit git, aperçu, prompt, réponse) | Lire | Créer |
| `video_taches` | Demandes à l'agent | Lire, créer (`enregistrer_style` : Hugues) | Prendre, terminer |
| `video_templates` | Propositions et templates | Lire, proposer, modifier sa proposition ouverte ; Hugues approuve ou refuse | `reference_video_neo`, `chemin_apercu` |
| `video_agent_status` | Heartbeat (une ligne) | Lire | Écrire toutes les 30 s |

Règles garanties par la base :
- Un montage exige un template approuvé ou un prompt non vide ; il naît `en_file`, au nom de son créateur.
- Depuis le hub, seul le titre d'un montage se modifie ; tout le reste passe par une tâche.
- Les versions ne se modifient ni ne se suppriment depuis le hub. Restaurer = tâche `restaurer` (l'agent revient au commit et crée une nouvelle version).
- Une seule tâche `en_cours` à la fois (index unique).
- Approbation d'un template par Hugues : `approuve_par` / `approuve_le` remplis et tâche `enregistrer_style` créée automatiquement.
- Un template utilisé par un montage ne peut pas être supprimé.
- Temps réel activé sur les 5 tables.
- « Mac hors ligne » : `now() - dernier_signal > 90 s`, calculé dans le hub.

Bucket `video-apercus` : privé, mp4, 500 Mo max. Chemins `apercus/<job_id>/v<n>.mp4` et `templates/<template_id>/apercu.mp4`. Lecture par URL signée pour le module ; écriture par l'agent seulement.

## Tester la migration en local

Avec un Postgres local vide (jamais un projet Supabase, le script refuse) :

```bash
PGHOST=/chemin/socket PGPORT=5432 PGUSER=postgres supabase/tests/montage_video/run.sh
```

Résultat attendu : `PASS: 73  FAIL: 0`.

## Reste à décider (plan, section 8)

- Partage des compositions Remotion entre `video-neo` et le hub (package local, sous-dossier, autre).
- Chemin exact de `NEO vidéo` sur le Mac (probable : `~/Library/CloudStorage/GoogleDrive-hugues@neoperformance.ca/Mon disque/NEO vidéo`).
- Mémorisation de l'id du dossier `Brut` avec `drive.file` (choisi une fois avec le Picker).
- Fil de conversation de l'éditeur : `video_versions.reponse_agent` suffit-il, ou faut-il une table de messages (phase 3) ?
