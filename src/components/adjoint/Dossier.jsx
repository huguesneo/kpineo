import { useEffect, useState } from 'react'
import {
  CANAUX, DECISIONS, ACTIONS_MAKE, destinataires, estEscalade, formatArgent, formatDateHeure, htmlVersTexte, sujetReponse,
  courrielDuDossier, NON_RENSEIGNE,
} from '../../../supabase/functions/_shared/adjoint.js'
import { appelAdjoint } from '../../lib/adjoint/api'
import { Bouton, Icone, Pastille } from './ui'
import FilGmail from './FilGmail'

const TON_DECISION = { succes: 'succes', danger: 'danger', info: 'info', neutre: 'neutre' }

function etapesAction(d, action, envoi) {
  const p = d.payload
  if (envoi === 'repondre') {
    return ['Ta réponse part de info@neoperformance.ca', 'Le courriel reçu est classé et sort de la boîte de réception', 'Le dossier passe à « Envoyé modifié »']
  }
  if (!action) {
    return ['Aucune action automatique pour ce dossier', 'Écris une réponse, ou marque-le comme déjà traité si tu l’as fait à la main']
  }
  if (action.actionId === ACTIONS_MAKE.creer_recu_commande) {
    return [
      'Make cherche le client dans QuickBooks (courriel, puis nom) et le crée au besoin',
      'Le reçu de vente est créé avec les lignes ci-dessous',
      'Le courriel de la commande est classé dans Gmail',
      'Une alerte suit si le total QuickBooks diffère de WooCommerce de plus de 0,10 $',
    ]
  }
  if (action.actionId === ACTIONS_MAKE.valider_creneaux) {
    return ['Le dossier passe en attente d’envoi', 'Make poste la réponse validée dans Slack avec son bouton d’envoi']
  }
  const a = destinataires(p.to).join(', ') || courrielDuDossier(d) || NON_RENSEIGNE
  const cc = destinataires(p.cc)
  const etapes = [
    `Le courriel part de info@neoperformance.ca à ${a}${cc.length ? ` (copie : ${cc.join(', ')})` : ''}`,
    'Le courriel reçu est classé et sort de la boîte de réception',
  ]
  if (estEscalade(d)) etapes.push('Le dossier reste à décider : rien n’est annulé ni remboursé')
  return etapes
}

function ApercuRecu({ p }) {
  const lignes = Array.isArray(p.Line) ? p.Line : []
  const sousTotal = lignes.reduce((s, l) => s + (Number(l.Amount) || 0), 0)
  return (
    <div className="bg-white border border-[#e6e8ec] rounded-[10px] overflow-hidden">
      <div className="px-3.5 py-2.5 border-b border-[#eef0f3] flex flex-wrap justify-between gap-2 text-xs text-[#5b616e]">
        <span className="font-bold text-[#16181d]">Reçu de vente #{p.commande ?? p.numero_commande ?? NON_RENSEIGNE}</span>
        <span>Client QuickBooks : {p.client_nom || [p.client_prenom, p.client_famille].filter(Boolean).join(' ') || NON_RENSEIGNE}{p.client_courriel ? ` · ${p.client_courriel}` : ''}</span>
      </div>
      {lignes.length === 0 && <p className="m-0 px-3.5 py-3 text-[13px] text-[#5b616e]">Lignes : {NON_RENSEIGNE}</p>}
      {lignes.map((l, i) => (
        <div key={i} className="flex gap-3 px-3.5 py-2 text-[13px] border-b border-[#f4f5f7]">
          <span className="flex-1 min-w-0">{l.Description || l.ItemRef || 'Produit'}</span>
          <span className="w-10 text-right text-[#5b616e]">× {l.Qty ?? 1}</span>
          <span className="w-24 text-right font-semibold">{formatArgent(l.Amount)}</span>
        </div>
      ))}
      <div className="px-3.5 py-2.5 flex flex-col gap-1 text-[13px] text-[#5b616e] items-end">
        <span>Sous-total {formatArgent(sousTotal)}</span>
        {Number(p.rabais_montant) > 0 && <span>Rabais {formatArgent(-Number(p.rabais_montant))}{p.coupon ? ` (${p.coupon})` : ''}</span>}
        {Number(p.frais_livraison) > 0 && <span>Livraison {formatArgent(p.frais_livraison)}</span>}
        <span>TPS {formatArgent(p.tps)} · TVQ {formatArgent(p.tvq)}</span>
        <span className="text-[15px] font-extrabold text-[#16181d]">Total WooCommerce {formatArgent(p.total_woocommerce)}</span>
        {p.paiement_type && <span>Paiement : {p.paiement_type}</span>}
      </div>
    </div>
  )
}

function ApercuAgenda({ p }) {
  const options = Array.isArray(p.options_proposees) ? p.options_proposees : []
  return (
    <div className="flex flex-wrap gap-2.5">
      <div className="flex-[1_1_200px] bg-white border border-[#e6e8ec] rounded-[10px] px-3.5 py-3">
        <p className="m-0 text-xs text-[#5b616e]">Rendez-vous actuel{p.conseiller ? ` avec ${p.conseiller}` : ''}</p>
        <p className={`m-0 mt-1 text-sm font-bold text-[#5b616e] ${options.length || p.nouveau_creneau ? 'line-through' : ''}`}>{p.ancien_creneau ? formatDateHeure(p.ancien_creneau) : NON_RENSEIGNE}</p>
      </div>
      {p.nouveau_creneau && (
        <div className="flex-[1_1_160px] bg-white border border-[#00bbb1] rounded-[10px] px-3.5 py-3">
          <p className="m-0 text-xs text-[#00665f] font-bold">Nouveau créneau</p>
          <p className="m-0 mt-1 text-sm font-bold">{formatDateHeure(p.nouveau_creneau)}</p>
        </div>
      )}
      {options.map(o => (
        <div key={o} className="flex-[1_1_160px] bg-white border border-[#00bbb1] rounded-[10px] px-3.5 py-3">
          <p className="m-0 text-xs text-[#00665f] font-bold">Option proposée</p>
          <p className="m-0 mt-1 text-sm font-bold">{formatDateHeure(o)}</p>
        </div>
      ))}
    </div>
  )
}

// Ce que Make a répondu (accusé) et l'état de l'envoi
// Rejeter / Déjà traité : classement dans Gmail (libellé de la catégorie, sorti de INBOX)
function SuiviGmail({ d, onRecharger }) {
  const g = d.payload?.hub_gmail
  const [essai, setEssai] = useState({ enCours: false, erreur: null })
  useEffect(() => { setEssai({ enCours: false, erreur: null }) }, [d.id])
  if (!g) return null
  if (!g.erreur) return <p className="m-0 text-[13px] text-[#5b616e]">Archivé dans Gmail le {formatDateHeure(g.classe_le)}{g.label ? '' : ', sans libellé de catégorie'}.</p>
  async function reessayer() {
    setEssai({ enCours: true, erreur: null })
    try {
      await appelAdjoint('reclasser', { id: d.id })
      setEssai({ enCours: false, erreur: null })
      onRecharger?.()
    } catch (e) {
      setEssai({ enCours: false, erreur: e.message })
    }
  }
  return (
    <div className="rounded-[10px] border-2 border-[#fda29b] bg-[#fef3f2] px-4 py-3 text-sm text-[#7a271a] flex flex-wrap items-center gap-3">
      <div className="flex-1 min-w-[200px]">
        <strong className="block text-[#b42318]">Non archivé dans Gmail</strong>
        La décision est enregistrée, mais le courriel est encore dans la boîte de réception ({essai.erreur ?? g.erreur}).
      </div>
      <Bouton onClick={reessayer} disabled={essai.enCours}>{essai.enCours ? 'Classement…' : 'Réessayer'}</Bouton>
    </div>
  )
}

function SuiviMake({ p }) {
  const ex = p.hub_execution
  const acks = Array.isArray(p.hub_ack) ? p.hub_ack : []
  if (!ex && !acks.length && !p.hub_make_erreur && !p.hub_slack_erreur) return null
  return (
    <div className="flex flex-col gap-2 text-[13px]">
      {ex && !ex.confirme_le && (
        <div className="rounded-[10px] border border-[#fedf89] bg-[#fffaeb] px-3.5 py-2.5 text-[#93370d]">
          Envoi demandé à Make le {formatDateHeure(ex.demande_le)}. En attente de sa confirmation.
        </div>
      )}
      {acks.map((a, i) => (
        <div key={i} className={`rounded-[10px] border px-3.5 py-2.5 whitespace-pre-line ${/débalancement|erreur|échec/i.test(a.texte) ? 'border-[#fecdca] bg-[#fef3f2] text-[#7a271a]' : 'border-[#cdeeeb] bg-[#f3fbfa] text-[#00665f]'}`}>
          <strong>Make, {formatDateHeure(a.le)} :</strong> {String(a.texte).replace(/[*_]/g, '').replace(/:[a-z_]+:/g, '').trim()}
        </div>
      ))}
      {p.hub_make_erreur && <p className="m-0 text-[#b42318]">Dernier échec Make : {p.hub_make_erreur.erreur}</p>}
      {p.hub_slack_erreur && <p className="m-0 text-[#5b616e]">Message Slack non mis à jour : {p.hub_slack_erreur.erreur}</p>}
    </div>
  )
}

function Message({ texte }) {
  return (
    <div className="bg-[#f7f8fa] rounded-[10px] px-4 py-4 text-sm leading-relaxed text-[#2b2f38] whitespace-pre-line break-words max-h-[360px] overflow-y-auto">
      {texte?.trim() || 'Message reçu : non renseigné'}
    </div>
  )
}

const zoneCls = 'w-full resize-y rounded-[10px] px-4 py-3.5 text-sm leading-relaxed text-[#16181d] border outline-none focus:border-[#00bbb1] focus:ring-[3px] focus:ring-[#00bbb1]/20'

// d : dossier complet (op dossier) ; onDecider({ action, texteModifie?, texte?, raison? }, { toast })
export default function Dossier({ d, fiche, onDecider, occupe, onRecharger }) {
  const p = d.payload ?? {}
  const action = d.action
  const enAttente = d.decision === 'pending'
  const htmlLeo = p.html ? htmlVersTexte(p.html) : ''

  // Courriel proposé par Léo (modifiable) et réponse écrite par Cloé
  const [edition, setEdition] = useState(false)
  const [relu, setRelu] = useState(false) // dossier périmé : édition ouverte au moins une fois
  const [texteLeo, setTexteLeo] = useState(htmlLeo)
  const [ecrire, setEcrire] = useState(false)
  const [texteLibre, setTexteLibre] = useState('')
  const [redigeParLeo, setRedigeParLeo] = useState(false)
  const [avertissements, setAvertissements] = useState([])
  const [consigne, setConsigne] = useState('')
  const [demandeLeo, setDemandeLeo] = useState(false)
  const [redaction, setRedaction] = useState({ enCours: false, erreur: null })
  const [confirmer, setConfirmer] = useState(null) // 'rejeter' | 'deja_traite'
  const [raison, setRaison] = useState('')

  useEffect(() => {
    setEdition(false); setRelu(false); setTexteLeo(htmlLeo); setEcrire(false); setTexteLibre(''); setRedigeParLeo(false)
    setAvertissements([]); setConsigne(''); setDemandeLeo(false); setRedaction({ enCours: false, erreur: null })
    setConfirmer(null); setRaison('')
  }, [d.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const modifie = texteLeo.trim() !== htmlLeo.trim()
  const destinataire = courrielDuDossier(d)
  const sujetRe = sujetReponse(p.gmail_subject || d.resume?.sujet)
  const etapes = etapesAction(d, action, ecrire ? 'repondre' : null)

  async function rediger() {
    if (!consigne.trim()) return
    setRedaction({ enCours: true, erreur: null })
    try {
      const r = await appelAdjoint('rediger', { id: d.id, consigne })
      setTexteLibre(r.texte)
      setRedigeParLeo(true)
      setAvertissements(r.avertissements ?? [])
      setRedaction({ enCours: false, erreur: null })
    } catch (e) {
      setTexteLibre('')
      setRedigeParLeo(false)
      setRedaction({ enCours: false, erreur: e.message })
    }
  }

  function ouvrirEcrire(avecLeo) {
    setEcrire(true)
    setEdition(false)
    setDemandeLeo(avecLeo)
  }

  // Périmé : le brouillon de Léo ne part pas tel quel, le bouton ouvre d'abord l'édition
  const aRelire = enAttente && d.resume?.perime && !!p.html && !!action && !ecrire && !relu

  function ouvrirEdition() {
    setEdition(true)
    setRelu(true)
    setTimeout(() => document.getElementById('reponse-leo')?.focus(), 0)
  }

  function envoyerPrincipal() {
    if (aRelire) return ouvrirEdition()
    if (ecrire) {
      onDecider({ action: 'repondre', texte: texteLibre }, { toast: `Réponse à ${d.resume?.nom ?? destinataire}` })
    } else {
      onDecider({ action: 'executer', ...(modifie ? { texteModifie: texteLeo } : {}) }, { toast: `${action.toast} : ${d.resume?.nom ?? ''}` })
    }
  }

  const peutEcrire = enAttente && !!destinataire
  const libellePrincipal = ecrire ? 'Envoyer ma réponse' : aRelire ? 'Relire et modifier' : action?.libelle
  const principalDesactive = occupe || (ecrire ? !texteLibre.trim() : !action) || !!d.refus

  return (
    <>
      <div className="flex-1 overflow-y-auto px-7 py-6 flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <p className="m-0 text-xs font-semibold text-[#5b616e]">
            {CANAUX[d.channel]?.label ?? d.channel} · reçu {formatDateHeure(d.created_at)}{d.category ? ` · ${d.category}` : ''}
          </p>
          <h2 className="m-0 text-xl font-extrabold break-words">{d.resume?.sujet}</h2>
          <div className="flex flex-wrap gap-1.5">
            {!enAttente && <Pastille ton={TON_DECISION[DECISIONS[d.resume?.decisionAffichee]?.ton]}>{DECISIONS[d.resume?.decisionAffichee]?.label}</Pastille>}
            {!enAttente && d.resume?.decideur?.par && <span className="text-xs text-[#5b616e] self-center">par {d.resume.decideur.par}{d.resume.decideur.le ? `, ${formatDateHeure(d.resume.decideur.le)}` : ''}</span>}
            {enAttente && d.resume?.etiquettes?.map(e => <Pastille key={e.label} ton={e.ton}>{e.label}</Pastille>)}
          </div>
        </div>

        {!enAttente && <SuiviGmail d={d} onRecharger={onRecharger} />}

        {d.aFilGmail ? <FilGmail dossier={d} /> : <Message texte={d.incoming_message} />}

        {enAttente && d.resume?.perime && (
          <div className="rounded-[10px] border border-[#fedf89] bg-[#fffaeb] px-4 py-3 text-sm text-[#7a2e0e]">
            <strong className="block text-[#9a4d00]">Périmé, à relire : en attente depuis {d.resume.attente}</strong>
            La situation a pu changer depuis que Léo a préparé ce dossier.{p.html ? ' Le bouton principal ouvre d’abord le courriel pour que tu le relises.' : ''}
          </div>
        )}

        {d.resume?.blocage && (
          <div className="rounded-[10px] border-2 border-[#fda29b] bg-[#fef3f2] px-4 py-3 text-sm text-[#7a271a]">
            <strong className="block text-[#b42318]">Commande bloquée : le reçu ne peut pas être créé</strong>
            {d.resume.blocage}
          </div>
        )}

        {enAttente && (
          <div className="border border-[#cdeeeb] bg-[#f3fbfa] rounded-xl px-5 py-4 flex flex-col gap-3.5">
            <div className="flex items-center gap-2 text-[13px] font-extrabold text-[#00665f]">
              <Icone nom="leo" taille={16} epaisseur={1.8} />Ce qui va se passer quand tu cliques
            </div>
            <ol className="m-0 pl-5 flex flex-col gap-1.5 text-sm text-[#2b2f38] list-decimal">
              {etapes.map(e => <li key={e}>{e}</li>)}
            </ol>
            {d.channel === 'commande' && <ApercuRecu p={p} />}
            {d.channel === 'agenda' && <ApercuAgenda p={p} />}
            {estEscalade(d) && (
              <div className="bg-[#fef3f2] border border-[#fecdca] rounded-[10px] px-3.5 py-3 text-[13px] leading-normal text-[#7a271a]">
                Escaladé à Hugues{p.raison ? ` : ${String(p.raison).trim().replace(/[.\s]+$/, '')}` : ''}.
                {action ? ' Le bouton envoie seulement l’accusé de réception.' : ''} La décision revient à un humain.
              </div>
            )}
            {fiche?.statut === 'prospect' && d.channel !== 'commande' && (
              <div className="bg-white border border-[#e6e8ec] rounded-[10px] px-3.5 py-3 flex flex-wrap gap-5 text-[13px]">
                <div><p className="m-0 text-xs text-[#5b616e]">Statut</p><p className="m-0 mt-0.5 font-bold">Prospect</p></div>
                <div><p className="m-0 text-xs text-[#5b616e]">Fiche client</p><p className="m-0 mt-0.5 font-bold">Aucune à ce courriel</p></div>
                <div><p className="m-0 text-xs text-[#5b616e]">Source</p><p className="m-0 mt-0.5 font-bold">Courriel info@</p></div>
                <div><p className="m-0 text-xs text-[#5b616e]">Pipeline Setting</p><p className="m-0 mt-0.5 font-bold">À vérifier dans GHL</p></div>
              </div>
            )}
          </div>
        )}
        {!enAttente && d.channel === 'commande' && <ApercuRecu p={p} />}
        {!enAttente && d.channel === 'agenda' && <ApercuAgenda p={p} />}
        {d.channel === 'commande' && d.recu_quickbooks && (
          <p className="m-0 text-sm"><Pastille ton="succes">Reçu créé</Pastille> QuickBooks #{d.recu_quickbooks}{d.total_qbo ? ` · total ${formatArgent(d.total_qbo)}` : ''}</p>
        )}

        {/* Courriel proposé par Léo, ou envoyé */}
        {p.html && !ecrire && (
          <div className="flex flex-col gap-2">
            <label htmlFor="reponse-leo" className="text-[13px] font-bold flex gap-2 items-center">
              {enAttente ? 'Courriel proposé par Léo' : 'Courriel envoyé'}
              {modifie && <span className="font-semibold text-[#5b616e]">· modifié</span>}
            </label>
            <textarea
              id="reponse-leo"
              value={texteLeo}
              onChange={e => setTexteLeo(e.target.value)}
              readOnly={!edition}
              rows={9}
              className={`${zoneCls} ${edition ? 'bg-white border-[#00bbb1]' : 'bg-[#fafbfc] border-[#e6e8ec]'}`}
            />
          </div>
        )}
        {!enAttente && d.final_reply && !p.html && (
          <div className="flex flex-col gap-2">
            <p className="m-0 text-[13px] font-bold">Réponse finale</p>
            <Message texte={d.final_reply} />
          </div>
        )}

        {/* Écrire une réponse / Demander à Léo de rédiger */}
        {ecrire && (
          <div className="flex flex-col gap-2.5 rounded-xl border border-[#e6e8ec] p-4">
            <p className="m-0 text-xs text-[#5b616e]">
              À : <strong className="text-[#16181d]">{destinataire}</strong>
              {destinataires(p.cc).length > 0 && <> · Copie : {destinataires(p.cc).join(', ')}</>}
              {' · '}Sujet : <strong className="text-[#16181d]">{sujetRe}</strong>
            </p>
            {demandeLeo && (
              <div className="flex flex-wrap gap-2 items-start">
                <input
                  type="text"
                  value={consigne}
                  onChange={e => setConsigne(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') rediger() }}
                  placeholder="Consigne pour Léo, ex. : refuse le remboursement, offre une pause du programme"
                  className="flex-[1_1_280px] min-w-0 rounded-[9px] border border-[#d5d9e0] px-3 py-2.5 text-sm outline-none focus:border-[#00bbb1]"
                />
                <Bouton variante="secondaire" onClick={rediger} disabled={redaction.enCours || !consigne.trim()}>
                  {redaction.enCours ? 'Léo rédige...' : 'Rédiger'}
                </Bouton>
              </div>
            )}
            {redaction.erreur && <p className="m-0 text-[13px] text-[#b42318]">{redaction.erreur}</p>}
            <label htmlFor="reponse-cloe" className="text-[13px] font-bold flex gap-2 items-center">
              Ta réponse
              {redigeParLeo && <Pastille ton="alerte">Rédigé par Léo, à relire</Pastille>}
            </label>
            <textarea
              id="reponse-cloe"
              value={texteLibre}
              onChange={e => setTexteLibre(e.target.value)}
              rows={9}
              placeholder={'Bonjour [Prénom] :)\n\n...\n\nMerci à toi et bonne journée!\nCloé'}
              className={`${zoneCls} bg-white border-[#d5d9e0]`}
            />
            {avertissements.length > 0 && (
              <ul className="m-0 pl-5 text-[13px] text-[#93370d] list-disc">
                {avertissements.map(a => <li key={a}>À vérifier : {a}</li>)}
              </ul>
            )}
          </div>
        )}

        {p.raison || p.note_leo || p.motif ? (
          <p className="m-0 text-[13px] text-[#5b616e]"><strong className="text-[#2b2f38]">Pourquoi :</strong> {p.raison || p.note_leo || p.motif}</p>
        ) : null}
        {p.hub_rejet?.raison && <p className="m-0 text-[13px] text-[#5b616e]"><strong className="text-[#2b2f38]">Raison du rejet :</strong> {p.hub_rejet.raison}</p>}
        <SuiviMake p={p} />
        {d.refus && enAttente && <p className="m-0 text-[13px] font-semibold text-[#93370d]">{d.refus}</p>}
      </div>

      {enAttente && (
        <div className="px-7 py-4 border-t border-[#eef0f3] flex flex-col gap-3">
          {confirmer ? (
            <div className="flex flex-wrap gap-2.5 items-center">
              <input
                type="text"
                value={raison}
                onChange={e => setRaison(e.target.value)}
                placeholder={confirmer === 'rejeter' ? 'Raison du rejet (facultatif)' : 'Note (facultatif), ex. : reçu fait dans QuickBooks'}
                className="flex-[1_1_240px] min-w-0 rounded-[9px] border border-[#d5d9e0] px-3 py-2.5 text-sm outline-none focus:border-[#00bbb1]"
              />
              <Bouton
                variante={confirmer === 'rejeter' ? 'danger' : 'principal'}
                disabled={occupe}
                onClick={() => onDecider({ action: confirmer, raison }, { toast: confirmer === 'rejeter' ? 'Dossier rejeté' : 'Marqué comme déjà traité' })}
              >
                {confirmer === 'rejeter' ? 'Confirmer le rejet' : 'Confirmer : déjà traité'}
              </Bouton>
              <Bouton variante="discret" onClick={() => setConfirmer(null)}>Retour</Bouton>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2.5 items-center">
              {(action || ecrire) && <Bouton variante="principal" onClick={envoyerPrincipal} disabled={principalDesactive}>{libellePrincipal}</Bouton>}
              {p.html && !ecrire && action && (
                <Bouton onClick={() => (edition ? setEdition(false) : ouvrirEdition())}>{edition ? 'Terminer' : 'Modifier'}</Bouton>
              )}
              {peutEcrire && !ecrire && <Bouton onClick={() => ouvrirEcrire(false)}>Écrire une réponse</Bouton>}
              {peutEcrire && !(ecrire && demandeLeo) && <Bouton onClick={() => ouvrirEcrire(true)}>Demander à Léo de rédiger</Bouton>}
              {ecrire && <Bouton variante="discret" onClick={() => { setEcrire(false); setDemandeLeo(false) }}>Annuler la réponse</Bouton>}
              <Bouton variante="danger" onClick={() => setConfirmer('rejeter')}>Rejeter</Bouton>
              <Bouton variante="discret" onClick={() => setConfirmer('deja_traite')}>Déjà traité à la main</Bouton>
            </div>
          )}
          <p className="m-0 text-xs text-[#5b616e]">
            {confirmer
              ? `Rien n’est envoyé. ${d.aFilGmail ? 'Le courriel est classé dans Gmail avec le libellé de sa catégorie et sort de la boîte de réception. ' : ''}Le message Slack est mis à jour. Tu as 6 secondes pour annuler.`
              : !ecrire && !action
              ? 'Rejeter et « Déjà traité à la main » ferment le dossier sans rien envoyer. Le message Slack est mis à jour.'
              : !ecrire && action.actionId === ACTIONS_MAKE.creer_recu_commande
                ? 'Exécuté par Make, comme le bouton Slack : client et reçu dans QuickBooks.'
                : 'Exécuté par Make, comme le bouton Slack. Le message Slack est mis à jour.'}
          </p>
        </div>
      )}
    </>
  )
}
