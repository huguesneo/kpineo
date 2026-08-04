import { useState, useMemo } from 'react'
import Layout from '../components/layout/Layout'
import Header from '../components/layout/Header'
import Card from '../components/shared/Card'
import Button from '../components/shared/Button'
import Modal from '../components/shared/Modal'
import {
  useSocialPosts, useSocialIdeas, useSocialHooks, useSocialAccounts, useGhlPosts,
  ghlCreatePost, ghlUpdatePost, ghlDeletePost, uploadSocialMedia,
} from '../hooks/useSocialPlanner'
import AnalyseView from '../features/social/analyse/AnalyseView'
import { trackedLink, SURFACES, BIO_URL, isVideoUrl } from '../lib/socialFormat'

// ============================================================================
// Constantes
// ============================================================================

const STATUS = {
  idee:      { label: 'Idée',      color: '#9ca3af', bg: 'bg-gray-100',    text: 'text-gray-600' },
  montage:   { label: 'Montage',   color: '#f59e0b', bg: 'bg-amber-50',    text: 'text-amber-700' },
  programme: { label: 'Programmé', color: '#3b82f6', bg: 'bg-blue-50',     text: 'text-blue-700' },
  publie:    { label: 'Publié',    color: '#10b981', bg: 'bg-emerald-50',  text: 'text-emerald-700' },
}
const STATUS_ORDER = ['idee', 'montage', 'programme', 'publie']

const SPHERES = ['Hormones', 'Métabolisme', 'Recettes', 'Notre approche', 'Psychologie / Mindset',
  'Vieillissement en santé', 'Perte de gras / Composition corporelle', 'Habitudes de vie', 'Suppléments']
const FORMATS = ['Reel', 'Reel Face caméra éducatif', 'Reel Tutoriel / Démonstration pratique',
  'Carroussel', 'Post', 'Story', 'B-roll + voix off', 'POV filming']
const INTENTIONS = ['Éduquer/Valeur', 'Engagement/Discussion', 'Divertissement',
  'Vendre/Rencontre découverte', 'Inspirer/Connexion']
const CTAS = ['Commente Métabolisme', 'Question à l\'audience', 'Détails en description',
  'Lien en bio/Rencontre découverte']

// Tagging de contenu — alimente l'analyse de performance par type de contenu
const HOOK_TYPES = [
  'Mythe à casser',            // « On t'a menti sur… »
  'Erreur fréquente',          // « L'erreur que 90 % des femmes font »
  'Mécanisme / le pourquoi',   // explication physiologique
  'Confession / vécu',         // « J'avais une routine de 2h, je l'ai abandonnée »
  'Liste / checklist',         // « 5 choses que… »
  'À contre-courant',          // position qui dérange
  'Résultat / promesse',
  'Question à l\'audience',
  'Comparaison / avant-après',
  'Statistique choc',
]

const AUDIENCE_PROBLEMS = [
  'Reprise de poids après une diète',
  'Plateau — ça ne bouge plus',
  'Fatigue chronique / manque d\'énergie',
  'Réveils nocturnes / mauvais sommeil',
  'Ballonnements / digestion difficile',
  'Périménopause / ménopause',
  'Bouffées de chaleur',
  'Stress / cortisol élevé',
  'Fringales / rages de sucre',
  'Gras abdominal',
  'Découragement / honte du corps',
  'Manque de temps',
  'Confusion — trop d\'infos contradictoires',
]

const PROOF_METHODS = [
  'Mécanisme physiologique',
  'Cas client / témoignage',
  'Étude / source scientifique',
  'Démonstration en direct',
  'Expérience personnelle',
  'Donnée interne NEO',
  'Aucune preuve',
]

// Type de publication (couleur dominante dans le calendrier et le pipeline)
const KIND = {
  reel:      { label: 'Reel',      color: '#8b5cf6' },
  carrousel: { label: 'Carrousel', color: '#ec4899' },
  post:      { label: 'Post',      color: '#0ea5e9' },
  story:     { label: 'Story',     color: '#f59e0b' },
  autre:     { label: 'Autre',     color: '#6b7280' },
}

function postKind(format) {
  const f = (format ?? '').toLowerCase()
  if (f.includes('reel')) return 'reel'
  // 'carrous' couvre « Carrousel » et « Carroussel » (l'orthographe de FORMATS,
  // qui sinon retombait silencieusement sur 'post'), 'carous' couvre l'anglais.
  if (f.includes('carrous') || f.includes('carous')) return 'carrousel'
  if (f.includes('story')) return 'story'
  if (f.trim()) return 'post'
  return 'autre'
}

function KindBadge({ format }) {
  const k = KIND[postKind(format)]
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold text-white"
      style={{ backgroundColor: k.color }}
    >
      {k.label}
    </span>
  )
}

function HookTypeBadge({ hookType }) {
  if (!hookType) return null
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-[#6b7280]"
      title={`Type de hook : ${hookType}`}
    >
      {hookType}
    </span>
  )
}

const PLATFORM_META = {
  instagram: { label: 'Instagram', color: '#E1306C' },
  facebook:  { label: 'Facebook',  color: '#1877F2' },
  tiktok:    { label: 'TikTok',    color: '#111111' },
  google:    { label: 'Google',    color: '#4285F4' },
}

const MONTHS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
const DAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

function fmtDate(iso) {
  if (!iso) return null
  const d = new Date(iso)
  return d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' })
}

function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ============================================================================
// Petits composants
// ============================================================================

function SelectOrText({ label, listId, value, onChange, options }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-semibold text-[#1a1a1a]">{label}</label>
      <input
        list={listId}
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00bbb1] focus:border-transparent"
      />
      <datalist id={listId}>
        {options.map(o => <option key={o} value={o} />)}
      </datalist>
    </div>
  )
}

function StatusPill({ status }) {
  const s = STATUS[status] ?? STATUS.idee
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${s.bg} ${s.text}`}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.color }} />
      {s.label}
    </span>
  )
}

function PlatformDots({ platforms }) {
  return (
    <span className="inline-flex items-center gap-1">
      {(platforms ?? []).map(p => (
        <span key={p} title={PLATFORM_META[p]?.label ?? p}
          className="w-2 h-2 rounded-full" style={{ backgroundColor: PLATFORM_META[p]?.color ?? '#9ca3af' }} />
      ))}
    </span>
  )
}

// ============================================================================
// Traçage jusqu'au rendez-vous
//
// Un UTM n'existe qu'au moment d'un clic. Sous un Reel Instagram il n'y a
// aucun lien à cliquer : le code passe donc par la page lien en bio, le sticker
// de Story ou le message privé. Le mot-clé de commentaire n'est pas une
// alternative au traçage, c'est ce qui déclenche l'envoi du lien tracé.
//
// L'attribution retient le DERNIER lien cliqué avant la réservation — la règle
// qui décide du boni de prise de rendez-vous.
// ============================================================================

function CopyField({ label, value, hint, muted = false }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-[#1a1a1a]">{label}</span>
        {hint && <span className="text-[11px] text-[#9ca3af]">{hint}</span>}
      </div>
      <div className="flex items-center gap-2">
        <code className={`flex-1 min-w-0 px-2.5 py-1.5 text-[11px] rounded-lg border border-[#e5e7eb] truncate
          ${muted ? 'bg-gray-50 text-[#9ca3af]' : 'bg-white text-[#4b5563]'}`}>
          {value}
        </code>
        <button
          type="button"
          onClick={copy}
          className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-[#e5e7eb] text-[#6b7280] hover:text-[#1a1a1a] hover:bg-gray-50 shrink-0"
        >
          {copied ? 'Copié' : 'Copier'}
        </button>
      </div>
    </div>
  )
}

function TrackingBlock({ post, keyword, onKeyword, platforms }) {
  const code = post?.tracking_code

  if (!code) {
    return (
      <div className="rounded-xl border border-[#e5e7eb] bg-gray-50 p-4">
        <p className="text-xs font-bold text-[#6b7280] uppercase tracking-wide">Traçage des rendez-vous</p>
        <p className="text-xs text-[#9ca3af] mt-1.5">
          Le code de suivi est attribué à l'enregistrement. Enregistre une première fois,
          rouvre le contenu, et les liens apparaîtront ici.
        </p>
      </div>
    )
  }

  const selected = (platforms ?? []).filter(p => SURFACES[p])
  const usesInstagram = selected.includes('instagram')

  return (
    <div className="rounded-xl border border-[#e5e7eb] bg-gray-50 p-4 flex flex-col gap-4">
      <div>
        <p className="text-xs font-bold text-[#6b7280] uppercase tracking-wide">
          Traçage des rendez-vous · <span className="text-[#009e95]">{code}</span>
        </p>
        <p className="text-xs text-[#9ca3af] mt-0.5">
          Utilise ces liens plutôt que le lien de réservation habituel. Un rendez-vous n'est
          rattaché à ce contenu que si la personne est arrivée par l'un d'eux.
        </p>
      </div>

      {selected.map(platform => (
        <div key={platform} className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PLATFORM_META[platform]?.color }} />
            <span className="text-xs font-bold text-[#1a1a1a]">{PLATFORM_META[platform]?.label ?? platform}</span>
          </div>
          {SURFACES[platform].map(s => (
            <CopyField
              key={s.key}
              label={s.label}
              hint={s.note}
              value={trackedLink(code, { source: platform, medium: s.medium, base: s.base })}
            />
          ))}
        </div>
      ))}

      {usesInstagram && (
        <div className="flex flex-col gap-1 pt-3 border-t border-[#e5e7eb]">
          <label className="text-xs font-semibold text-[#1a1a1a]">
            Mot-clé de commentaire <span className="font-normal text-[#9ca3af]">— optionnel</span>
          </label>
          <input
            value={keyword ?? ''}
            onChange={e => onKeyword(e.target.value)}
            placeholder="CORTISOL, PÉRIMÉNOPAUSE, DÉJEUNER…"
            className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg bg-white uppercase focus:outline-none focus:ring-2 focus:ring-[#00bbb1] focus:border-transparent"
          />
          <p className="text-[11px] text-[#9ca3af]">
            Sers-t'en quand tu veux déclencher une conversation. La réponse automatique doit
            envoyer le lien « message privé » ci-dessus — c'est lui qui porte le code, pas le
            mot-clé.
          </p>
        </div>
      )}

      <p className="text-[11px] text-[#9ca3af] pt-2 border-t border-[#e5e7eb]">
        Page lien en bio : <a href={BIO_URL} target="_blank" rel="noreferrer" className="text-[#009e95] hover:underline">{BIO_URL}</a>
        {' · '}L'attribution retient le <b>dernier</b> lien cliqué avant la réservation.
      </p>
    </div>
  )
}

// ============================================================================
// Modal création / édition de post
// ============================================================================

function PostModal({ post, defaultDate, accounts, hooksBank, onSave, onDelete, onClose }) {
  const isNew = !post?.id
  const [f, setF] = useState(() => ({
    title: post?.title ?? '',
    hook: post?.hook ?? '',
    sphere: post?.sphere ?? '',
    format: post?.format ?? '',
    intention: post?.intention ?? '',
    cta: post?.cta ?? '',
    status: post?.status ?? 'idee',
    scheduled_at: post?.scheduled_at ?? (defaultDate ? `${defaultDate}T12:00` : null),
    caption: post?.caption ?? '',
    platforms: post?.platforms ?? ['instagram', 'facebook'],
    media_urls: post?.media_urls ?? [],
    thumbnail_url: post?.thumbnail_url ?? '',
    script_url: post?.script_url ?? '',
    notes: post?.notes ?? '',
    hook_type: post?.hook_type ?? '',
    audience_problem: post?.audience_problem ?? '',
    proof_method: post?.proof_method ?? '',
    seo_keyword: post?.seo_keyword ?? '',
    is_trial: post?.is_trial ?? false,
    dm_keyword: post?.dm_keyword ?? '',
  }))
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadingThumb, setUploadingThumb] = useState(false)
  const [error, setError] = useState(null)
  const [okMsg, setOkMsg] = useState(null)
  const [dragMediaIdx, setDragMediaIdx] = useState(null)

  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }))

  // Réordonner les médias (l'ordre = l'ordre du carrousel publié)
  const moveMedia = (from, to) => {
    setF(prev => {
      if (to < 0 || to >= prev.media_urls.length) return prev
      const arr = [...prev.media_urls]
      const [moved] = arr.splice(from, 1)
      arr.splice(to, 0, moved)
      return { ...prev, media_urls: arr }
    })
  }

  const togglePlatform = (p) => {
    set('platforms', f.platforms.includes(p) ? f.platforms.filter(x => x !== p) : [...f.platforms, p])
  }

  async function handleUpload(e) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setUploading(true)
    setError(null)
    for (const file of files) {
      const res = await uploadSocialMedia(file)
      if (res.error) { setError(`Upload : ${res.error}`); break }
      setF(prev => ({ ...prev, media_urls: [...prev.media_urls, res.url] }))
    }
    setUploading(false)
    e.target.value = ''
  }

  // Couverture du reel : une seule image, envoyée à GHL comme media[].thumbnail
  async function handleThumbnailUpload(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploadingThumb(true)
    setError(null)
    const res = await uploadSocialMedia(file)
    if (res.error) setError(`Upload de la couverture : ${res.error}`)
    else set('thumbnail_url', res.url)
    setUploadingThumb(false)
  }

  function buildFields(extra = {}) {
    return {
      title: f.title.trim(),
      hook: f.hook || null,
      sphere: f.sphere || null,
      format: f.format || null,
      intention: f.intention || null,
      cta: f.cta || null,
      status: f.status,
      scheduled_at: f.scheduled_at ? new Date(f.scheduled_at).toISOString() : null,
      caption: f.caption || null,
      platforms: f.platforms,
      media_urls: f.media_urls,
      thumbnail_url: f.thumbnail_url || null,
      script_url: f.script_url || null,
      notes: f.notes || null,
      hook_type: f.hook_type || null,
      audience_problem: f.audience_problem || null,
      proof_method: f.proof_method || null,
      seo_keyword: f.seo_keyword || null,
      is_trial: f.is_trial,
      dm_keyword: f.dm_keyword ? f.dm_keyword.trim().toUpperCase() : null,
      ...extra,
    }
  }

  async function handleSave() {
    if (!f.title.trim()) { setError('Le titre est requis.'); return }
    setSaving(true)
    setError(null)
    const res = await onSave(buildFields())
    setSaving(false)
    if (res?.error) setError(res.error)
    else onClose()
  }

  // Envoie le post dans le Social Planner GHL.
  // mode 'schedule' = programmé à la date choisie · mode 'now' = publié immédiatement
  async function handlePublish(mode = 'schedule') {
    setError(null)
    if (!f.title.trim())            return setError('Le titre est requis.')
    if (!f.caption.trim())          return setError('La légende (caption) est requise pour publier.')
    if (mode === 'schedule' && !f.scheduled_at) return setError('Choisis une date et heure de publication.')
    if (!f.platforms.length)        return setError('Choisis au moins une plateforme.')
    if (!f.media_urls.length)       return setError('Ajoute au moins un média (image ou vidéo).')

    const platformLabels = f.platforms.map(p => PLATFORM_META[p]?.label ?? p).join(' + ')
    if (mode === 'now' && !window.confirm(`Publier immédiatement sur ${platformLabels} ?`)) return

    const accountIds = accounts
      .filter(a => f.platforms.includes(a.platform))
      .map(a => a.id)
    if (!accountIds.length) return setError('Aucun compte GHL connecté pour ces plateformes.')

    const isReel = (f.format ?? '').toLowerCase().includes('reel')
    const payload = {
      accountIds,
      summary: f.caption,
      // La couverture ne s'applique qu'aux vidéos (et TikTok l'ignore côté GHL)
      media: f.media_urls.map(url =>
        f.thumbnail_url && isVideoUrl(url) ? { url, thumbnail: f.thumbnail_url } : { url },
      ),
      status: mode === 'now' ? 'published' : 'scheduled',
      ...(mode === 'schedule' ? { scheduleDate: new Date(f.scheduled_at).toISOString() } : {}),
      type: isReel ? 'reel' : 'post',
    }

    setPublishing(true)
    const res = post?.ghl_post_id
      ? await ghlUpdatePost(post.ghl_post_id, payload)
      : await ghlCreatePost(payload)
    if (!res.ok) {
      setPublishing(false)
      return setError(`GHL : ${res.error}`)
    }
    const ghlId = res.data?.results?.post?._id ?? res.data?.post?._id ?? res.data?._id ?? post?.ghl_post_id ?? null
    const saveRes = await onSave(buildFields(
      mode === 'now'
        ? { status: 'publie', published_at: new Date().toISOString(), ghl_post_id: ghlId }
        : { status: 'programme', ghl_post_id: ghlId },
    ))
    setPublishing(false)
    if (saveRes?.error) return setError(saveRes.error)
    setOkMsg(mode === 'now'
      ? `Post publié sur ${platformLabels} ✓ (l'envoi peut prendre 1-2 minutes)`
      : `Post ${post?.ghl_post_id ? 'mis à jour' : 'programmé'} sur ${platformLabels} ✓`)
    setTimeout(onClose, 1500)
  }

  async function handleUnschedule() {
    if (!post?.ghl_post_id) return
    setPublishing(true)
    setError(null)
    const res = await ghlDeletePost(post.ghl_post_id)
    if (!res.ok) { setPublishing(false); return setError(`GHL : ${res.error}`) }
    const saveRes = await onSave(buildFields({ status: 'montage', ghl_post_id: null }))
    setPublishing(false)
    if (saveRes?.error) return setError(saveRes.error)
    onClose()
  }

  const connectedPlatforms = [...new Set(accounts.map(a => a.platform))].filter(p => p !== 'google')

  // Rappel non bloquant : un post programmé ou publié sans tagging ne pourra pas être analysé
  const taggingIncomplete = (f.status === 'programme' || f.status === 'publie')
    && (!f.hook_type || !f.audience_problem)

  return (
    <Modal isOpen onClose={onClose} title={isNew ? 'Nouveau contenu' : 'Modifier le contenu'} size="lg">
      <div className="space-y-4">
        {taggingIncomplete && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Tagging incomplet — ce post ne pourra pas être analysé par type de contenu.
          </p>
        )}

        {/* Titre + statut */}
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2 flex flex-col gap-1">
            <label className="text-sm font-semibold text-[#1a1a1a]">Titre / Idée</label>
            <input
              value={f.title}
              onChange={e => set('title', e.target.value)}
              placeholder="Ex : La perte de gras expliquée"
              className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1] focus:border-transparent"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-semibold text-[#1a1a1a]">Statut</label>
            <select
              value={f.status}
              onChange={e => set('status', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00bbb1]"
            >
              {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS[s].label}</option>)}
            </select>
          </div>
        </div>

        {/* Hook */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-semibold text-[#1a1a1a]">Hook <span className="font-normal text-[#9ca3af]">(pige dans la banque ou écris le tien)</span></label>
          <input
            list="hooks-bank"
            value={f.hook}
            onChange={e => set('hook', e.target.value)}
            placeholder="Ex : Tu manges mieux, tu bouges plus, mais la balance ne bouge pas?"
            className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1] focus:border-transparent"
          />
          <datalist id="hooks-bank">
            {hooksBank.map(h => <option key={h.id} value={h.text} />)}
          </datalist>
        </div>

        {/* Sphère / Format / Intention / CTA */}
        <div className="grid grid-cols-2 gap-3">
          <SelectOrText label="Sphère de sujet" listId="list-sphere" value={f.sphere} onChange={v => set('sphere', v)} options={SPHERES} />
          <SelectOrText label="Format" listId="list-format" value={f.format} onChange={v => set('format', v)} options={FORMATS} />
          <SelectOrText label="Intention" listId="list-intention" value={f.intention} onChange={v => set('intention', v)} options={INTENTIONS} />
          <SelectOrText label="CTA" listId="list-cta" value={f.cta} onChange={v => set('cta', v)} options={CTAS} />
        </div>

        {/* Section analyse — tagging de contenu */}
        <div className="rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-4 space-y-3">
          <div>
            <p className="text-xs font-bold text-[#6b7280] uppercase tracking-wide">Analyse</p>
            <p className="text-xs text-[#9ca3af] mt-0.5">
              Ces champs alimentent l'analyse de performance. Remplis-les au moment de créer le post — ça ne se rattrape pas après.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <SelectOrText label="Type de hook" listId="list-hook-type" value={f.hook_type} onChange={v => set('hook_type', v)} options={HOOK_TYPES} />
            <SelectOrText label="Problème d'audience visé" listId="list-audience-problem" value={f.audience_problem} onChange={v => set('audience_problem', v)} options={AUDIENCE_PROBLEMS} />
            <SelectOrText label="Méthode de preuve" listId="list-proof-method" value={f.proof_method} onChange={v => set('proof_method', v)} options={PROOF_METHODS} />
            <div className="flex flex-col gap-1">
              <label className="text-sm font-semibold text-[#1a1a1a]">Mot-clé SEO ciblé</label>
              <input
                value={f.seo_keyword}
                onChange={e => set('seo_keyword', e.target.value)}
                placeholder="cortisol, périménopause, métabolisme…"
                className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00bbb1] focus:border-transparent"
              />
            </div>
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={f.is_trial}
              onChange={e => set('is_trial', e.target.checked)}
              className="w-4 h-4 rounded accent-[#00bbb1] flex-shrink-0"
            />
            <span className="text-sm text-[#1a1a1a]">Trial Reel <span className="text-[#9ca3af]">(testé sur audience froide)</span></span>
          </label>
        </div>

        <TrackingBlock
          post={post}
          keyword={f.dm_keyword}
          onKeyword={v => set('dm_keyword', v)}
          platforms={f.platforms}
        />

        {/* Date + script */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-semibold text-[#1a1a1a]">Date et heure de publication</label>
            <input
              type="datetime-local"
              value={toLocalInput(f.scheduled_at)}
              onChange={e => set('scheduled_at', e.target.value || null)}
              className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-semibold text-[#1a1a1a]">Lien vers le script <span className="font-normal text-[#9ca3af]">(optionnel)</span></label>
            <input
              value={f.script_url}
              onChange={e => set('script_url', e.target.value)}
              placeholder="https://…"
              className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1] focus:border-transparent"
            />
          </div>
        </div>

        {/* Section publication */}
        <div className="rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-4 space-y-3">
          <p className="text-xs font-bold text-[#6b7280] uppercase tracking-wide">Publication</p>

          {/* Plateformes */}
          <div className="flex items-center gap-2 flex-wrap">
            {connectedPlatforms.map(p => {
              const on = f.platforms.includes(p)
              const meta = PLATFORM_META[p] ?? { label: p, color: '#9ca3af' }
              return (
                <button
                  key={p}
                  onClick={() => togglePlatform(p)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                    on ? 'text-white border-transparent' : 'bg-white text-[#6b7280] border-[#e5e7eb] hover:bg-gray-50'
                  }`}
                  style={on ? { backgroundColor: meta.color } : undefined}
                >
                  {meta.label}
                </button>
              )
            })}
            {!connectedPlatforms.length && (
              <p className="text-xs text-[#9ca3af]">Comptes GHL en cours de chargement…</p>
            )}
          </div>

          {/* Légende */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-semibold text-[#1a1a1a]">Légende (caption)</label>
            <textarea
              value={f.caption}
              onChange={e => set('caption', e.target.value)}
              rows={4}
              placeholder="La légende publiée avec le post (hook + corps + CTA + hashtags)…"
              className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1] focus:border-transparent resize-y"
            />
          </div>

          {/* Médias */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-[#1a1a1a]">Médias (image / vidéo)</label>
            <div className="flex items-center gap-2 flex-wrap">
              {f.media_urls.map((url, i) => (
                <div
                  key={url}
                  draggable
                  onDragStart={() => setDragMediaIdx(i)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => {
                    e.preventDefault()
                    if (dragMediaIdx != null && dragMediaIdx !== i) moveMedia(dragMediaIdx, i)
                    setDragMediaIdx(null)
                  }}
                  className="relative group cursor-grab active:cursor-grabbing"
                  title="Glisse pour changer l'ordre"
                >
                  {isVideoUrl(url)
                    ? <video src={url} className="w-16 h-16 object-cover rounded-lg border border-[#e5e7eb] pointer-events-none" />
                    : <img src={url} alt={`média ${i + 1}`} className="w-16 h-16 object-cover rounded-lg border border-[#e5e7eb] pointer-events-none" />}
                  {/* Numéro d'ordre (= ordre du carrousel) */}
                  <span className="absolute bottom-1 left-1 w-4.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-black/60 text-white text-[10px] font-bold">
                    {i + 1}
                  </span>
                  {/* Flèches gauche/droite */}
                  {f.media_urls.length > 1 && (
                    <span className="absolute inset-x-0 top-1 flex justify-between px-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => moveMedia(i, i - 1)}
                        disabled={i === 0}
                        className="w-4.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-black/60 text-white text-[10px] disabled:opacity-30"
                        title="Vers la gauche"
                      >
                        ‹
                      </button>
                      <button
                        onClick={() => moveMedia(i, i + 1)}
                        disabled={i === f.media_urls.length - 1}
                        className="w-4.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-black/60 text-white text-[10px] disabled:opacity-30"
                        title="Vers la droite"
                      >
                        ›
                      </button>
                    </span>
                  )}
                  <button
                    onClick={() => set('media_urls', f.media_urls.filter(u => u !== url))}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs leading-none opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    ×
                  </button>
                </div>
              ))}
              <label className="w-16 h-16 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-[#d1d5db] text-[#9ca3af] hover:border-[#00bbb1] hover:text-[#00bbb1] cursor-pointer transition-colors">
                {uploading
                  ? <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  : <><span className="text-xl leading-none">+</span><span className="text-[9px] font-semibold">Ajouter</span></>}
                <input type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleUpload} disabled={uploading} />
              </label>
            </div>
            {f.media_urls.length > 1 && (
              <p className="text-xs text-[#9ca3af]">
                Glisse les photos (ou utilise les flèches) pour changer l'ordre — le numéro = la position dans le carrousel publié.
              </p>
            )}
          </div>

          {/* Couverture du reel — visible seulement s'il y a une vidéo */}
          {f.media_urls.some(isVideoUrl) && (
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-[#1a1a1a]">Couverture du reel (thumbnail)</label>
              <div className="flex items-start gap-3">
                {f.thumbnail_url ? (
                  <div className="relative group">
                    <img
                      src={f.thumbnail_url}
                      alt="couverture du reel"
                      className="w-[54px] h-24 object-cover rounded-lg border border-[#e5e7eb]"
                    />
                    <button
                      onClick={() => set('thumbnail_url', '')}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs leading-none opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Retirer la couverture"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <label className="w-[54px] h-24 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-[#d1d5db] text-[#9ca3af] hover:border-[#00bbb1] hover:text-[#00bbb1] cursor-pointer transition-colors">
                    {uploadingThumb
                      ? <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                      : <><span className="text-xl leading-none">+</span><span className="text-[9px] font-semibold">Ajouter</span></>}
                    <input type="file" accept="image/*" className="hidden" onChange={handleThumbnailUpload} disabled={uploadingThumb} />
                  </label>
                )}
                <div className="flex flex-col gap-1 pt-1">
                  <p className="text-xs text-[#6b7280]">
                    Optionnel — sinon la plateforme choisit une image de la vidéo. Format 9:16 recommandé.
                  </p>
                  {f.platforms.includes('tiktok') && (
                    <p className="text-xs text-[#9ca3af]">
                      TikTok n'accepte pas de vignette personnalisée — la couverture s'appliquera à Instagram et Facebook.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {post?.ghl_post_id && (
            <p className="text-xs text-[#6b7280]">
              <span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1.5" />
              Déjà programmé dans GHL — « Programmer » mettra à jour le post existant.
            </p>
          )}
        </div>

        {/* Notes */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-semibold text-[#1a1a1a]">Notes internes <span className="font-normal text-[#9ca3af]">(optionnel)</span></label>
          <textarea
            value={f.notes}
            onChange={e => set('notes', e.target.value)}
            rows={2}
            className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1] focus:border-transparent resize-y"
          />
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        {okMsg && <p className="text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">{okMsg}</p>}

        {/* Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-[#e5e7eb]">
          <div className="flex items-center gap-2">
            {!isNew && (
              <Button variant="danger" size="sm" onClick={() => onDelete(post.id)}>Supprimer</Button>
            )}
            {post?.ghl_post_id && (
              <Button variant="secondary" size="sm" onClick={handleUnschedule} loading={publishing}>
                Retirer de GHL
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={handleSave} loading={saving}>Enregistrer</Button>
            <Button onClick={() => handlePublish('schedule')} loading={publishing}>
              {post?.ghl_post_id ? 'Mettre à jour sur les réseaux' : 'Programmer sur les réseaux'}
            </Button>
            <Button
              onClick={() => handlePublish('now')}
              loading={publishing}
              className="!bg-[#1a1a1a] hover:!bg-black focus:!ring-[#1a1a1a]"
            >
              Publier maintenant
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ============================================================================
// Modal détail d'un post GHL (programmé depuis GHL directement)
// ============================================================================

function GhlPostModal({ ghlPost, accounts, onImport, onClose }) {
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState(null)

  const platforms = useMemo(() => {
    const ids = ghlPost.accountIds ?? []
    return [...new Set(accounts.filter(a => ids.includes(a.id)).map(a => a.platform))]
  }, [ghlPost, accounts])

  const when = ghlPost.scheduleDate ?? ghlPost.publishDate ?? ghlPost.createdAt
  const media = (ghlPost.media ?? []).map(m => (typeof m === 'string' ? m : m?.url)).filter(Boolean)

  async function handleImport() {
    setImporting(true)
    setError(null)
    const res = await onImport(ghlPost, platforms, media)
    setImporting(false)
    if (res?.error) setError(res.error)
    else onClose()
  }

  return (
    <Modal isOpen onClose={onClose} title="Post programmé dans GHL" size="md">
      <div className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <StatusPill status={ghlPost.status === 'published' ? 'publie' : 'programme'} />
          {platforms.map(p => (
            <span key={p} className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-white"
              style={{ backgroundColor: PLATFORM_META[p]?.color ?? '#9ca3af' }}>
              {PLATFORM_META[p]?.label ?? p}
            </span>
          ))}
          {when && (
            <span className="text-xs font-semibold text-[#6b7280] ml-auto">
              {new Date(when).toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short' })}
            </span>
          )}
        </div>

        {media.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {media.slice(0, 6).map(url => (
              /\.(mp4|mov|webm)($|\?)/i.test(url)
                ? <video key={url} src={url} className="w-16 h-16 object-cover rounded-lg border border-[#e5e7eb]" />
                : <img key={url} src={url} alt="" className="w-16 h-16 object-cover rounded-lg border border-[#e5e7eb]" />
            ))}
          </div>
        )}

        <div className="bg-[#f9fafb] rounded-lg p-3 max-h-48 overflow-y-auto">
          <p className="text-sm text-[#1a1a1a] whitespace-pre-wrap">{ghlPost.summary || <span className="text-[#9ca3af]">Sans légende</span>}</p>
        </div>

        <p className="text-xs text-[#9ca3af]">
          Ce post a été créé directement dans GHL. Tu peux l'importer dans le pipeline pour le suivre ici (statuts, performances).
        </p>

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#e5e7eb]">
          <Button variant="secondary" onClick={onClose}>Fermer</Button>
          <Button onClick={handleImport} loading={importing}>Importer dans le pipeline</Button>
        </div>
      </div>
    </Modal>
  )
}

// ============================================================================
// Vue Calendrier
// ============================================================================

function CalendarView({ posts, ghlPosts, onDayClick, onPostClick, onGhlPostClick }) {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())

  function nav(delta) {
    let m = month + delta, y = year
    if (m < 1) { m = 12; y-- }
    if (m > 12) { m = 1; y++ }
    setMonth(m); setYear(y)
  }

  const weeks = useMemo(() => {
    const first = new Date(year, month - 1, 1)
    const daysInMonth = new Date(year, month, 0).getDate()
    const startOffset = (first.getDay() + 6) % 7 // lundi = 0
    const cells = []
    for (let i = 0; i < startOffset; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(d)
    while (cells.length % 7 !== 0) cells.push(null)
    const out = []
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7))
    return out
  }, [month, year])

  const postsByDay = useMemo(() => {
    const map = {}
    for (const p of posts) {
      const iso = p.scheduled_at ?? p.published_at
      if (!iso) continue
      const d = new Date(iso)
      if (d.getFullYear() !== year || d.getMonth() + 1 !== month) continue
      const day = d.getDate()
      ;(map[day] ??= []).push(p)
    }
    return map
  }, [posts, month, year])

  // Posts GHL non liés à un contenu local (créés directement dans GHL)
  const ghlByDay = useMemo(() => {
    const linked = new Set(posts.map(p => p.ghl_post_id).filter(Boolean))
    const map = {}
    for (const g of ghlPosts) {
      if (linked.has(g._id ?? g.id)) continue
      const iso = g.scheduleDate ?? g.publishDate
      if (!iso) continue
      const d = new Date(iso)
      if (d.getFullYear() !== year || d.getMonth() + 1 !== month) continue
      const day = d.getDate()
      ;(map[day] ??= []).push(g)
    }
    return map
  }, [ghlPosts, posts, month, year])

  const isToday = (d) => d === now.getDate() && month === now.getMonth() + 1 && year === now.getFullYear()

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1">
          <button onClick={() => nav(-1)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-[#6b7280]">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <span className="text-base font-bold text-[#1a1a1a] min-w-[150px] text-center">{MONTHS_FR[month - 1]} {year}</span>
          <button onClick={() => nav(1)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-[#6b7280]">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
          {(month !== now.getMonth() + 1 || year !== now.getFullYear()) && (
            <button onClick={() => { setMonth(now.getMonth() + 1); setYear(now.getFullYear()) }} className="ml-1 text-xs font-semibold text-[#00bbb1] hover:text-[#009e95]">
              Aujourd'hui
            </button>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5 text-xs text-[#6b7280]">
          <div className="flex items-center gap-3">
            {['reel', 'carrousel', 'post', 'story'].map(k => (
              <span key={k} className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded" style={{ backgroundColor: KIND[k].color }} />
                {KIND[k].label}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded border border-dashed border-blue-500 bg-white" />
              📡 Déjà dans GHL
            </span>
          </div>
          <div className="flex items-center gap-3">
            {STATUS_ORDER.map(s => (
              <span key={s} className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS[s].color }} />
                {STATUS[s].label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px bg-[#e5e7eb] rounded-lg overflow-hidden border border-[#e5e7eb]">
        {DAYS_FR.map(d => (
          <div key={d} className="bg-[#f9fafb] px-2 py-1.5 text-[11px] font-bold text-[#6b7280] uppercase tracking-wide text-center">{d}</div>
        ))}
        {weeks.flat().map((day, i) => (
          <div
            key={i}
            onClick={() => day && onDayClick(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`)}
            className={`bg-white min-h-[92px] p-1.5 ${day ? 'cursor-pointer hover:bg-[#f0fdfc]' : 'bg-[#fafafa]'} transition-colors`}
          >
            {day && (
              <>
                <span className={`inline-flex items-center justify-center w-6 h-6 text-xs font-semibold rounded-full mb-1 ${
                  isToday(day) ? 'bg-[#00bbb1] text-white' : 'text-[#6b7280]'
                }`}>
                  {day}
                </span>
                <div className="space-y-1">
                  {(postsByDay[day] ?? []).map(p => (
                    <button
                      key={p.id}
                      onClick={e => { e.stopPropagation(); onPostClick(p) }}
                      className="w-full text-left px-1.5 py-1 rounded-md text-[11px] font-semibold leading-tight truncate text-white hover:opacity-85 transition-opacity"
                      style={{ backgroundColor: KIND[postKind(p.format)].color }}
                      title={`${p.title} — ${KIND[postKind(p.format)].label} · ${STATUS[p.status]?.label}`}
                    >
                      <span
                        className="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle ring-1 ring-white/80"
                        style={{ backgroundColor: STATUS[p.status]?.color ?? '#9ca3af' }}
                      />
                      {p.title}
                    </button>
                  ))}
                  {(ghlByDay[day] ?? []).map(g => (
                    <button
                      key={g._id ?? g.id}
                      onClick={e => { e.stopPropagation(); onGhlPostClick(g) }}
                      className="w-full text-left px-1.5 py-1 rounded-md text-[11px] font-semibold leading-tight truncate bg-white border border-dashed hover:bg-blue-50 transition-colors"
                      style={{ borderColor: g.status === 'published' ? STATUS.publie.color : STATUS.programme.color, color: g.status === 'published' ? STATUS.publie.color : STATUS.programme.color }}
                      title={g.summary ?? 'Post GHL'}
                    >
                      📡 {(g.summary ?? 'Post GHL').slice(0, 40)}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      <p className="text-xs text-[#9ca3af] mt-3">
        Clique sur un jour pour planifier un contenu, ou sur un contenu pour le modifier.
        Les cases pointillées 📡 sont des posts programmés directement dans GHL.
      </p>
    </Card>
  )
}

// ============================================================================
// Vue Pipeline (kanban)
// ============================================================================

function PipelineView({ posts, onPostClick, onNewPost, onMoveStatus }) {
  const [dragId, setDragId] = useState(null)
  const [overCol, setOverCol] = useState(null)

  const byStatus = useMemo(() => {
    const map = { idee: [], montage: [], programme: [], publie: [] }
    for (const p of posts) (map[p.status] ?? map.idee).push(p)
    map.publie.sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''))
    return map
  }, [posts])

  return (
    <div className="grid grid-cols-4 gap-4">
      {STATUS_ORDER.map(status => (
        <div
          key={status}
          onDragOver={e => { e.preventDefault(); setOverCol(status) }}
          onDragLeave={() => setOverCol(c => (c === status ? null : c))}
          onDrop={e => {
            e.preventDefault()
            setOverCol(null)
            if (dragId) onMoveStatus(dragId, status)
            setDragId(null)
          }}
          className={`rounded-xl border p-3 min-h-[300px] transition-colors ${
            overCol === status ? 'border-[#00bbb1] bg-[#00bbb1]/5' : 'border-[#e5e7eb] bg-[#f9fafb]'
          }`}
        >
          <div className="flex items-center justify-between mb-3 px-1">
            <span className="inline-flex items-center gap-2 text-sm font-bold text-[#1a1a1a]">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STATUS[status].color }} />
              {STATUS[status].label}
              <span className="text-xs font-semibold text-[#9ca3af]">{byStatus[status].length}</span>
            </span>
            {status === 'idee' && (
              <button onClick={onNewPost} className="w-6 h-6 flex items-center justify-center rounded-md text-[#00bbb1] hover:bg-[#00bbb1]/10 text-lg leading-none font-bold">+</button>
            )}
          </div>
          <div className="space-y-2">
            {byStatus[status].map(p => (
              <div
                key={p.id}
                draggable
                onDragStart={() => setDragId(p.id)}
                onClick={() => onPostClick(p)}
                className="bg-white rounded-lg border border-[#e5e7eb] p-3 cursor-pointer hover:shadow-md transition-shadow"
                style={{ borderLeft: `4px solid ${KIND[postKind(p.format)].color}` }}
              >
                <p className="text-sm font-semibold text-[#1a1a1a] leading-snug mb-1.5">{p.title}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <KindBadge format={p.format} />
                  <HookTypeBadge hookType={p.hook_type} />
                  {p.sphere && <span className="text-[11px] text-[#9ca3af]">{p.sphere}</span>}
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[11px] text-[#6b7280] font-semibold">
                    {fmtDate(p.scheduled_at ?? p.published_at) ?? '—'}
                  </span>
                  <span className="flex items-center gap-1.5">
                    {p.ghl_post_id && <span title="Programmé dans GHL" className="text-[10px]">📡</span>}
                    <PlatformDots platforms={p.platforms} />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ============================================================================
// Vue Idées & Hooks
// ============================================================================

function IdeasView({ onCreateFromIdea }) {
  const { ideas, addIdea, toggleUsed, removeIdea } = useSocialIdeas()
  const { hooks, addHook, toggleUsed: toggleHookUsed, removeHook } = useSocialHooks()
  const [newIdea, setNewIdea] = useState('')
  const [newHook, setNewHook] = useState('')
  const [hookFilter, setHookFilter] = useState('')
  const [copied, setCopied] = useState(null)

  const filteredHooks = useMemo(() => {
    const q = hookFilter.toLowerCase()
    return hooks.filter(h => !q || h.text.toLowerCase().includes(q))
  }, [hooks, hookFilter])

  async function submitIdea(e) {
    e.preventDefault()
    if (!newIdea.trim()) return
    await addIdea(newIdea.trim())
    setNewIdea('')
  }

  async function submitHook(e) {
    e.preventDefault()
    if (!newHook.trim()) return
    await addHook(newHook.trim())
    setNewHook('')
  }

  function copyHook(h) {
    navigator.clipboard.writeText(h.text)
    setCopied(h.id)
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Idées */}
      <Card className="p-5">
        <h3 className="text-base font-bold text-[#1a1a1a] mb-3">Banque d'idées</h3>
        <form onSubmit={submitIdea} className="flex gap-2 mb-4">
          <input
            value={newIdea}
            onChange={e => setNewIdea(e.target.value)}
            placeholder="Nouvelle idée de contenu…"
            className="flex-1 px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1] focus:border-transparent"
          />
          <Button type="submit" size="sm">Ajouter</Button>
        </form>
        <div className="space-y-1.5 max-h-[520px] overflow-y-auto pr-1">
          {ideas.map(i => (
            <div key={i.id} className={`group flex items-center gap-2.5 px-3 py-2 rounded-lg border ${i.used ? 'border-[#f0f0f2] bg-[#fafafa]' : 'border-[#e5e7eb] bg-white'}`}>
              <input
                type="checkbox"
                checked={i.used}
                onChange={e => toggleUsed(i.id, e.target.checked)}
                title="Utilisée"
                className="w-4 h-4 rounded accent-[#00bbb1] flex-shrink-0"
              />
              <span className={`flex-1 text-sm ${i.used ? 'text-[#9ca3af] line-through' : 'text-[#1a1a1a] font-medium'}`}>{i.title}</span>
              {!i.used && (
                <button
                  onClick={() => onCreateFromIdea(i)}
                  className="opacity-0 group-hover:opacity-100 text-[11px] font-semibold text-[#00bbb1] hover:text-[#009e95] transition-opacity whitespace-nowrap"
                >
                  → Créer le post
                </button>
              )}
              <button
                onClick={() => removeIdea(i.id)}
                className="opacity-0 group-hover:opacity-100 text-[#9ca3af] hover:text-red-500 transition-opacity"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          ))}
          {!ideas.length && <p className="text-sm text-[#9ca3af]">Aucune idée pour l'instant.</p>}
        </div>
      </Card>

      {/* Hooks */}
      <Card className="p-5">
        <h3 className="text-base font-bold text-[#1a1a1a] mb-3">Banque de hooks <span className="text-sm font-semibold text-[#9ca3af]">({hooks.length})</span></h3>
        <form onSubmit={submitHook} className="flex gap-2 mb-2">
          <input
            value={newHook}
            onChange={e => setNewHook(e.target.value)}
            placeholder="Nouveau hook…"
            className="flex-1 px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00bbb1] focus:border-transparent"
          />
          <Button type="submit" size="sm">Ajouter</Button>
        </form>
        <input
          value={hookFilter}
          onChange={e => setHookFilter(e.target.value)}
          placeholder="🔍 Filtrer les hooks…"
          className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg mb-3 focus:outline-none focus:ring-2 focus:ring-[#00bbb1] focus:border-transparent"
        />
        <div className="space-y-1.5 max-h-[480px] overflow-y-auto pr-1">
          {filteredHooks.map(h => (
            <div key={h.id} className={`group flex items-start gap-2.5 px-3 py-2 rounded-lg border ${h.used ? 'border-[#f0f0f2] bg-[#fafafa]' : 'border-[#e5e7eb] bg-white'}`}>
              <input
                type="checkbox"
                checked={h.used}
                onChange={e => toggleHookUsed(h.id, e.target.checked)}
                title="Utilisé"
                className="w-4 h-4 mt-0.5 rounded accent-[#00bbb1] flex-shrink-0"
              />
              <span className={`flex-1 text-sm leading-snug ${h.used ? 'text-[#9ca3af]' : 'text-[#1a1a1a]'}`}>{h.text}</span>
              <button
                onClick={() => copyHook(h)}
                className={`text-[11px] font-semibold transition-opacity whitespace-nowrap ${copied === h.id ? 'text-emerald-600' : 'opacity-0 group-hover:opacity-100 text-[#00bbb1] hover:text-[#009e95]'}`}
              >
                {copied === h.id ? 'Copié ✓' : 'Copier'}
              </button>
              <button
                onClick={() => removeHook(h.id)}
                className="opacity-0 group-hover:opacity-100 text-[#9ca3af] hover:text-red-500 transition-opacity"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

// ============================================================================
// Page principale
// ============================================================================

const TABS = [
  { key: 'calendrier', label: 'Calendrier' },
  { key: 'pipeline', label: 'Pipeline' },
  { key: 'idees', label: 'Idées & Hooks' },
  { key: 'analyse', label: 'Analyse' },
]

export default function ReseauxSociaux() {
  const { posts, loading, createPost, updatePost, deletePost } = useSocialPosts()
  const { accounts } = useSocialAccounts()
  const { hooks: hooksBank } = useSocialHooks()
  const { ghlPosts, error: ghlPostsError } = useGhlPosts()
  const [tab, setTab] = useState('calendrier')
  const [modal, setModal] = useState(null) // { post } | { defaultDate } | { fromIdea }
  const [ghlModal, setGhlModal] = useState(null) // post GHL sélectionné

  // Importer un post GHL dans le pipeline local (le lie via ghl_post_id)
  async function importGhlPost(g, platforms, media) {
    const summary = (g.summary ?? '').trim()
    const when = g.scheduleDate ?? g.publishDate ?? null
    return createPost({
      title: summary ? (summary.length > 70 ? `${summary.slice(0, 70)}…` : summary) : 'Post GHL',
      caption: summary || null,
      status: g.status === 'published' ? 'publie' : 'programme',
      scheduled_at: when,
      published_at: g.status === 'published' ? when : null,
      platforms: platforms.length ? platforms : ['instagram'],
      media_urls: media,
      thumbnail_url: (g.media ?? []).find(m => m?.thumbnail)?.thumbnail ?? null,
      ghl_post_id: g._id ?? g.id ?? null,
    })
  }

  const counts = useMemo(() => {
    const c = { idee: 0, montage: 0, programme: 0, publie: 0 }
    for (const p of posts) c[p.status] = (c[p.status] ?? 0) + 1
    return c
  }, [posts])

  async function handleSave(fields) {
    if (modal?.post?.id) return updatePost(modal.post.id, fields)
    const res = await createPost(fields)
    if (!res.error && modal?.fromIdea) {
      // marquer l'idée source comme utilisée
      const { supabase } = await import('../lib/supabase')
      await supabase.from('social_ideas').update({ used: true }).eq('id', modal.fromIdea.id)
    }
    return res
  }

  async function handleDelete(id) {
    await deletePost(id)
    setModal(null)
  }

  return (
    <Layout>
      <Header title="Réseaux sociaux" />

      {/* Barre : onglets + stats rapides + nouveau */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center bg-white rounded-xl border border-[#e5e7eb] p-1">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                tab === t.key ? 'bg-[#00bbb1] text-white' : 'text-[#6b7280] hover:text-[#1a1a1a]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden lg:flex items-center gap-3 text-xs font-semibold text-[#6b7280]">
            <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500" />{counts.programme} programmé{counts.programme > 1 ? 's' : ''}</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" />{counts.montage} en montage</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" />{counts.publie} publié{counts.publie > 1 ? 's' : ''}</span>
          </div>
          <Button onClick={() => setModal({})}>
            <span className="mr-1.5 text-base leading-none">+</span> Nouveau contenu
          </Button>
        </div>
      </div>

      {loading ? (
        <Card className="p-8 text-center text-sm text-[#9ca3af]">Chargement…</Card>
      ) : (
        <>
          {tab === 'calendrier' && (
            <>
              {ghlPostsError && (
                <Card className="p-3 mb-3 border-amber-200 bg-amber-50">
                  <p className="text-xs font-semibold text-amber-700">Posts GHL non chargés : {ghlPostsError}</p>
                </Card>
              )}
              <CalendarView
                posts={posts}
                ghlPosts={ghlPosts}
                onDayClick={date => setModal({ defaultDate: date })}
                onPostClick={p => setModal({ post: p })}
                onGhlPostClick={g => setGhlModal(g)}
              />
            </>
          )}
          {tab === 'pipeline' && (
            <PipelineView
              posts={posts}
              onPostClick={p => setModal({ post: p })}
              onNewPost={() => setModal({})}
              onMoveStatus={(id, status) => updatePost(id, { status })}
            />
          )}
          {tab === 'idees' && (
            <IdeasView onCreateFromIdea={idea => setModal({ fromIdea: idea, post: null, prefillTitle: idea.title })} />
          )}
          {tab === 'analyse' && (
            <AnalyseView onEditPost={p => setModal({ post: p })} />
          )}
        </>
      )}

      {ghlModal && (
        <GhlPostModal
          ghlPost={ghlModal}
          accounts={accounts}
          onImport={importGhlPost}
          onClose={() => setGhlModal(null)}
        />
      )}

      {modal && (
        <PostModal
          post={modal.post ?? (modal.prefillTitle ? { title: modal.prefillTitle } : null)}
          defaultDate={modal.defaultDate}
          accounts={accounts}
          hooksBank={hooksBank}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setModal(null)}
        />
      )}
    </Layout>
  )
}
