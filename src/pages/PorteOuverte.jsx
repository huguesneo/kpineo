import { useMemo } from 'react'
import Layout from '../components/layout/Layout'
import EvaluationReservation from '../components/v2/closer/EvaluationReservation'
import { useAuth } from '../context/AuthContext'
import { PORTE_OUVERTE, membrePorteOuverte } from '../lib/v2/salesConfig'

// « Prendre rendez-vous : porte ouverte » : Évaluation – Suite pour les gens qui ont
// commencé leur évaluation à la journée portes ouvertes. Réservé à Jessica, Tamara,
// Brice et Thibault (route PorteOuverteRoute) ; leur nom est choisi d'office.
export default function PorteOuverte() {
  const { user } = useAuth()
  const moi = membrePorteOuverte(user?.email)
  const parametres = useMemo(() => ({
    types: PORTE_OUVERTE.types,
    membres: PORTE_OUVERTE.membres,
    forfaits: PORTE_OUVERTE.forfaits,
    nbPaiements: ['1', '3', '5'],
    membreParDefaut: moi?.userId ?? '',
    // Elles encaissent le programme au terminal, même sans être closeuses
    terminalAutorise: true,
  }), [moi?.userId])

  return (
    <Layout>
      <div className="mb-6">
        <p className="text-[10px] font-bold text-[#00bbb1] uppercase tracking-widest">Journée portes ouvertes</p>
        <h1 className="text-2xl font-black text-[#1a1a1a]">Prendre rendez-vous : porte ouverte</h1>
        <p className="text-sm text-[#6b7280] mt-1">Évaluation – Suite : choisis le format, la date et l’heure, puis le forfait et les paiements.</p>
      </div>
      <div className="bg-white border border-[#e5e7eb] rounded-2xl overflow-hidden">
        <EvaluationReservation
          key={moi?.userId ?? 'aucun'}
          rechercheClient
          parametres={parametres}
          libelleTermine="Nouvelle réservation"
          onTermine={() => window.location.reload()}
        />
      </div>
    </Layout>
  )
}
