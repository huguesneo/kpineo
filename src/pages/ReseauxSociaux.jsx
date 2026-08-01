import { useState, useMemo, useEffect } from 'react'
import Layout from '../components/layout/Layout'
import Header from '../components/layout/Header'
import Card from '../components/shared/Card'
import Button from '../components/shared/Button'
import Modal from '../components/shared/Modal'
import {
  useSocialPosts, useSocialIdeas, useSocialHooks, useSocialAccounts, useGhlPosts,
  useSocialPerformance, useSocialSnapshots,
  ghlCreatePost, ghlUpdatePost, ghlDeletePost, ghlGetStats, uploadSocialMedia,
} from '../hooks/useSocialPlanner'
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend } from 'recharts'

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
    script_url: post?.script_url ?? '',
    notes: post?.notes ?? '',
    hook_type: post?.hook_type ?? '',
    audience_problem: post?.audience_problem ?? '',
    proof_method: post?.proof_method ?? '',
    seo_keyword: post?.seo_keyword ?? '',
    is_trial: post?.is_trial ?? false,
  }))
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [uploading, setUploading] = useState(false)
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
      script_url: f.script_url || null,
      notes: f.notes || null,
      hook_type: f.hook_type || null,
      audience_problem: f.audience_problem || null,
      proof_method: f.proof_method || null,
      seo_keyword: f.seo_keyword || null,
      is_trial: f.is_trial,
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
      media: f.media_urls.map(url => ({ url })),
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
                  {/\.(mp4|mov|webm)($|\?)/i.test(url)
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
// Vue Performances
// ============================================================================

const METRIC_LABELS = {
  followers: 'Abonnés', followersCount: 'Abonnés', newFollowers: 'Nouveaux abonnés',
  impressions: 'Impressions', reach: 'Portée', views: 'Vues', profileViews: 'Vues de profil',
  likes: 'J\'aime', comments: 'Commentaires', shares: 'Partages', saves: 'Enregistrements',
  engagement: 'Engagement', engagementRate: 'Taux d\'engagement', posts: 'Posts', clicks: 'Clics',
}

function flattenMetrics(obj, prefix = '') {
  const out = []
  if (!obj || typeof obj !== 'object') return out
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'number') out.push({ key: prefix ? `${prefix}.${k}` : k, label: METRIC_LABELS[k] ?? k, value: v })
    else if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...flattenMetrics(v, prefix ? `${prefix}.${k}` : k))
  }
  return out
}

// ---------------------------------------------------------------------------
// Moteur d'analyse — score, index de performance, jointure publications
// ---------------------------------------------------------------------------

const VERDICT_META = {
  surperforme:   { label: 'Surperforme',   color: '#10b981', text: 'text-emerald-700', bg: 'bg-emerald-50' },
  normal:        { label: 'Normal',        color: '#6b7280', text: 'text-[#6b7280]',   bg: 'bg-gray-100' },
  sous_performe: { label: 'Sous-performe', color: '#ef4444', text: 'text-red-600',     bg: 'bg-red-50' },
  // « Insuffisant » n'est pas un échec : pas assez d'historique pour conclure.
  insuffisant:   { label: 'Insuffisant',   color: '#9ca3af', text: 'text-[#9ca3af]',   bg: 'bg-transparent' },
}

// Ordre = poids du score composite (partages 0,30 · sauvegardes 0,20 ·
// portée 0,20 · abonnements 0,20 · rétention 0,10)
const PI_KEYS = [
  { key: 'pi_share',  label: 'Partages' },
  { key: 'pi_save',   label: 'Sauvegardes' },
  { key: 'pi_reach',  label: 'Portée' },
  { key: 'pi_follow', label: 'Abonnements' },
  { key: 'pi_watch',  label: 'Rétention' },
]

const RATIO_KEYS = [
  { key: 'er_reach',      label: 'Engagement / portée' },
  { key: 'save_rate',     label: 'Taux de sauvegarde' },
  { key: 'share_rate',    label: 'Taux de partage' },
  { key: 'follow_rate',   label: 'Taux d\'abonnement' },
  { key: 'profile_ctr',   label: 'Clics vers le profil' },
  { key: 'watch_through', label: 'Rétention vidéo' },
]

// Format natif renvoyé par la plateforme — utilisé quand la publication
// n'est pas encore reliée à un contenu local (donc sans format taggé).
const MEDIA_TYPE_FORMAT = {
  REELS: 'Reel', VIDEO: 'Reel', CAROUSEL_ALBUM: 'Carrousel',
  IMAGE: 'Post', PHOTO: 'Post', STORY: 'Story',
}

const num = (v) => (v == null || v === '' ? null : Number(v))

// Une seule ligne par publication : d7 prioritaire, d28 en repli.
// Les deux fenêtres ne sont jamais comparables et ne doivent jamais
// concourir l'une contre l'autre dans le tri.
function pickScoreRow(rows) {
  if (!rows?.length) return null
  return rows.find(r => r.window_tag === 'd7') ?? rows.find(r => r.window_tag === 'd28') ?? rows[0]
}

function ScoreCell({ row }) {
  const score = row.score
  if (!score) {
    return (
      <span className="text-xs text-[#9ca3af]">
        {row.unsynced ? 'pas encore synchronisé' : 'en attente de relevé'}
      </span>
    )
  }
  const value = num(score.score)
  const verdict = score.verdict ?? 'insuffisant'
  const meta = VERDICT_META[verdict] ?? VERDICT_META.insuffisant
  if (verdict === 'insuffisant' || value == null) {
    return (
      <span className="text-xs text-[#9ca3af]" title={`Baseline de ${score.baseline_n ?? 0} publications — il en faut 8 pour conclure.`}>
        insuffisant
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-black ${meta.bg} ${meta.text}`} title={meta.label}>
        {Math.round(value)}
      </span>
      {score.window_tag === 'd28' && (
        <span
          className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-[#eef2ff] text-[#4f46e5]"
          title="Aucun relevé à J+7 pour cette publication — score mesuré sur la fenêtre J+28."
        >
          J+28
        </span>
      )}
    </span>
  )
}

// PI : 1,00 = performance typique. NULL = non mesuré (≠ zéro) → barre barrée.
function PiBar({ value, label }) {
  const v = num(value)
  if (v == null) {
    return (
      <span className="relative block w-9 h-2 rounded-full bg-[#f0f0f2]" title={`${label} : non mesuré`}>
        <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[#c7c7cc]" />
      </span>
    )
  }
  const color = v >= 1.2 ? '#10b981' : v <= 0.8 ? '#ef4444' : '#9ca3af'
  return (
    <span className="block w-9 h-2 rounded-full bg-[#f0f0f2] overflow-hidden" title={`${label} : ${v.toFixed(2)}×`}>
      <span
        className="block h-full rounded-full"
        style={{ width: `${Math.max(4, Math.min(100, (v / 2) * 100))}%`, backgroundColor: color }}
      />
    </span>
  )
}

function PiBars({ score }) {
  if (!score) return <span className="text-[#d1d5db] text-xs">—</span>
  return (
    <span className="inline-flex items-center gap-1">
      {PI_KEYS.map(k => <PiBar key={k.key} value={score[k.key]} label={k.label} />)}
    </span>
  )
}

// Construit les lignes du tableau : une par publication native, enrichie du
// tagging local quand le post est relié, + les posts publiés localement qui
// n'ont pas encore de publication (plutôt que de les faire disparaître).
function buildPerfRows(publications, scores, posts) {
  const scoresByPub = {}
  for (const s of scores) (scoresByPub[s.publication_id] ??= []).push(s)
  const postById = {}
  for (const p of posts) postById[p.id] = p

  const rows = publications.map(pub => {
    const post = pub.post_id ? postById[pub.post_id] : null
    const nativeFormat = MEDIA_TYPE_FORMAT[pub.media_type] ?? pub.media_type ?? null
    return {
      key: pub.id,
      publication: pub,
      post,
      title: post?.title ?? (pub.caption ? pub.caption.replace(/\s+/g, ' ').slice(0, 70) : 'Publication sans légende'),
      platform: pub.platform,
      format: post?.format ?? nativeFormat,
      formatIsNative: !post?.format,
      sphere: post?.sphere ?? null,
      hookType: post?.hook_type ?? null,
      audienceProblem: post?.audience_problem ?? null,
      publishedAt: pub.published_at,
      score: pickScoreRow(scoresByPub[pub.id]),
      unsynced: false,
    }
  })

  const linkedPostIds = new Set(publications.map(p => p.post_id).filter(Boolean))
  for (const p of posts) {
    if (p.status !== 'publie' || linkedPostIds.has(p.id)) continue
    rows.push({
      key: `post-${p.id}`,
      publication: null,
      post: p,
      title: p.title,
      platform: (p.platforms ?? [])[0] ?? null,
      format: p.format ?? null,
      formatIsNative: false,
      sphere: p.sphere ?? null,
      hookType: p.hook_type ?? null,
      audienceProblem: p.audience_problem ?? null,
      publishedAt: p.published_at,
      score: null,
      unsynced: true,
    })
  }
  return rows
}

// ---------------------------------------------------------------------------
// Panneau de détail d'une publication
// ---------------------------------------------------------------------------

function PublicationDetail({ row, onEditPost, onClose }) {
  const { snapshots, loading } = useSocialSnapshots(row.publication?.id)
  const score = row.score
  const meta = VERDICT_META[score?.verdict ?? 'insuffisant'] ?? VERDICT_META.insuffisant

  const chartData = useMemo(() => snapshots.map(s => ({
    date: new Date(s.captured_at).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' }),
    Portée: s.reach ?? null,
    Vues: s.views ?? null,
    Interactions: s.total_interactions ?? null,
  })), [snapshots])

  return (
    <Modal isOpen onClose={onClose} title="Détail de la publication" size="lg">
      <div className="space-y-4">
        <div>
          <p className="text-sm font-bold text-[#1a1a1a] leading-snug">{row.title}</p>
          <div className="flex items-center gap-2 flex-wrap mt-2">
            {row.platform && (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold text-white"
                style={{ backgroundColor: PLATFORM_META[row.platform]?.color ?? '#9ca3af' }}>
                {PLATFORM_META[row.platform]?.label ?? row.platform}
              </span>
            )}
            {row.format && <KindBadge format={row.format} />}
            {row.hookType && <HookTypeBadge hookType={row.hookType} />}
            {row.sphere && <span className="text-[11px] text-[#9ca3af]">{row.sphere}</span>}
            <span className="text-[11px] font-semibold text-[#6b7280] ml-auto">
              {row.publishedAt ? new Date(row.publishedAt).toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
            </span>
          </div>
        </div>

        {/* Score + index */}
        {score && num(score.score) != null ? (
          <div className="rounded-xl border border-[#e5e7eb] p-4">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-3xl font-black" style={{ color: meta.color }}>{Math.round(num(score.score))}</span>
              <div>
                <p className="text-sm font-bold" style={{ color: meta.color }}>{meta.label}</p>
                <p className="text-xs text-[#9ca3af]">
                  100 = ta médiane · baseline de {score.baseline_n ?? 0} publications
                  {score.window_tag === 'd28' && ' · mesuré à J+28'}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {PI_KEYS.map(k => {
                const v = num(score[k.key])
                return (
                  <div key={k.key} className="bg-[#f9fafb] rounded-lg px-2 py-1.5">
                    <p className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wide truncate">{k.label}</p>
                    <p className={`text-sm font-black ${v == null ? 'text-[#c7c7cc] line-through' : 'text-[#1a1a1a]'}`}>
                      {v == null ? 'n.m.' : `${v.toFixed(2)}×`}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <p className="text-sm text-[#9ca3af] bg-[#f9fafb] rounded-lg px-3 py-2">
            {row.unsynced
              ? 'Contenu publié depuis l\'app mais pas encore relié à une publication native — aucun relevé de métriques.'
              : row.score
                ? 'Pas assez d\'historique comparable pour calculer un score (baseline < 8 publications).'
                : 'Aucun score calculé pour l\'instant — le relevé de la fenêtre canonique n\'a pas encore eu lieu.'}
          </p>
        )}

        {/* Ratios bruts */}
        {score && (
          <div>
            <p className="text-xs font-bold text-[#6b7280] uppercase tracking-wide mb-2">Ratios bruts</p>
            <div className="grid grid-cols-3 gap-2">
              {RATIO_KEYS.map(r => {
                const v = num(score[r.key])
                return (
                  <div key={r.key} className="bg-[#f9fafb] rounded-lg px-2.5 py-1.5">
                    <p className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wide truncate">{r.label}</p>
                    <p className={`text-sm font-black ${v == null ? 'text-[#c7c7cc]' : 'text-[#1a1a1a]'}`}>
                      {v == null ? 'non mesuré' : `${(v * 100).toFixed(2)} %`}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Historique des relevés */}
        {row.publication && (
          <div>
            <p className="text-xs font-bold text-[#6b7280] uppercase tracking-wide mb-2">Relevés dans le temps</p>
            {loading && <p className="text-xs text-[#9ca3af]">Chargement…</p>}
            {!loading && chartData.length > 1 && (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 8, bottom: 0, left: -12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f2" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="Portée" stroke="#00bbb1" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    <Line type="monotone" dataKey="Vues" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    <Line type="monotone" dataKey="Interactions" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            {!loading && chartData.length === 1 && (
              <p className="text-xs text-[#9ca3af]">
                Un seul relevé ({snapshots[0].window_tag ?? 'hors fenêtre'}) — la courbe apparaîtra au prochain relevé.
              </p>
            )}
            {!loading && !chartData.length && (
              <p className="text-xs text-[#9ca3af]">Aucun relevé de métriques pour l'instant.</p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-[#e5e7eb]">
          {row.publication?.permalink
            ? (
              <a href={row.publication.permalink} target="_blank" rel="noopener noreferrer"
                className="text-sm font-semibold text-[#00bbb1] hover:text-[#009e95]">
                Voir la publication native ↗
              </a>
            )
            : <span className="text-xs text-[#9ca3af]">Pas de lien natif disponible.</span>}
          <div className="flex items-center gap-2">
            {onEditPost && <Button variant="secondary" size="sm" onClick={onEditPost}>Modifier le contenu</Button>}
            <Button variant="secondary" onClick={onClose}>Fermer</Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Tableau scoré
// ---------------------------------------------------------------------------

const PERF_SORTS = {
  score: (a, b) => (num(b.score?.score) ?? -Infinity) - (num(a.score?.score) ?? -Infinity),
  date:  (a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''),
  titre: (a, b) => (a.title ?? '').localeCompare(b.title ?? '', 'fr'),
}

function Th({ children, sortKey, sort, onSort }) {
  return (
    <th className="text-left text-[10px] font-bold text-[#9ca3af] uppercase tracking-wide pb-2 px-2">
      {sortKey
        ? (
          <button
            onClick={() => onSort(sortKey)}
            className={`uppercase tracking-wide hover:text-[#1a1a1a] ${sort === sortKey ? 'text-[#00bbb1]' : ''}`}
          >
            {children}{sort === sortKey ? ' ↓' : ''}
          </button>
        )
        : children}
    </th>
  )
}

function ScoredTable({ rows, onRowClick }) {
  const [sort, setSort] = useState('score')
  const sorted = useMemo(() => [...rows].sort(PERF_SORTS[sort]), [rows, sort])

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-[#e5e7eb]">
            <Th sortKey="titre" sort={sort} onSort={setSort}>Titre</Th>
            <Th>Plateforme</Th>
            <Th>Format</Th>
            <Th>Sphère</Th>
            <Th>Hook</Th>
            <Th sortKey="date" sort={sort} onSort={setSort}>Date</Th>
            <Th sortKey="score" sort={sort} onSort={setSort}>Score</Th>
            <Th>Index</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#f0f0f2]">
          {sorted.map(r => (
            <tr
              key={r.key}
              onClick={() => onRowClick(r)}
              className="cursor-pointer hover:bg-[#f9fafb] transition-colors"
            >
              <td className="py-2.5 px-2 max-w-[280px]">
                <p className="text-sm font-semibold text-[#1a1a1a] truncate">{r.title}</p>
              </td>
              <td className="py-2.5 px-2">
                {r.platform && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#6b7280]">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PLATFORM_META[r.platform]?.color ?? '#9ca3af' }} />
                    {PLATFORM_META[r.platform]?.label ?? r.platform}
                  </span>
                )}
              </td>
              <td className="py-2.5 px-2 whitespace-nowrap">
                {r.format
                  ? <span className={r.formatIsNative ? 'opacity-60' : ''} title={r.formatIsNative ? 'Format natif de la plateforme — le post n\'est pas relié à un contenu taggé.' : undefined}>
                      <KindBadge format={r.format} />
                    </span>
                  : <span className="text-xs text-[#d1d5db]">—</span>}
              </td>
              <td className="py-2.5 px-2 text-xs text-[#6b7280] max-w-[130px] truncate">{r.sphere ?? <span className="text-[#d1d5db]">—</span>}</td>
              <td className="py-2.5 px-2">{r.hookType ? <HookTypeBadge hookType={r.hookType} /> : <span className="text-xs text-[#d1d5db]">—</span>}</td>
              <td className="py-2.5 px-2 text-xs font-semibold text-[#6b7280] whitespace-nowrap">{fmtDate(r.publishedAt) ?? '—'}</td>
              <td className="py-2.5 px-2 whitespace-nowrap"><ScoreCell row={r} /></td>
              <td className="py-2.5 px-2"><PiBars score={r.score} /></td>
            </tr>
          ))}
          {!sorted.length && (
            <tr><td colSpan={8} className="py-4 text-sm text-[#9ca3af]">Aucune publication mesurée pour l'instant.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

const PLATFORM_TABS = ['instagram', 'facebook', 'tiktok']

function PerformanceView({ accounts, accountsError, posts, onPostClick, perf }) {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [detail, setDetail] = useState(null)
  const [platformTab, setPlatformTab] = useState('tous')

  const socialAccounts = useMemo(() => accounts.filter(a => a.platform !== 'google'), [accounts])

  useEffect(() => {
    if (!socialAccounts.length) return
    let cancelled = false
    setLoading(true)
    ghlGetStats(socialAccounts.map(a => a.profileId)).then(res => {
      if (cancelled) return
      if (!res.ok) setError(res.error)
      else setStats(res.data)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [socialAccounts])

  const rows = useMemo(
    () => buildPerfRows(perf.publications, perf.scores, posts),
    [perf.publications, perf.scores, posts],
  )

  const rowCountsByPlatform = useMemo(() => {
    const counts = {}
    for (const r of rows) counts[r.platform] = (counts[r.platform] ?? 0) + 1
    return counts
  }, [rows])

  const filteredRows = useMemo(
    () => (platformTab === 'tous' ? rows : rows.filter(r => r.platform === platformTab)),
    [rows, platformTab],
  )

  const accountNameByPlatform = useMemo(() => {
    const map = {}
    for (const a of accounts) if (!map[a.platform]) map[a.platform] = a.name
    return map
  }, [accounts])

  const kpis = useMemo(() => {
    const snaps = perf.accountSnapshots
    // Vélocité : abonnés du dernier relevé de chaque compte moins ceux du
    // relevé le plus proche de J-7, sommés sur les comptes.
    let velocity = null
    const byAccount = {}
    for (const s of snaps) (byAccount[s.account_id] ??= []).push(s)
    const cutoff = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)
    for (const list of Object.values(byAccount)) {
      const sorted = [...list].sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date))
      const latest = sorted.find(s => s.followers != null)
      const past = sorted.find(s => s.followers != null && s.snapshot_date <= cutoff)
      if (latest && past && latest !== past) velocity = (velocity ?? 0) + (latest.followers - past.followers)
    }

    const shares = Object.values(byAccount)
      .map(list => [...list].sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date))
        .find(s => s.non_follower_view_share != null))
      .filter(Boolean)
      .map(s => Number(s.non_follower_view_share))
    const nonFollowerShare = shares.length ? shares.reduce((a, b) => a + b, 0) / shares.length : null

    const pendingMatch = perf.publications.filter(
      p => p.match_status === 'ambiguous' || p.match_status === 'unlinked',
    ).length

    return { followerVelocity: velocity, nonFollowerShare, pendingMatch }
  }, [perf.accountSnapshots, perf.publications])

  const statsByAccount = useMemo(() => {
    if (!stats) return {}
    const results = stats.results ?? stats
    const map = {}
    if (Array.isArray(results)) {
      for (const r of results) map[r.profileId ?? r.accountId ?? r.id ?? r.platform] = r
    } else if (typeof results === 'object') {
      Object.assign(map, results)
    }
    return map
  }, [stats])

  return (
    <div className="space-y-5">
      {accountsError && (
        <Card className="p-4 border-red-200 bg-red-50">
          <p className="text-sm font-semibold text-red-700">Connexion GHL impossible : {accountsError}</p>
          <p className="text-xs text-red-600 mt-1">Vérifie que la clé API GHL a les permissions « Social Planner » (View/Edit).</p>
        </Card>
      )}
      {error && (
        <Card className="p-4 border-amber-200 bg-amber-50">
          <p className="text-sm font-semibold text-amber-700">Statistiques indisponibles : {error}</p>
          <p className="text-xs text-amber-600 mt-1">La clé API GHL n'a peut-être pas le scope statistiques. Les comptes et la publication fonctionnent quand même.</p>
        </Card>
      )}

      {/* Cartes par compte */}
      <div className="grid grid-cols-3 gap-4">
        {socialAccounts.map(a => {
          const meta = PLATFORM_META[a.platform] ?? { label: a.platform, color: '#9ca3af' }
          const accStats = statsByAccount[a.profileId] ?? statsByAccount[a.platform]
          const metrics = flattenMetrics(accStats).slice(0, 6)
          return (
            <Card key={a.id} className="p-5">
              <div className="flex items-center gap-3 mb-3">
                {a.avatar
                  ? <img src={a.avatar} alt={a.name} className="w-10 h-10 rounded-full object-cover border border-[#e5e7eb]" />
                  : <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: meta.color }}>{meta.label[0]}</div>}
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[#1a1a1a] truncate">{a.name}</p>
                  <p className="text-xs font-semibold" style={{ color: meta.color }}>{meta.label}</p>
                </div>
                <span className="ml-auto w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" title="Connecté" />
              </div>
              {loading && <p className="text-xs text-[#9ca3af]">Chargement des stats…</p>}
              {!loading && metrics.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {metrics.map(m => (
                    <div key={m.key} className="bg-[#f9fafb] rounded-lg px-2.5 py-1.5">
                      <p className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wide truncate">{m.label}</p>
                      <p className="text-sm font-black text-[#1a1a1a]">{m.value.toLocaleString('fr-CA')}</p>
                    </div>
                  ))}
                </div>
              )}
              {!loading && !metrics.length && !error && (
                <p className="text-xs text-[#9ca3af]">7 derniers jours — aucune donnée retournée.</p>
              )}
            </Card>
          )
        })}
        {!socialAccounts.length && !accountsError && (
          <Card className="p-5 col-span-3"><p className="text-sm text-[#9ca3af]">Chargement des comptes connectés…</p></Card>
        )}
      </div>

      {/* Indicateurs au niveau compte */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4">
          <p className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wide">Vélocité d'abonnés · 7 j</p>
          {kpis.followerVelocity == null
            ? <p className="text-sm text-[#9ca3af] mt-1">Pas encore de relevé de compte.</p>
            : (
              <p className={`text-2xl font-black mt-0.5 ${kpis.followerVelocity >= 0 ? 'text-[#1a1a1a]' : 'text-red-600'}`}>
                {kpis.followerVelocity >= 0 ? '+' : ''}{kpis.followerVelocity.toLocaleString('fr-CA')}
              </p>
            )}
        </Card>
        <Card className="p-4">
          <p className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wide">Part de vues non-abonnés</p>
          {kpis.nonFollowerShare == null
            ? <p className="text-sm text-[#9ca3af] mt-1">Pas encore de relevé de compte.</p>
            : <p className="text-2xl font-black text-[#1a1a1a] mt-0.5">{(kpis.nonFollowerShare * 100).toFixed(1)} %</p>}
        </Card>
        <Card className="p-4">
          <p className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wide">Publications à relier</p>
          <p className={`text-2xl font-black mt-0.5 ${kpis.pendingMatch ? 'text-amber-600' : 'text-[#1a1a1a]'}`}>
            {kpis.pendingMatch}
          </p>
          <p className="text-[11px] text-[#9ca3af] mt-0.5">Statut ambigu ou non relié.</p>
        </Card>
      </div>

      {/* Filtre par plateforme */}
      <div className="flex items-center gap-1 bg-white rounded-xl border border-[#e5e7eb] p-1 w-fit">
        <button
          onClick={() => setPlatformTab('tous')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            platformTab === 'tous' ? 'bg-[#00bbb1] text-white' : 'text-[#6b7280] hover:text-[#1a1a1a]'
          }`}
        >
          Tous <span className="opacity-70">({rows.length})</span>
        </button>
        {PLATFORM_TABS.map(p => {
          const meta = PLATFORM_META[p] ?? { label: p }
          const accountName = accountNameByPlatform[p]
          return (
            <button
              key={p}
              onClick={() => setPlatformTab(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                platformTab === p ? 'bg-[#00bbb1] text-white' : 'text-[#6b7280] hover:text-[#1a1a1a]'
              }`}
            >
              {meta.label}{accountName ? ` (${accountName})` : ''} <span className="opacity-70">({rowCountsByPlatform[p] ?? 0})</span>
            </button>
          )
        })}
      </div>

      {/* Tableau scoré */}
      <Card className="p-5">
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="text-base font-bold text-[#1a1a1a]">
            Publications mesurées <span className="text-sm font-semibold text-[#9ca3af]">({rows.length})</span>
          </h3>
          <p className="text-xs text-[#9ca3af]">100 = ta médiane pour ce format sur cette plateforme.</p>
        </div>
        {perf.error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-3">Données d'analyse : {perf.error}</p>
        )}
        {perf.loading
          ? <p className="text-sm text-[#9ca3af]">Chargement des publications…</p>
          : <ScoredTable rows={filteredRows} onRowClick={setDetail} />}
      </Card>

      {detail && (
        <PublicationDetail
          row={detail}
          onEditPost={detail.post ? () => { const p = detail.post; setDetail(null); onPostClick(p) } : null}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  )
}

// ============================================================================
// Vue Patterns — agrégats sur 90 jours glissants
// ============================================================================

// Sous ce seuil, on n'affiche ni médiane ni bande : c'est le garde-fou
// visuel du plan. Un groupe de 3 posts ne dit rien.
const MIN_N = 6
const BOOTSTRAP_ITER = 1000
const PATTERN_WINDOW_DAYS = 90

function median(values) {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

// Bootstrap par percentiles — 1000 rééchantillonnages avec remise.
// Le volume est petit (quelques dizaines de posts), ça tourne en quelques ms.
function bootstrapMedianCI(values) {
  if (values.length < 2) return null
  const meds = new Array(BOOTSTRAP_ITER)
  const sample = new Array(values.length)
  for (let i = 0; i < BOOTSTRAP_ITER; i++) {
    for (let j = 0; j < values.length; j++) sample[j] = values[Math.floor(Math.random() * values.length)]
    meds[i] = median(sample)
  }
  meds.sort((a, b) => a - b)
  const at = q => meds[Math.min(meds.length - 1, Math.max(0, Math.round(q * (meds.length - 1))))]
  return [at(0.025), at(0.975)]
}

const PATTERN_DIMENSIONS = [
  { key: 'sphere',          label: 'Par sphère' },
  { key: 'format',          label: 'Par format' },
  { key: 'hookType',        label: 'Par type de hook' },
  { key: 'audienceProblem', label: 'Par problème d\'audience' },
]

function groupRows(rows, key) {
  const groups = {}
  for (const r of rows) {
    const g = (r[key] ?? '').trim() || 'Non renseigné'
    ;(groups[g] ??= []).push(num(r.score.score))
  }
  return Object.entries(groups)
    .map(([label, values]) => {
      const enough = values.length >= MIN_N
      return {
        label,
        n: values.length,
        median: enough ? median(values) : null,
        ci: enough ? bootstrapMedianCI(values) : null,
      }
    })
    .sort((a, b) => (b.median ?? -Infinity) - (a.median ?? -Infinity) || b.n - a.n)
}

function PatternTable({ label, groups }) {
  return (
    <Card className="p-5">
      <h3 className="text-base font-bold text-[#1a1a1a] mb-3">{label}</h3>
      <table className="w-full">
        <thead>
          <tr className="border-b border-[#e5e7eb]">
            <th className="text-left text-[10px] font-bold text-[#9ca3af] uppercase tracking-wide pb-2">Groupe</th>
            <th className="text-right text-[10px] font-bold text-[#9ca3af] uppercase tracking-wide pb-2 w-12">n</th>
            <th className="text-right text-[10px] font-bold text-[#9ca3af] uppercase tracking-wide pb-2 w-20">Médiane</th>
            <th className="text-right text-[10px] font-bold text-[#9ca3af] uppercase tracking-wide pb-2 w-40">Bande de confiance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#f0f0f2]">
          {groups.map(g => {
            const weak = g.median == null
            return (
              <tr key={g.label} className={weak ? 'text-[#9ca3af]' : ''}>
                <td className="py-2 text-sm font-semibold max-w-[180px] truncate" title={g.label}>{g.label}</td>
                <td className="py-2 text-sm text-right font-semibold">{g.n}</td>
                {weak
                  ? <td className="py-2 text-xs text-right italic" colSpan={2}>échantillon insuffisant</td>
                  : (
                    <>
                      <td className="py-2 text-sm text-right font-black text-[#1a1a1a]">{Math.round(g.median)}</td>
                      <td className="py-2 text-xs text-right text-[#6b7280]">
                        {g.ci ? `${Math.round(g.ci[0])} – ${Math.round(g.ci[1])}` : '—'}
                      </td>
                    </>
                  )}
              </tr>
            )
          })}
          {!groups.length && (
            <tr><td colSpan={4} className="py-3 text-sm text-[#9ca3af]">Aucune publication scorée sur la fenêtre.</td></tr>
          )}
        </tbody>
      </table>
    </Card>
  )
}

function PatternsView({ posts, perf }) {
  const scoredRows = useMemo(() => {
    const cutoff = Date.now() - PATTERN_WINDOW_DAYS * 864e5
    return buildPerfRows(perf.publications, perf.scores, posts).filter(
      r => num(r.score?.score) != null && r.publishedAt && Date.parse(r.publishedAt) >= cutoff,
    )
  }, [perf.publications, perf.scores, posts])

  const tables = useMemo(
    () => PATTERN_DIMENSIONS.map(d => ({ ...d, groups: groupRows(scoredRows, d.key) })),
    [scoredRows],
  )

  const taggedCount = scoredRows.filter(r => r.post).length

  if (perf.loading) return <Card className="p-8 text-center text-sm text-[#9ca3af]">Chargement…</Card>

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <p className="text-sm text-[#1a1a1a]">
          <span className="font-semibold">{scoredRows.length}</span> publication{scoredRows.length > 1 ? 's' : ''} scorée{scoredRows.length > 1 ? 's' : ''} sur les {PATTERN_WINDOW_DAYS} derniers jours.
          Bande de confiance à 95 % par bootstrap ({BOOTSTRAP_ITER} rééchantillonnages).
        </p>
        <p className="text-xs text-[#9ca3af] mt-1">
          Sous {MIN_N} publications, un groupe reste gris : c'est normal au début, pas une erreur — il n'y a simplement pas de quoi conclure.
        </p>
        {scoredRows.length > 0 && taggedCount === 0 && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
            Aucune publication scorée n'est encore reliée à un contenu local : sphère, hook et problème d'audience
            resteront « Non renseigné » tant que le matching n'aura pas lié <code>social_publications.post_id</code>.
            Seul le format est disponible, via le type de média natif.
          </p>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-4">
        {tables.map(t => <PatternTable key={t.key} label={t.label} groups={t.groups} />)}
      </div>
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
  { key: 'performances', label: 'Performances' },
  { key: 'patterns', label: 'Patterns' },
]

export default function ReseauxSociaux() {
  const { posts, loading, createPost, updatePost, deletePost } = useSocialPosts()
  const { accounts, error: accountsError } = useSocialAccounts()
  const { hooks: hooksBank } = useSocialHooks()
  const { ghlPosts, error: ghlPostsError } = useGhlPosts()
  const perf = useSocialPerformance()
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
          {tab === 'performances' && (
            <PerformanceView
              accounts={accounts}
              accountsError={accountsError}
              posts={posts}
              onPostClick={p => setModal({ post: p })}
              perf={perf}
            />
          )}
          {tab === 'patterns' && <PatternsView posts={posts} perf={perf} />}
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
