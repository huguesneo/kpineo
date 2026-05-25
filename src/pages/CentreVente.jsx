import { useState } from 'react'
import Layout from '../components/layout/Layout'

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_BOOKING_URL = 'https://api.leadconnectorhq.com/widget/booking/ucyJmhYKKDDm7U5JmaJ8'

const SETTERS = [
  { key: 'manuel_thibault', label: 'Thibault' },
  { key: 'manuel_brice',    label: 'Brice' },
  { key: 'manuel_lyliane',  label: 'Lyliane' },
  { key: 'manuel_erika',    label: 'Erika' },
  { key: 'manuel_maude',    label: 'Maude' },
  { key: 'manuel_cloe',     label: 'Cloé' },
  { key: 'manuel_jessica',  label: 'Jessica' },
  { key: 'manuel_tamara',   label: 'Tamara' },
  { key: 'manuel_pascal',   label: 'Pascal' },
  { key: 'manuel_hugues',   label: 'Hugues' },
  { key: 'manuel_vicky',    label: 'Vicky' },
]

const EVAL_IFRAMES = {
  clinique:  'https://api.leadconnectorhq.com/widget/booking/nF4GjzBPg0JJu7aSdi4d',
  ligne:     'https://api.leadconnectorhq.com/widget/booking/EN1rRFnOcotGonaMAV3N',
  ouverture: 'https://api.leadconnectorhq.com/widget/booking/7BpembfPxvDHewFh51EN',
}

const BILAN_IFRAMES = {
  ligne:    'https://api.leadconnectorhq.com/widget/booking/YCEFrPWQDpvfi30usnPF',
  clinique: 'https://api.leadconnectorhq.com/widget/booking/JoFdnQsmZzd5lO0EQPH5',
}

const HOME_CARDS = [
  {
    id: 'rencontres',
    label: 'Rencontres',
    sub: 'Découvertes & Suivis',
    img: 'https://assets.cdn.filesafe.space/YG2spvWJqnD75L3V95UJ/media/6985ce94d017c3d9f2db1b2f.jpg',
  },
  {
    id: 'evaluations',
    label: 'Évaluations',
    sub: 'Ouverture de dossier',
    img: 'https://assets.cdn.filesafe.space/YG2spvWJqnD75L3V95UJ/media/6985ce940a7fd14079b1638f.jpg',
  },
  {
    id: 'bilans',
    label: 'Bilans',
    sub: 'Métaboliques',
    img: 'https://assets.cdn.filesafe.space/YG2spvWJqnD75L3V95UJ/media/6985ce94d017c3a51cdb1b2e.jpg',
  },
  {
    id: 'nurturing',
    label: 'Nurturing',
    sub: 'Vidéos & Scripts',
    img: 'https://assets.cdn.filesafe.space/YG2spvWJqnD75L3V95UJ/media/6985ce941dfc023f86bfaf37.jpg',
  },
]

const SECTION_META = {
  rencontres:  { title: 'Rencontres Découvertes',  sub: "Gérez vos appels d'exploration et suivis" },
  evaluations: { title: 'Évaluations',              sub: 'Gérez les ouvertures de dossiers' },
  bilans:      { title: 'Bilans Métaboliques',      sub: 'Planifiez les bilans' },
  nurturing:   { title: 'Vidéo Nurturing',          sub: 'Ressources à envoyer aux prospects' },
}

const NURTURING_CASES = [
  {
    id: 'sylvie',
    title: 'Cas : Sylvie (Ménopause)',
    target: 'Femme 50+, Bouffées de chaleur, "Rien ne marche".',
    badge: 'Hormones',
    badgeCls: 'bg-purple-100 text-purple-700',
    media: { type: 'video', src: 'https://storage.googleapis.com/msgsndr/YG2spvWJqnD75L3V95UJ/media/698dd9a25ea071a4c0d88d31.mp4' },
    link: 'https://go.neoperformance.ca/etude-de-cas-sylvie',
    sms: "Salut [Prénom], c'est [Ton Nom] de l'équipe NEO.\n\nComme on s'est dit au téléphone, ton profil me fait beaucoup penser à Sylvie (52 ans). Elle faisait tout \"comme avant\" mais la ménopause bloquait ses résultats.\n\nJe t'envoie son étude de cas ici (5 min) : https://go.neoperformance.ca/etude-de-cas-sylvie\n\nRegarde bien la partie sur le cortisol, c'est la clé pour toi. À demain !",
  },
  {
    id: 'melanie',
    title: 'Cas : Mélanie (Plateau)',
    target: 'Mange 1200 cal, Cardio +, Ne perd pas, Stressée.',
    badge: 'Métabolisme',
    badgeCls: 'bg-orange-100 text-orange-700',
    media: { type: 'video', src: 'https://storage.googleapis.com/msgsndr/YG2spvWJqnD75L3V95UJ/media/698ce1f37f6dcf2546237468.mp4' },
    link: 'https://go.neoperformance.ca/etude-de-cas-melanie',
    sms: "Salut [Prénom], c'est [Ton Nom] de NEO.\n\nJe viens de réanalyser ton questionnaire. Ta situation (manger peu mais ne pas perdre) est identique à celle de Mélanie qu'on a aidée récemment.\n\nRegarde son protocole ici (5 min) : https://go.neoperformance.ca/etude-de-cas-melanie\n\nTu vas comprendre pourquoi \"manger moins\" bloquait tout. Hâte qu'on en parle !",
  },
  {
    id: 'camille',
    title: 'Cas : Camille (Bas du Corps)',
    target: 'Femme qui stocke dans le bas du corps malgré le sport.',
    badge: 'Estrogènes',
    badgeCls: 'bg-pink-100 text-pink-700',
    media: { type: 'video', src: 'https://storage.googleapis.com/msgsndr/YG2spvWJqnD75L3V95UJ/media/698e1332a449647a3e997436.mp4' },
    link: 'https://go.neoperformance.ca/etude-cas-camille',
    sms: "Salut [Prénom], c'est [Ton Nom] de NEO.\n\nJe pensais à ce que tu m'as dit : tu perds du haut, mais le bas du corps ne bouge pas malgré le sport.\n\nJ'ai un cas identique au tien (Camille). Regarde son étude de cas ici (5 min) : https://go.neoperformance.ca/etude-cas-camille\n\nTu vas comprendre pourquoi ce n'est pas le sport qui bloque, mais le foie. Ça va t'aider !",
  },
  {
    id: 'preuves',
    title: 'Preuves Sociales (Fallback)',
    target: 'Aucun cas spécifique ne correspond — envoie le mur de résultats.',
    badge: 'Universel',
    badgeCls: 'bg-teal-100 text-teal-700',
    media: { type: 'image', src: 'https://assets.cdn.filesafe.space/YG2spvWJqnD75L3V95UJ/media/6a05eac5e92818f121a4fbe8.png' },
    link: 'https://go.neoperformance.ca/clients-neo',
    sms: "Salut [Prénom], c'est [Ton Nom] de NEO.\n\nAvant notre rencontre, je voulais te montrer les résultats de quelques-uns de nos clients — des gens qui, comme toi, avaient l'impression d'avoir tout essayé.\n\nJette un œil ici (2 min) : https://go.neoperformance.ca/clients-neo\n\nHâte de jaser de ton dossier !",
  },
]

// ─── Sub-components ───────────────────────────────────────────────────────────

function TabBar({ tabs, active, onChange }) {
  return (
    <div className="flex flex-wrap border-b border-[#e5e7eb] mb-6">
      {tabs.map(t => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`px-4 py-3 font-semibold text-sm border-b-2 transition-colors ${
            active === t.key
              ? 'border-[#00bbb1] text-[#00bbb1]'
              : 'border-transparent text-[#6b7280] hover:text-[#1a1a1a]'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

function BookingIframe({ src }) {
  if (!src) return null
  return (
    <iframe
      key={src}
      src={src}
      style={{ width: '100%', border: 'none', overflow: 'hidden', height: 800 }}
      scrolling="no"
      title="Calendrier de réservation"
    />
  )
}

function SetterSelector({ onSelect }) {
  return (
    <div className="max-w-md mx-auto py-12 text-center">
      <p className="text-xs font-black uppercase tracking-widest text-[#00bbb1] mb-2">Étape 1</p>
      <h3 className="text-xl font-black text-[#1a1a1a] mb-1">Qui envoie cette rencontre ?</h3>
      <p className="text-sm text-[#9ca3af] mb-8">Sélectionne ton prénom pour charger le calendrier.</p>
      <div className="grid grid-cols-3 gap-3">
        {SETTERS.map(s => (
          <button
            key={s.key}
            onClick={() => onSelect(s)}
            className="px-4 py-3 rounded-xl border-2 border-[#e5e7eb] text-sm font-bold text-[#4b5563] hover:border-[#00bbb1] hover:text-[#00bbb1] hover:bg-[#00bbb1]/5 transition-all"
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function NurturingCard({ cas, copiedId, onCopy }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-[#e5e7eb] flex flex-col">
      <div className="p-5 border-b border-[#e5e7eb] bg-[#f9fafb] flex justify-between items-start gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-[#1a1a1a]">{cas.title}</h3>
          <p className="text-sm text-[#6b7280] mt-0.5">
            <span className="font-bold text-red-500">Cible :</span> {cas.target}
          </p>
        </div>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0 ${cas.badgeCls}`}>
          {cas.badge}
        </span>
      </div>

      <div className="aspect-video w-full bg-black">
        {cas.media.type === 'video' ? (
          <video controls className="w-full h-full object-cover">
            <source src={cas.media.src} type="video/mp4" />
          </video>
        ) : (
          <img src={cas.media.src} alt={cas.title} className="w-full h-full object-cover" />
        )}
      </div>

      <div className="p-5 space-y-5 flex-grow">
        {/* Lien */}
        <div>
          <p className="text-xs font-bold text-[#9ca3af] uppercase tracking-wide mb-2">Lien de la page</p>
          <div className="flex">
            <input
              type="text"
              readOnly
              value={cas.link}
              className="w-full bg-[#f9fafb] border border-[#e5e7eb] text-[#6b7280] text-sm rounded-l-xl px-3 py-2.5 focus:outline-none min-w-0"
            />
            <button
              onClick={() => onCopy(`link-${cas.id}`, cas.link)}
              className={`px-4 rounded-r-xl text-sm font-bold flex items-center gap-1.5 transition-all flex-shrink-0 ${
                copiedId === `link-${cas.id}`
                  ? 'bg-[#10b981] text-white'
                  : 'bg-[#1a1a1a] text-white hover:bg-black'
              }`}
            >
              {copiedId === `link-${cas.id}` ? (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  Copié
                </>
              ) : 'Copier'}
            </button>
          </div>
        </div>

        {/* Script SMS */}
        <div>
          <p className="text-xs font-bold text-[#9ca3af] uppercase tracking-wide mb-2">Script SMS</p>
          <div className="relative">
            <textarea
              readOnly
              value={cas.sms}
              rows={6}
              className="w-full bg-blue-50/50 border border-blue-100 rounded-xl p-3 text-sm text-[#374151] leading-relaxed resize-none focus:outline-none"
            />
            <button
              onClick={() => onCopy(`sms-${cas.id}`, cas.sms)}
              className={`absolute top-2 right-2 text-xs font-bold px-2.5 py-1 rounded-lg border transition-all ${
                copiedId === `sms-${cas.id}`
                  ? 'bg-[#10b981] text-white border-[#10b981]'
                  : 'bg-white text-[#00bbb1] border-[#e5e7eb] hover:border-[#00bbb1]'
              }`}
            >
              {copiedId === `sms-${cas.id}` ? 'Copié !' : 'Copier le script'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CentreVente() {
  const [view,     setView]     = useState('home')
  const [renTab,   setRenTab]   = useState('decouverte')
  const [evalTab,  setEvalTab]  = useState('clinique')
  const [bilanTab, setBilanTab] = useState('ligne')
  const [setter,   setSetter]   = useState(null)
  const [copiedId, setCopiedId] = useState(null)

  function goBack() {
    setView('home')
    setSetter(null)
  }

  function handleCopy(id, text) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    })
  }

  const meta = view !== 'home' ? SECTION_META[view] : null

  return (
    <Layout>
      {/* Header */}
      <div className="mb-6">
        {view !== 'home' && (
          <button
            onClick={goBack}
            className="flex items-center gap-1.5 text-xs font-semibold text-[#6b7280] hover:text-[#1a1a1a] transition-colors mb-3"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Retour
          </button>
        )}
        <h1 className="text-2xl font-bold text-[#1a1a1a]">
          {meta ? meta.title : 'Centre de Vente'}
        </h1>
        <p className="text-sm text-[#9ca3af] mt-0.5">
          {meta ? meta.sub : 'Sélectionnez une option pour gérer les rencontres et dossiers'}
        </p>
      </div>

      {/* ── Accueil ── */}
      {view === 'home' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {HOME_CARDS.map(card => (
            <button
              key={card.id}
              onClick={() => setView(card.id)}
              className="bg-white rounded-2xl border border-[#e5e7eb] p-6 flex flex-col items-center text-center hover:-translate-y-1 hover:shadow-md transition-all duration-200 cursor-pointer"
            >
              <img
                src={card.img}
                alt={card.label}
                className="w-28 h-28 rounded-xl object-cover mb-4"
              />
              <h3 className="text-lg font-bold text-[#1a1a1a]">{card.label}</h3>
              <p className="text-xs font-semibold text-[#9ca3af] uppercase tracking-wide mt-1">{card.sub}</p>
            </button>
          ))}
        </div>
      )}

      {/* ── Rencontres ── */}
      {view === 'rencontres' && (
        <div className="bg-white rounded-2xl border border-[#e5e7eb] p-6">
          <TabBar
            tabs={[
              { key: 'decouverte', label: 'Rencontre Découverte' },
              { key: 'suivi',      label: 'Suivi des rencontres' },
            ]}
            active={renTab}
            onChange={tab => { setRenTab(tab); setSetter(null) }}
          />

          {renTab === 'decouverte' && (
            setter ? (
              <div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-5 bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
                  <div className="flex items-start gap-3">
                    <span className="text-amber-500 text-lg mt-0.5">⚠️</span>
                    <div>
                      <p className="text-sm font-bold text-amber-800">
                        N'oublie pas de choisir avec qui tu veux mettre la rencontre dans le calendrier !
                      </p>
                      <p className="text-xs text-amber-600 mt-0.5">
                        Booking source enregistré : <span className="font-bold">{setter.key}</span>
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSetter(null)}
                    className="flex-shrink-0 text-xs font-bold text-[#6b7280] hover:text-[#1a1a1a] bg-white border border-[#e5e7eb] px-3 py-2 rounded-lg transition-colors"
                  >
                    ← Changer de prénom
                  </button>
                </div>
                <BookingIframe src={`${BASE_BOOKING_URL}?booking_source=${setter.key}`} />
              </div>
            ) : (
              <SetterSelector onSelect={setSetter} />
            )
          )}

          {renTab === 'suivi' && (
            <BookingIframe src="https://api.leadconnectorhq.com/widget/booking/BQK4NoyrVNuJA3e1VHDH" />
          )}
        </div>
      )}

      {/* ── Évaluations ── */}
      {view === 'evaluations' && (
        <div className="bg-white rounded-2xl border border-[#e5e7eb] p-6">
          <TabBar
            tabs={[
              { key: 'clinique',  label: 'Évaluation en clinique' },
              { key: 'ligne',     label: 'Évaluation en ligne' },
              { key: 'ouverture', label: 'Ouverture de dossier' },
            ]}
            active={evalTab}
            onChange={setEvalTab}
          />
          <BookingIframe src={EVAL_IFRAMES[evalTab]} />
        </div>
      )}

      {/* ── Bilans ── */}
      {view === 'bilans' && (
        <div className="bg-white rounded-2xl border border-[#e5e7eb] p-6">
          <TabBar
            tabs={[
              { key: 'ligne',    label: 'Bilan en ligne' },
              { key: 'clinique', label: 'Bilan en clinique' },
            ]}
            active={bilanTab}
            onChange={setBilanTab}
          />
          <BookingIframe src={BILAN_IFRAMES[bilanTab]} />
        </div>
      )}

      {/* ── Nurturing ── */}
      {view === 'nurturing' && (
        <div>
          <div className="mb-6 text-center">
            <span className="inline-block px-3 py-1 mb-3 text-xs font-bold tracking-widest text-[#6b7280] uppercase bg-gray-100 rounded-full">
              Usage Interne Uniquement
            </span>
            <p className="text-[#6b7280] max-w-xl mx-auto text-sm">
              Sélectionnez le cas client adapté à votre prospect, copiez le script et envoyez.
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {NURTURING_CASES.map(cas => (
              <NurturingCard
                key={cas.id}
                cas={cas}
                copiedId={copiedId}
                onCopy={handleCopy}
              />
            ))}
          </div>
        </div>
      )}
    </Layout>
  )
}
