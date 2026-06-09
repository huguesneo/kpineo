import { useState, useRef } from 'react'
import Modal from '../../shared/Modal'
import Button from '../../shared/Button'
import { parseNaturoXlsx } from '../../../lib/naturoXlsxImport'
import { NATUROS, formatCAD } from '../../../lib/performanceCalc'

const MONTHS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

function readAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = () => reject(new Error('Lecture impossible : ' + file.name))
    r.readAsArrayBuffer(file)
  })
}

export default function ImportNaturoModal({ isOpen, onClose, onImport }) {
  const [items, setItems] = useState([]) // { fileName, naturoKey, year, month, total, clientCount, error }
  const [busy, setBusy] = useState(false)
  const inputRef = useRef(null)

  function reset() {
    setItems([])
    if (inputRef.current) inputRef.current.value = ''
  }
  function handleClose() { reset(); onClose() }

  async function handleFiles(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setBusy(true)
    const parsed = []
    for (const f of files) {
      try {
        const ab = await readAsArrayBuffer(f)
        const r = await parseNaturoXlsx(ab, f.name)
        if (!r.ok) parsed.push({ fileName: f.name, error: r.error })
        else parsed.push({ fileName: f.name, naturoKey: r.naturoGuess || '', year: r.year, month: r.month, total: r.total, clientCount: r.clientCount })
      } catch (err) {
        parsed.push({ fileName: f.name, error: err.message })
      }
    }
    setItems(parsed)
    setBusy(false)
  }

  function setNaturo(idx, key) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, naturoKey: key } : it))
  }

  const valid = items.filter(it => !it.error && it.naturoKey && it.month && it.year)
  const months = [...new Set(valid.map(it => `${it.year}-${it.month}`))]
  const monthMismatch = months.length > 1
  const dupNaturo = new Set(valid.map(it => it.naturoKey)).size !== valid.length
  const canImport = valid.length > 0 && !monthMismatch && !dupNaturo

  function handleConfirm() {
    if (!canImport) return
    const first = valid[0]
    const revenues = {}
    valid.forEach(it => { revenues[it.naturoKey] = it.total })
    onImport({ year: first.year, month: first.month, revenues })
    reset()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Importer les revenus par naturopathe (xlsx)" size="lg">
      <div className="space-y-4">
        <p className="text-sm text-[#6b7280]">
          Dépose les fichiers « Sommaire des suivis par client » de QuickBooks (1 par naturopathe, .xlsx).
          Le total de chaque fichier est calculé automatiquement. Assigne chaque fichier au bon naturopathe ci-dessous.
        </p>

        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          multiple
          onChange={handleFiles}
          className="block w-full text-sm text-[#6b7280] file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-[#00bbb1] file:text-white hover:file:bg-[#009e95] file:cursor-pointer"
        />

        {busy && <p className="text-sm text-[#6b7280]">Lecture des fichiers…</p>}

        {items.length > 0 && (
          <div className="space-y-2">
            {items.map((it, i) => (
              <div key={i} className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${it.error ? 'border-red-200 bg-red-50' : 'border-[#e5e7eb] bg-white'}`}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[#1a1a1a] truncate">{it.fileName}</p>
                  {it.error ? (
                    <p className="text-xs text-red-600">{it.error}</p>
                  ) : (
                    <p className="text-xs text-[#9ca3af]">
                      {it.month ? `${MONTHS_FR[it.month - 1]} ${it.year}` : 'Mois non détecté'} · {it.clientCount} clients
                    </p>
                  )}
                </div>
                {!it.error && (
                  <>
                    <span className="text-sm font-bold text-[#00bbb1] whitespace-nowrap">{formatCAD(it.total)}</span>
                    <select
                      value={it.naturoKey || ''}
                      onChange={e => setNaturo(i, e.target.value)}
                      className="px-2 py-1.5 text-sm border border-[#e5e7eb] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00bbb1]"
                    >
                      <option value="">— Naturo —</option>
                      {NATUROS.map(n => <option key={n.key} value={n.key}>{n.label}</option>)}
                    </select>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {monthMismatch && (
          <div className="rounded-lg bg-amber-50 text-amber-700 p-3 text-sm font-semibold">
            ⚠ Les fichiers ne sont pas tous du même mois. Importe un seul mois à la fois.
          </div>
        )}
        {dupNaturo && (
          <div className="rounded-lg bg-amber-50 text-amber-700 p-3 text-sm font-semibold">
            ⚠ Deux fichiers sont assignés au même naturopathe.
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-[#e5e7eb]">
          <Button variant="secondary" onClick={handleClose}>Annuler</Button>
          <Button onClick={handleConfirm} disabled={!canImport}>
            Remplir les revenus{valid.length ? ` (${valid.length})` : ''}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
