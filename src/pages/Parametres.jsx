import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import Layout from '../components/layout/Layout'
import Header from '../components/layout/Header'
import Card from '../components/shared/Card'
import Badge from '../components/shared/Badge'
import Button from '../components/shared/Button'
import Input from '../components/shared/Input'
import Modal from '../components/shared/Modal'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useKPITypes, createKPIType, deactivateKPIType } from '../hooks/useKPITypes'
import { useQBConnection, connectQuickBooks, disconnectQuickBooks } from '../hooks/useQuickBooks'
import { useGHLConnection, useGHLConfig, syncGHLContacts, syncGHLOpportunities } from '../hooks/useGHL'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

const ROLE_SCOPE_LABELS = {
  all:            'Tous les rôles',
  naturopathe:    'Naturopathe',
  closer:         'Closer',
  setter:         'Setter',
  service_client: 'Service clients & gestion',
  resp_vente:     'Resp. équipe de vente',
  clinic:         'Clinique',
}

const ROLE_SCOPE_VARIANTS = {
  all:            'primary',
  naturopathe:    'naturopathe',
  closer:         'closer',
  setter:         'setter',
  service_client: 'service_client',
  resp_vente:     'resp_vente',
  clinic:         'success',
}

function AddKPITypeModal({ isOpen, onClose, onCreated }) {
  const [form, setForm] = useState({ label: '', role_scope: 'all' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function handleChange(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.label.trim()) { setError('Le nom est obligatoire.'); return }
    setLoading(true)
    setError('')
    const { error: err } = await createKPIType(form)
    setLoading(false)
    if (err) {
      setError(err.message.includes('unique') ? 'Un type avec ce nom existe déjà.' : err.message)
      return
    }
    setForm({ label: '', role_scope: 'all' })
    onCreated?.()
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Ajouter un type de KPI">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Nom du type *"
          name="label"
          value={form.label}
          onChange={handleChange}
          placeholder="Ex: Nouveaux clients"
        />
        <div className="flex flex-col gap-1">
          <label className="text-sm font-semibold text-[#1a1a1a]">S'applique à</label>
          <select
            name="role_scope"
            value={form.role_scope}
            onChange={handleChange}
            className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00bbb1]"
          >
            {Object.entries(ROLE_SCOPE_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Annuler</Button>
          <Button type="submit" loading={loading}>Ajouter</Button>
        </div>
      </form>
    </Modal>
  )
}

function KPITypesSection() {
  const { types, loading, refetch } = useKPITypes()
  const [addOpen, setAddOpen] = useState(false)
  const [confirmId, setConfirmId] = useState(null)

  async function handleDeactivate(id) {
    await deactivateKPIType(id)
    setConfirmId(null)
    refetch()
  }

  const grouped = {
    all:            types.filter(t => t.role_scope === 'all'),
    naturopathe:    types.filter(t => t.role_scope === 'naturopathe'),
    closer:         types.filter(t => t.role_scope === 'closer'),
    setter:         types.filter(t => t.role_scope === 'setter'),
    service_client: types.filter(t => t.role_scope === 'service_client'),
    resp_vente:     types.filter(t => t.role_scope === 'resp_vente'),
    clinic:         types.filter(t => t.role_scope === 'clinic'),
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold text-[#1a1a1a]">Types de KPI</h2>
          <p className="text-sm text-[#6b7280] mt-0.5">Ces types apparaissent dans le formulaire d'ajout de KPI.</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>+ Ajouter un type</Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-5">
          {Object.entries(grouped).filter(([, items]) => items.length > 0).map(([scope, items]) => (
            <div key={scope}>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant={ROLE_SCOPE_VARIANTS[scope]}>{ROLE_SCOPE_LABELS[scope]}</Badge>
              </div>
              <div className="space-y-1.5">
                {items.map(type => (
                  <div key={type.id} className="flex items-center justify-between px-4 py-2.5 bg-gray-50 rounded-lg border border-[#e5e7eb]">
                    <div>
                      <p className="text-sm font-semibold text-[#1a1a1a]">{type.label}</p>
                      <p className="text-xs text-[#6b7280] font-mono">{type.value}</p>
                    </div>
                    {confirmId === type.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[#6b7280]">Confirmer ?</span>
                        <Button size="sm" variant="danger" onClick={() => handleDeactivate(type.id)}>Oui</Button>
                        <Button size="sm" variant="secondary" onClick={() => setConfirmId(null)}>Non</Button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmId(type.id)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors"
                        title="Retirer ce type"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <AddKPITypeModal
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={refetch}
      />
    </Card>
  )
}

function GHLSection() {
  const { config, loading: configLoading, saveLocationId } = useGHLConfig()
  const savedLocationId = config?.location_id ?? null
  const { locations, loading: connLoading, error: connError, refetch: retestConn } = useGHLConnection(savedLocationId, !configLoading)
  const [syncingContacts, setSyncingContacts] = useState(false)
  const [syncProgress, setSyncProgress] = useState(0)
  const [syncingOpps, setSyncingOpps] = useState(false)
  const [syncMsg, setSyncMsg] = useState(null)
  const [manualId, setManualId] = useState('')
  const [savingManual, setSavingManual] = useState(false)

  const isConnected = !connLoading && !connError && locations.length > 0

  async function handleSyncContacts() {
    if (!savedLocationId) return
    setSyncingContacts(true); setSyncProgress(0); setSyncMsg(null)
    const { data, error } = await syncGHLContacts(savedLocationId, (n) => setSyncProgress(n))
    setSyncingContacts(false)
    setSyncMsg(error ? { type: 'error', msg: error } : { type: 'success', msg: `${data.synced} contacts synchronisés` })
  }

  async function handleSyncOpps() {
    if (!savedLocationId) return
    setSyncingOpps(true); setSyncMsg(null)
    const { data, error } = await syncGHLOpportunities(savedLocationId)
    setSyncingOpps(false)
    setSyncMsg(error ? { type: 'error', msg: error } : { type: 'success', msg: `${data.pipelines} pipeline(s), ${data.opportunities} opportunités synchronisées` })
  }

  async function handleSaveManualId() {
    const id = manualId.trim()
    if (!id) return
    setSavingManual(true)
    await saveLocationId(id, id)
    setSavingManual(false)
    setManualId('')
    retestConn()
  }

  return (
    <div className="border border-[#e5e7eb] rounded-xl overflow-hidden">
      {/* Header row */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center flex-shrink-0">
            <span className="text-orange-500 font-black text-xs">GHL</span>
          </div>
          <div>
            <p className="font-semibold text-sm text-[#1a1a1a]">Go High Level</p>
            {connLoading || configLoading ? (
              <p className="text-xs text-[#6b7280]">Vérification…</p>
            ) : isConnected ? (
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <p className="text-xs text-emerald-600 font-semibold">Connecté · {config?.name || savedLocationId}</p>
              </div>
            ) : connError ? (
              <p className="text-xs text-red-500">{connError}</p>
            ) : (
              <p className="text-xs text-[#6b7280]">Non configuré</p>
            )}
          </div>
        </div>
        <Button size="sm" variant="secondary" onClick={retestConn} loading={connLoading}>
          Tester
        </Button>
      </div>

      {/* Sync buttons — only if connected */}
      {isConnected && savedLocationId && (
        <div className="border-t border-[#e5e7eb] px-4 py-3 bg-gray-50 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" onClick={handleSyncContacts} loading={syncingContacts}>
            {syncingContacts ? `Sync… (${syncProgress.toLocaleString()})` : 'Sync Contacts'}
          </Button>
          <Button size="sm" variant="secondary" onClick={handleSyncOpps} loading={syncingOpps}>
            {syncingOpps ? 'Sync…' : 'Sync Pipeline'}
          </Button>
          {config?.last_synced_at && (
            <p className="text-xs text-[#9ca3af] ml-auto">
              Dernière sync : {format(new Date(config.last_synced_at), "d MMM 'à' HH:mm", { locale: fr })}
            </p>
          )}
        </div>
      )}

      {/* Sync result */}
      {syncMsg && (
        <div className={`px-4 py-2 text-xs font-semibold ${syncMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
          {syncMsg.type === 'success' ? '✓ ' : '✗ '}{syncMsg.msg}
        </div>
      )}

      {/* Manual location ID input — if no location saved */}
      {!configLoading && !savedLocationId && (
        <div className="border-t border-[#e5e7eb] px-4 py-3 bg-gray-50">
          <p className="text-xs text-[#6b7280] mb-2">Entrez votre Location ID GHL pour activer la connexion :</p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="ex: YG2spvWJqnD75L3V95UJ"
              value={manualId}
              onChange={e => setManualId(e.target.value)}
              className="flex-1 px-3 py-1.5 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:border-[#00bbb1]"
            />
            <Button size="sm" onClick={handleSaveManualId} loading={savingManual} disabled={!manualId.trim()}>
              Enregistrer
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function IntegrationsSection() {
  const { connected, connectedAt, realmId, refetch } = useQBConnection()
  const location = useLocation()
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const qb = params.get('qb')
    if (qb === 'connected') { setNotice({ type: 'success', msg: 'QuickBooks connecté avec succès !' }); refetch() }
    else if (qb === 'denied') setNotice({ type: 'warn', msg: 'Connexion annulée par l\'utilisateur.' })
    else if (qb === 'error') setNotice({ type: 'error', msg: 'Erreur lors de la connexion. Réessayez.' })
  }, [location.search])

  async function handleConnect() {
    setConnecting(true)
    const { error } = await connectQuickBooks()
    if (error) { setNotice({ type: 'error', msg: error }); setConnecting(false) }
  }

  async function handleDisconnect() {
    if (!confirm('Déconnecter QuickBooks ? Les données en cache seront supprimées.')) return
    setDisconnecting(true)
    await disconnectQuickBooks()
    setDisconnecting(false)
    refetch()
    setNotice({ type: 'success', msg: 'QuickBooks déconnecté.' })
  }

  return (
    <Card className="p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-[#00bbb1]/10 flex items-center justify-center">
          <svg className="w-5 h-5 text-[#00bbb1]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-bold text-[#1a1a1a]">Intégrations</h2>
          <p className="text-xs text-[#6b7280]">Connectez vos outils externes</p>
        </div>
      </div>

      {notice && (
        <div className={`mb-4 px-4 py-3 rounded-xl border text-sm font-semibold ${
          notice.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
          notice.type === 'warn'    ? 'bg-amber-50 border-amber-200 text-amber-700' :
                                      'bg-red-50 border-red-200 text-red-600'
        }`}>
          {notice.msg}
        </div>
      )}

      <div className="space-y-3">
        {/* QuickBooks */}
        <div className="flex items-center justify-between p-4 border border-[#e5e7eb] rounded-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#2ca01c]/10 flex items-center justify-center flex-shrink-0">
              <span className="text-[#2ca01c] font-black text-sm">QB</span>
            </div>
            <div>
              <p className="font-semibold text-sm text-[#1a1a1a]">QuickBooks</p>
              {connected === null && <p className="text-xs text-[#6b7280]">Vérification…</p>}
              {connected === false && <p className="text-xs text-[#6b7280]">Non connecté</p>}
              {connected === true && (
                <div className="flex items-center gap-2">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <p className="text-xs text-emerald-600 font-semibold">Connecté</p>
                  {connectedAt && (
                    <p className="text-xs text-[#9ca3af]">
                      · depuis le {format(new Date(connectedAt), 'd MMM yyyy', { locale: fr })}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {connected === false && (
              <Button size="sm" loading={connecting} onClick={handleConnect}>Connecter</Button>
            )}
            {connected === true && (
              <Button size="sm" variant="danger" loading={disconnecting} onClick={handleDisconnect}>Déconnecter</Button>
            )}
          </div>
        </div>

        {/* Go High Level */}
        <GHLSection />
      </div>

      <p className="text-xs text-[#9ca3af] mt-3">
        Les revenus QuickBooks sont affichés dans le dashboard admin avec une cache d'une heure.
      </p>
    </Card>
  )
}

export default function Parametres() {
  const { profile, user } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [pwForm, setPwForm] = useState({ new: '', confirm: '' })
  const [pwLoading, setPwLoading] = useState(false)
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState('')

  function handlePwChange(e) {
    setPwForm(f => ({ ...f, [e.target.name]: e.target.value }))
  }

  async function handlePwSubmit(e) {
    e.preventDefault()
    if (pwForm.new !== pwForm.confirm) { setPwError('Les mots de passe ne correspondent pas.'); return }
    if (pwForm.new.length < 6) { setPwError('Minimum 6 caractères.'); return }
    setPwLoading(true); setPwError(''); setPwSuccess('')
    const { error } = await supabase.auth.updateUser({ password: pwForm.new })
    setPwLoading(false)
    if (error) setPwError(error.message)
    else { setPwSuccess('Mot de passe mis à jour.'); setPwForm({ new: '', confirm: '' }) }
  }

  return (
    <Layout>
      <Header title="Paramètres" />

      <div className="max-w-2xl space-y-6">
        {/* Compte */}
        <Card className="p-6">
          <h2 className="text-lg font-bold text-[#1a1a1a] mb-4">Informations du compte</h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-semibold text-[#6b7280]">Nom complet</label>
              <p className="text-sm font-semibold text-[#1a1a1a] mt-1">{profile?.full_name}</p>
            </div>
            <div>
              <label className="text-sm font-semibold text-[#6b7280]">Adresse email</label>
              <p className="text-sm font-semibold text-[#1a1a1a] mt-1">{profile?.email || user?.email}</p>
            </div>
            <div>
              <label className="text-sm font-semibold text-[#6b7280]">Rôle</label>
              <p className="text-sm font-semibold text-[#1a1a1a] mt-1 capitalize">{profile?.role}</p>
            </div>
          </div>
        </Card>

        {/* Mot de passe */}
        <Card className="p-6">
          <h2 className="text-lg font-bold text-[#1a1a1a] mb-4">Changer le mot de passe</h2>
          <form onSubmit={handlePwSubmit} className="space-y-4">
            <Input label="Nouveau mot de passe" name="new" type="password" value={pwForm.new} onChange={handlePwChange} placeholder="••••••••" />
            <Input label="Confirmer" name="confirm" type="password" value={pwForm.confirm} onChange={handlePwChange} placeholder="••••••••" />
            {pwError && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3"><p className="text-sm text-red-600">{pwError}</p></div>}
            {pwSuccess && <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3"><p className="text-sm text-emerald-600 font-semibold">{pwSuccess}</p></div>}
            <div className="flex justify-end">
              <Button type="submit" loading={pwLoading}>Mettre à jour</Button>
            </div>
          </form>
        </Card>

        {/* Types de KPI — admin seulement */}
        {isAdmin && <KPITypesSection />}

        {/* Intégrations — admin seulement */}
        {isAdmin && <IntegrationsSection />}
      </div>
    </Layout>
  )
}
