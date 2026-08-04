# Thumbnail personnalisé pour les reels

**Date :** 2026-08-04
**Module :** Réseaux sociaux (`/reseaux-sociaux`)

## Problème

Quand Hugues publie un reel vers TikTok, Instagram et Facebook depuis le module
Réseaux sociaux, aucune image de couverture n'est transmise. Chaque plateforme
choisit elle-même une image de la vidéo, souvent mauvaise. Il faut pouvoir
téléverser une vignette personnalisée.

## État actuel

`PostModal` (dans `src/pages/ReseauxSociaux.jsx`) envoie le post à GHL via
`ghlCreatePost` avec :

```js
media: f.media_urls.map(url => ({ url })),
type: isReel ? 'reel' : 'post',
```

Vérification faite sur l'API GHL le 2026-08-04 : chaque élément du tableau
`media` accepte les champs `url`, `type`, `thumbnail` et `defaultThumb`. Sur les
reels publiés jusqu'ici, `thumbnail` vaut `""` — le champ existe mais n'est
jamais rempli.

L'edge function `social-planner` enrichit chaque média avec son type mime via
`{ ...obj, type: obj.type || mediaType(obj.url) }`. Le spread préserve tout champ
supplémentaire, donc `thumbnail` passe sans modification de la fonction.

## Support par plateforme

La documentation GHL liste les thumbnails vidéo personnalisés comme supportés
pour Facebook Pages, Instagram Business, LinkedIn et YouTube. TikTok n'y figure
pas : l'API TikTok ne permet pas de téléverser une image de couverture, seulement
de désigner une image de la vidéo.

Décision : envoyer le thumbnail quel que soit le compte, et afficher un avis dans
le modal quand TikTok est coché. GHL ignore le champ pour les comptes qui ne le
supportent pas — aucun risque d'échec de publication.

## Design

### 1. Base de données

Migration `supabase/migrations/20260804_social_posts_thumbnail_url.sql` :

```sql
alter table social_posts add column if not exists thumbnail_url text;
```

Colonne nullable. Les policies RLS existantes de `social_posts` couvrent la table
entière — rien à changer.

### 2. Helper partagé

`isVideoUrl(url)` ajouté à `src/lib/socialFormat.js` :

```js
export const isVideoUrl = (url) => /\.(mp4|mov|webm)($|\?)/i.test(url ?? '')
```

Le regex est aujourd'hui écrit en dur dans l'aperçu des médias du modal. Il servira
à trois endroits (aperçu, affichage conditionnel du champ thumbnail, construction
du payload GHL), donc il mérite un nom. L'occurrence existante est remplacée par
l'appel au helper.

### 3. Champ dans le modal

Dans `PostModal` :

- state initial : `thumbnail_url: post?.thumbnail_url ?? ''`
- `buildFields()` retourne `thumbnail_url: f.thumbnail_url || null`
- nouveau handler `handleThumbnailUpload` : un seul fichier, `uploadSocialMedia`,
  puis `set('thumbnail_url', res.url)` ; en cas d'erreur, message dans la bannière
  d'erreur existante du modal
- état `uploadingThumb` distinct de `uploading` pour que les deux zones d'upload
  ne se bloquent pas mutuellement

Bloc UI inséré juste après le bloc « Médias », rendu uniquement si
`f.media_urls.some(isVideoUrl)` :

- libellé « Couverture du reel (thumbnail) »
- si `f.thumbnail_url` : vignette en ratio 9:16 avec bouton × de suppression
  (même style que les vignettes de médias)
- sinon : case pointillée « + Ajouter » avec `<input type="file" accept="image/*">`
- texte d'aide : « Optionnel — sinon la plateforme choisit une image de la vidéo. »
- si `f.platforms.includes('tiktok')`, ligne supplémentaire en gris :
  « TikTok n'accepte pas de vignette personnalisée — la couverture s'appliquera
  à Instagram et Facebook. »

### 4. Envoi vers GHL

Dans `handlePublish`, le mapping des médias devient :

```js
media: f.media_urls.map(url =>
  f.thumbnail_url && isVideoUrl(url) ? { url, thumbnail: f.thumbnail_url } : { url }
),
```

Le champ n'est joint qu'aux médias vidéo. Aucun redéploiement d'edge function.

Aucune validation bloquante n'est ajoutée : le thumbnail reste optionnel, et
supprimer la couverture enregistre `null`, ce qui fait retomber GHL sur son
comportement actuel.

### 5. Import d'un post GHL

`importGhlPost` récupère la couverture d'un post créé côté GHL :

```js
thumbnail_url: g.media?.find(m => m?.thumbnail)?.thumbnail ?? null,
```

## Vérification

Le projet n'a pas de suite de tests. Vérification en trois temps :

1. `npm run lint` (le projet exige `--max-warnings 0`)
2. `npm run build`
3. Test réel de bout en bout : créer un reel avec une couverture, l'envoyer à GHL
   en **draft**, puis relire le post via l'API GHL. Le draft n'est pas publié
   publiquement, donc le test est sans conséquence.

### Résultat du test (2026-08-04)

Deux drafts créés avec la **même vidéo** mais deux images de couverture
différentes. Dans les deux cas, le champ **post-level** `thumbnail` du post GHL
correspond exactement à l'image envoyée dans `media[].thumbnail`.

GHL accepte donc la couverture via `media[].thumbnail`, la remonte au niveau du
post, et renvoie `media[].thumbnail: ""` en lecture. C'est une normalisation de
stockage, pas un rejet — l'implémentation reste celle décrite plus haut.

Non vérifié : qu'Instagram utilise effectivement cette image comme couverture du
reel au moment de la publication. Le confirmer exigerait de publier un reel
public ; ça se validera au premier vrai reel publié avec une couverture.

## Hors périmètre

- Extraction d'une image depuis la vidéo côté navigateur (retenu : upload seul)
- Couverture différente par plateforme
- Couverture par média quand un post contient plusieurs vidéos (un reel = une vidéo)
