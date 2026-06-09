import { useState, useRef } from 'react'
import Modal from '../../shared/Modal'
import Button from '../../shared/Button'
import { parseQuickBooksPnL } from '../../../lib/quickbooksImport'
import {
  FIXED_KEYS, FIXED_LABELS, VARIABLE_KEYS, VARIABLE_LABELS, formatCAD,
} from '../../../lib/performanceCalc'

const MONTHS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

function Line({ label, value }) {
  return (
    <div className="flex justify-between py-1 text-sm border-b border-[#f1f5f9] last:border-0">
      <span className="text-[#6b7280]">{label}</span>
      <span className="font-semibold text-[#1a1a1a]">{formatCAD(value)}</span>
    </div>
  )
}

export default function ImportCSVModal({ isOpen, onClose, onImport }) {
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [fileName, setFileName] = useState('')
  const inputRef = useRef(null)

  function reset() {
    setResult(null); setError(null); setFileName('')
    if (inputRef.current) inputRef.current.value = ''
  }

  function handleClose() {
    reset()
    onClose()
  }

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setError(null)
    setResult(null)
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = parseQuickBooksPnL(String(reader.result))
        if (!parsed.ok) { setError(parsed.error); return }
        setResult(parsed)
      } catch (err) {
        setError('Erreur de lecture du fichier : ' + err.message)
      }
    }
    reader.onerror = () => setError('Impossible de lire le fichier.')
    reader.readAsText(file, 'utf-8')
  }

  function handleConfirm() {
    if (result) onImport(result.metrics)
    reset()
  }

  const m = result?.metrics
  const rec = result?.reconciliation

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Importer un CSV QuickBooks" size="lg">
      <div className="space-y-4">
        <p className="text-sm text-[#6b7280]">
          Sélectionne ton export « État des résultats par mois » (.csv). Les revenus, coûts variables
          et coûts fixes du mois seront détectés automatiquement. Le <span className="font-semibold">revenu par naturopathe</span> n'est
          pas dans ce rapport — tu le saisis (ou il est conservé s'il existe déjà).
        </p>

        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleFile}
          className="block w-full text-sm text-[#6b7280] file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-[#00bbb1] file:text-white hover:file:bg-[#009e95] file:cursor-pointer"
        />

        {error && (
          <div className="rounded-lg bg-red-50 text-red-700 p-3 text-sm font-semibold">{error}</div>
        )}

        {m && (
          <>
            <div className="rounded-lg bg-[#00bbb1]/5 border border-[#00bbb1]/20 px-4 py-3">
              <p className="text-sm font-bold text-[#1a1a1a]">
                Mois détecté : {MONTHS_FR[m.month - 1]} {m.year}
              </p>
            </div>

            {/* Réconciliation */}
            {rec?.profit_qb != null && (
              <div className={`rounded-lg px-4 py-3 text-sm ${rec.matches ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                <div className="flex justify-between font-semibold">
                  <span>Profit recalculé</span><span>{formatCAD(rec.computed_profit)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Profit QuickBooks</span><span>{formatCAD(rec.profit_qb)}</span>
                </div>
                <p className="mt-1 font-bold">
                  {rec.matches
                    ? '✓ Réconciliation exacte avec QuickBooks'
                    : `⚠ Écart de ${formatCAD(rec.diff)} — vérifie le fichier`}
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
              <div>
                <h4 className="text-xs font-bold text-[#6b7280] uppercase mb-1">Revenus & variables</h4>
                <Line label="Revenu total" value={m.revenue_total} />
                {VARIABLE_KEYS.map(k => <Line key={k} label={VARIABLE_LABELS[k]} value={m[k]} />)}
              </div>
              <div>
                <h4 className="text-xs font-bold text-[#6b7280] uppercase mb-1">Coûts fixes du mois</h4>
                {FIXED_KEYS.map(k => <Line key={k} label={FIXED_LABELS[k]} value={m[k]} />)}
              </div>
            </div>

            <p className="text-xs text-[#9ca3af]">
              Les libellés non reconnus (assurances, fournitures, repas, impôts, change…) sont regroupés
              dans « Dépenses exceptionnelles » pour que le profit corresponde à QuickBooks.
            </p>
          </>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-[#e5e7eb]">
          <Button variant="secondary" onClick={handleClose}>Annuler</Button>
          <Button onClick={handleConfirm} disabled={!m}>Remplir le formulaire</Button>
        </div>
      </div>
    </Modal>
  )
}
