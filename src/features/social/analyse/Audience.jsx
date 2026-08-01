import { useMemo } from 'react'
import Card from '../../../components/shared/Card'
import { ColumnBars, BarRow } from './charts'
import { median } from '../../../hooks/useSocialAnalytics'
import { fmtInt, fmtPct, fmtDate, countryName, GENDER_LABELS } from '../../../lib/socialFormat'

// ============================================================================
// Audience
//
// La démographie est disponible au niveau du compte Instagram uniquement :
// Meta a retiré les données démographiques des Pages Facebook, et TikTok ne
// les expose pas via Metricool. Rien n'existe par publication, chez personne.
//
// Le design proposait une heatmap « quand ton monde est en ligne ». Cette
// métrique a été retirée par Meta. On la remplace par ce que tes propres
// publications démontrent : à quel moment tes publications performent.
// ============================================================================

const AGE_ORDER = ['13-17', '18-24', '25-34', '35-44', '45-54', '55-64', '65+']
const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
const SLOTS = [
  { label: 'Nuit (0 h – 6 h)', from: 0, to: 6 },
  { label: 'Matin (6 h – 11 h)', from: 6, to: 11 },
  { label: 'Midi (11 h – 14 h)', from: 11, to: 14 },
  { label: 'Après-midi (14 h – 18 h)', from: 14, to: 18 },
  { label: 'Soir (18 h – 24 h)', from: 18, to: 24 },
]

// Sous ce nombre de publications, un créneau ne dit rien : on l'affiche en gris
// avec son effectif plutôt que de le classer.
const MIN_N_SLOT = 3

function groupByMoment(rows, bucketOf, labels) {
  const groups = labels.map(label => ({ label, values: [] }))
  for (const r of rows) {
    if (r.views == null || !r.publishedAt) continue
    const idx = bucketOf(new Date(r.publishedAt))
    if (idx == null || idx < 0 || idx >= groups.length) continue
    groups[idx].values.push(r.views)
  }
  return groups.map(g => ({
    label: g.label,
    n: g.values.length,
    median: g.values.length >= MIN_N_SLOT ? median(g.values) : null,
  }))
}

function MomentTable({ title, subtitle, groups }) {
  const max = Math.max(...groups.map(g => g.median ?? 0), 1)
  return (
    <Card className="p-5">
      <h3 className="text-base font-bold text-[#1a1a1a]">{title}</h3>
      <p className="text-xs text-[#6b7280] mt-0.5 mb-4">{subtitle}</p>
      <div className="flex flex-col gap-2.5">
        {groups.map(g => (
          g.median == null ? (
            <div key={g.label} className="flex items-center gap-3 text-[13px]">
              <span className="text-[#9ca3af] shrink-0 truncate" style={{ width: 170 }}>{g.label}</span>
              <span className="flex-1 text-xs text-[#c0c0c8] italic">
                {g.n === 0 ? 'aucune publication' : `${g.n} publication${g.n > 1 ? 's' : ''}, trop peu pour conclure`}
              </span>
            </div>
          ) : (
            <BarRow
              key={g.label} label={g.label} value={g.median} max={max}
              display={fmtInt(g.median)} labelWidth={170}
            />
          )
        ))}
      </div>
      <p className="text-[11px] text-[#9ca3af] mt-4">
        Médiane des vues, pas moyenne : une publication virale ne doit pas faire croire
        qu'un créneau est bon.
      </p>
    </Card>
  )
}

export default function Audience({ rows, audience }) {
  const byGender = useMemo(() => {
    const totals = {}
    for (const a of audience.ageGender) totals[a.gender] = (totals[a.gender] ?? 0) + a.value
    const all = Object.values(totals).reduce((x, y) => x + y, 0)
    if (!all) return null
    return { totals, all, share: g => ((totals[g] ?? 0) / all) * 100 }
  }, [audience])

  const byAge = useMemo(() => {
    const totals = new Map()
    for (const a of audience.ageGender) totals.set(a.age, (totals.get(a.age) ?? 0) + a.value)
    const all = [...totals.values()].reduce((x, y) => x + y, 0)
    if (!all) return []
    return AGE_ORDER.filter(age => totals.has(age)).map(age => ({
      label: age,
      value: totals.get(age),
      display: fmtPct((totals.get(age) / all) * 100, 0),
    }))
  }, [audience])

  const ageGenderGrid = useMemo(() => {
    const map = new Map()
    for (const a of audience.ageGender) {
      const g = map.get(a.age) ?? { age: a.age, F: 0, M: 0, U: 0, total: 0 }
      g[a.gender] = a.value
      g.total += a.value
      map.set(a.age, g)
    }
    return AGE_ORDER.filter(age => map.has(age)).map(age => map.get(age))
  }, [audience])

  const countries = useMemo(() => {
    const total = audience.countries.reduce((a, c) => a + c.value, 0)
    return audience.countries.slice(0, 8).map(c => ({
      ...c, share: total ? (c.value / total) * 100 : 0,
    }))
  }, [audience])

  const byDay = useMemo(
    () => groupByMoment(rows, d => (d.getDay() + 6) % 7, DAYS),
    [rows],
  )
  const bySlot = useMemo(
    () => groupByMoment(rows, d => SLOTS.findIndex(s => d.getHours() >= s.from && d.getHours() < s.to), SLOTS.map(s => s.label)),
    [rows],
  )

  if (!byGender) {
    return (
      <Card className="p-8 text-center text-sm text-[#9ca3af]">
        Aucun relevé démographique. La synchronisation Metricool alimente cette vue.
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <Card className="p-4">
        <p className="text-sm text-[#1a1a1a]">
          Démographie du compte <b>Instagram</b>, relevé du {fmtDate(audience.date)}.
        </p>
        <p className="text-xs text-[#9ca3af] mt-1">
          Meta a retiré les données démographiques des Pages Facebook et TikTok ne les expose pas.
          Aucune plateforme ne fournit la démographie publication par publication.
        </p>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.3fr] gap-5">
        <Card className="p-5">
          <h3 className="text-base font-bold text-[#1a1a1a] mb-4">Sexe</h3>
          <div className="flex h-4 rounded-full overflow-hidden mb-3">
            <div style={{ width: `${byGender.share('F')}%`, background: '#00bbb1' }} />
            <div style={{ width: `${byGender.share('M')}%`, background: '#cfd2d8' }} />
            <div style={{ width: `${byGender.share('U')}%`, background: '#eceef1' }} />
          </div>
          <div className="flex flex-col gap-2 mt-4">
            {['F', 'M', 'U'].map(g => (
              <div key={g} className="flex items-center justify-between text-[13px]">
                <span className="text-[#6b7280]">{GENDER_LABELS[g]}</span>
                <span className="font-semibold text-[#1a1a1a] tabular-nums">
                  {fmtPct(byGender.share(g), 1)} · {fmtInt(byGender.totals[g] ?? 0)}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-5 pt-4 border-t border-[#f0f0f2]">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#9ca3af] mb-2">
              Répartition croisée
            </div>
            <div className="flex flex-col gap-1.5">
              {ageGenderGrid.map(g => (
                <div key={g.age} className="flex items-center gap-2 text-[12px]">
                  <span className="w-12 shrink-0 text-[#6b7280]">{g.age}</span>
                  <div className="flex-1 flex h-2.5 rounded-full overflow-hidden bg-[#f3f4f6]">
                    <div style={{ width: `${(g.F / g.total) * 100}%`, background: '#00bbb1' }} />
                    <div style={{ width: `${(g.M / g.total) * 100}%`, background: '#cfd2d8' }} />
                  </div>
                  <span className="w-12 text-right text-[#9ca3af] tabular-nums">
                    {Math.round((g.F / g.total) * 100)} %
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="text-base font-bold text-[#1a1a1a]">Âge</h3>
          <p className="text-xs text-[#6b7280] mt-0.5 mb-6">Part des abonnés</p>
          <ColumnBars items={byAge} height={190} />
        </Card>
      </div>

      <Card className="p-5">
        <h3 className="text-base font-bold text-[#1a1a1a]">Pays</h3>
        <p className="text-xs text-[#6b7280] mt-0.5 mb-4">
          Metricool ne descend pas sous le niveau du pays : pas de découpage par ville.
        </p>
        <div className="flex flex-col gap-2.5">
          {countries.map(c => (
            <BarRow
              key={c.code} label={countryName(c.code)} value={c.share}
              max={countries[0]?.share ?? 1} display={fmtPct(c.share, 1)} labelWidth={150}
            />
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <MomentTable
          title="Quel jour publier"
          subtitle="Vues médianes de tes publications, par jour de la semaine"
          groups={byDay}
        />
        <MomentTable
          title="Quelle heure publier"
          subtitle="Vues médianes de tes publications, par créneau horaire"
          groups={bySlot}
        />
      </div>
    </div>
  )
}
