import { useEffect, useState } from 'react'
import { Navigate, useSearchParams, Link } from 'react-router-dom'
import LayoutV2 from '../../components/v2/LayoutV2'
import { useAuth } from '../../context/AuthContext'
import { useScoreboard } from '../../hooks/v2/useScoreboard'
import { fmtCAD, fmtHeure } from '../../lib/v2/format'

const ROLES_AUTORISES = ['admin', 'resp_vente', 'closer', 'setter']

export function peutVoirScoreboard(profile) {
  const roles = [profile?.role, ...(profile?.secondary_roles ?? [])]
  return roles.some(r => ROLES_AUTORISES.includes(r))
}

function nomMois(today) {
  const s = new Intl.DateTimeFormat('fr-CA', { month: 'long', year: 'numeric' }).format(new Date(today + 'T12:00:00'))
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Thèmes : clair dans l'app, sombre et gros caractères en mode télé
const THEMES = {
  clair: {
    page: 'text-[#1a1a1a]', carte: 'bg-[#fcfcfd] border border-[#e5e7eb] shadow-sm', muet: 'text-[#6b7280]',
    piste: 'bg-[#f3f4f6]', repere: 'bg-[#1a1a1a]', rangTete: '#1a1a1a', rang: '#9ca3af',
    t: { sur: 'text-sm', titre: 'text-2xl', chiffre: 'text-4xl', chiffreSub: 'text-lg', pct: 'text-3xl', h2: 'text-[15px]', ligne: 'text-sm', valeur: 'text-lg', rangTxt: 'text-base', barre: 'h-2.5', piste2: 'h-4', banniere: 'text-base', banniereSub: 'text-sm', note: 'text-xs' },
    gap: 'gap-6', pad: 'p-5',
  },
  tv: {
    page: 'text-[#f5f5f7]', carte: 'bg-[#171a1d] border border-[#262a2f]', muet: 'text-[#9ca3af]',
    piste: 'bg-[#262a2f]', repere: 'bg-[#f5f5f7]', rangTete: '#f5f5f7', rang: '#6b7280',
    t: { sur: 'text-2xl', titre: 'text-[56px]', chiffre: 'text-[88px]', chiffreSub: 'text-[40px]', pct: 'text-[64px]', h2: 'text-[32px]', ligne: 'text-[30px]', valeur: 'text-[36px]', rangTxt: 'text-[32px]', barre: 'h-6', piste2: 'h-10', banniere: 'text-[34px]', banniereSub: 'text-[26px]', note: 'text-2xl' },
    gap: 'gap-10', pad: 'px-9 py-8',
  },
}

function Classement({ titre, total, unite, lignes, couleur, th, vide }) {
  return (
    <section className={`${th.carte} rounded-[20px] ${th.pad} flex flex-col gap-5 min-w-0`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className={`${th.t.h2} font-extrabold`}>{titre}</h2>
        <span className={`${th.t.note} ${th.muet}`}>{total} {unite}</span>
      </div>
      {lignes.length === 0 && <p className={`${th.t.ligne} ${th.muet}`}>{vide}</p>}
      {lignes.map((p, i) => (
        <div key={p.nom} className="grid grid-cols-[2.5rem_minmax(0,9rem)_minmax(0,1fr)_3.5rem] sm:grid-cols-[3rem_minmax(0,12rem)_minmax(0,1fr)_5rem] items-center gap-3 sm:gap-5">
          <span className={`${th.t.rangTxt} font-black`} style={{ color: i === 0 ? th.rangTete : th.rang }}>{p.rang}</span>
          <span className={`${th.t.ligne} font-bold truncate`}>{p.nom}</span>
          <div className={`${th.t.barre} ${th.piste} rounded-full`}>
            <div className={`${th.t.barre} rounded-full`} style={{ width: `${p.largeur}%`, background: couleur, opacity: i === 0 ? 1 : 0.7 }} />
          </div>
          <span className={`${th.t.valeur} font-black text-right`}>{p.valeur}</span>
        </div>
      ))}
    </section>
  )
}

function Contenu({ data, banniere, th, tv }) {
  const r = data.rythme
  const totalVentes = data.ventes.reduce((s, x) => s + x.valeur, 0)
  const totalShowups = data.showups.reduce((s, x) => s + x.valeur, 0)
  return (
    <div className={`flex flex-col ${th.gap} ${th.page}`}>
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <p className={`${th.t.sur} font-semibold ${th.muet}`}>NEO Performance, équipe de vente</p>
          <h1 className={`${th.t.titre} font-black tracking-tight mt-1`}>{nomMois(data.today)}</h1>
        </div>
        <div className="sm:text-right">
          <p className={`${tv ? 'text-[32px]' : 'text-base'} font-extrabold`}>Jour {data.jour} sur {data.joursDansMois}</p>
          <p className={`${th.t.note} ${th.muet} mt-1`}>Mis à jour à {fmtHeure(data.majA.toISOString())}</p>
        </div>
      </header>

      <section className={`${th.carte} rounded-[20px] ${tv ? 'px-10 py-9' : 'p-5 sm:p-6'} flex flex-col gap-6`}>
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <p className={`${th.t.note} font-bold ${th.muet} uppercase tracking-wide`}>Cash collected d'équipe</p>
            <p className={`${th.t.chiffre} font-black leading-none tracking-tight mt-2`}>
              {fmtCAD(data.cash)}
              <span className={`${th.t.chiffreSub} font-semibold ${th.muet}`}> / {data.objectifEquipe ? fmtCAD(data.objectifEquipe) : 'Objectif à définir'}</span>
            </p>
          </div>
          {r && (
            <div className="sm:text-right">
              <p className={`${th.t.pct} font-black text-[#00bbb1] leading-none`}>{r.pctAtteint} %</p>
              <p className={`${tv ? 'text-[26px]' : 'text-sm'} ${tv ? 'text-[#d1d5db]' : th.muet} mt-2`}>
                Il reste {fmtCAD(r.reste)} en {r.joursRestants} jour{r.joursRestants > 1 ? 's' : ''}
              </p>
            </div>
          )}
        </div>
        {r ? (
          <>
            <div className={`relative ${th.t.piste2} ${th.piste} rounded-full`}>
              <div className="absolute left-0 top-0 bottom-0 bg-[#00bbb1] rounded-full" style={{ width: `${Math.min(100, r.pctAtteint)}%` }} />
              <div className={`absolute -top-2.5 -bottom-2.5 w-1 rounded ${th.repere}`} style={{ left: `${r.pctRythme}%` }} title="Rythme attendu" />
            </div>
            <p className={`${th.t.note} ${th.muet}`}>
              Repère : rythme attendu au jour {data.jour} ({fmtCAD(r.attendu)}).{' '}
              {r.ecart >= 0 ? `On a ${fmtCAD(r.ecart)} d'avance.` : `On est à ${fmtCAD(-r.ecart)} du rythme.`}
            </p>
          </>
        ) : (
          <p className={`${th.t.note} ${th.muet}`}>Aucun objectif d'équipe (team_cash_target) pour ce mois.</p>
        )}
      </section>

      {banniere && (
        <div className={`bg-[#00bbb1] text-[#062a28] rounded-2xl ${tv ? 'px-8 py-6' : 'px-5 py-4'} flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1`}>
          <p className={`${th.t.banniere} font-extrabold`}>{banniere.texte}</p>
          <p className={`${th.t.banniereSub} font-bold`}>{banniere.detail}</p>
        </div>
      )}

      <div className={`grid grid-cols-1 lg:grid-cols-2 ${th.gap}`}>
        <Classement titre="Ventes par closeur" total={totalVentes} unite={totalVentes > 1 ? 'ventes' : 'vente'}
          lignes={data.ventes} couleur="#00bbb1" th={th} vide="Aucune vente ce mois-ci." />
        <Classement titre="Show-ups par setter" total={totalShowups} unite="show-ups"
          lignes={data.showups} couleur="#818cf8" th={th} vide="Aucun show-up ce mois-ci." />
      </div>
    </div>
  )
}

// Scoreboard d'équipe (maquette 04). ?tv=1 : sans menu, sombre, gros caractères,
// bannières des membres en rotation toutes les 15 s, rafraîchi toutes les 5 min.
export default function Scoreboard() {
  const { profile } = useAuth()
  const [params] = useSearchParams()
  const tv = params.get('tv') === '1'
  const { data, loading, error, maBanniere, refetch } = useScoreboard(profile)

  const [iBanniere, setIBanniere] = useState(0)
  useEffect(() => {
    if (!tv) return undefined
    const iv = setInterval(() => setIBanniere(i => i + 1), 15_000)
    return () => clearInterval(iv)
  }, [tv])

  if (profile && !peutVoirScoreboard(profile)) return <Navigate to="/dashboard" replace />

  const bannieresTv = data?.bannieres ?? []
  const banniere = tv ? (bannieresTv.length ? bannieresTv[iBanniere % bannieresTv.length] : null) : maBanniere

  const corps = loading && !data ? (
    <p className={tv ? 'text-2xl text-[#9ca3af]' : 'text-sm text-[#6b7280]'}>Chargement…</p>
  ) : error ? (
    <p className="text-sm text-[#b91c1c]">Impossible de charger le scoreboard : {error} <button onClick={refetch} className="underline font-semibold">Réessayer</button></p>
  ) : (
    <Contenu data={data} banniere={banniere} th={tv ? THEMES.tv : THEMES.clair} tv={tv} />
  )

  if (tv) {
    return <div className="min-h-screen bg-[#0e1012] px-6 py-8 sm:px-20 sm:py-16">{corps}</div>
  }
  return (
    <LayoutV2>
      {corps}
      <p className="mt-8 text-xs text-[#9ca3af] text-center">
        <Link to="/scoreboard?tv=1" className="text-[#9ca3af] hover:text-[#6b7280] underline underline-offset-2">Mode télé</Link>
      </p>
    </LayoutV2>
  )
}
