import { useState } from 'react'
import Layout from '../components/layout/Layout'
import Card from '../components/shared/Card'
import Button from '../components/shared/Button'
import { useGHLConnection, useGHLConfig, syncGHLContacts, syncGHLOpportunities } from '../hooks/useGHL'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

function StatusDot({ ok }) {
  return (
    <span className={`inline-block w-2.5 h-2.5 rounded-full ${ok ? 'bg-emerald-500' : 'bg-red-400'}`} />
  )
}

function SyncResult({ result }) {
  if (!result) return null
  if (result.error) {
    return (
      <div className="mt-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
        Erreur : {result.error}
      </div>
    )
  }
  return (
    <div className="mt-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 font-semibold">
      ✓ {result.message}
    </div>
  )
}

export default function GHLSettings() {
  const { config, loading: configLoading, saveLocationId } = useGHLConfig()
  const savedLocationId = config?.location_id ?? null
  const { locations, loading: connLoading, error: connError, refetch: retestConn } = useGHLConnection(savedLocationId, !configLoading)

  const [selectedLocation, setSelectedLocation] = useState(null)
  const [saving, setSaving] = useState(false)
  const [syncingContacts, setSyncingContacts] = useState(false)
  const [syncingOpps, setSyncingOpps] = useState(false)
  const [contactsResult, setContactsResult] = useState(null)
  const [oppsResult, setOppsResult] = useState(null)
  const [manualId, setManualId] = useState('')
  const [savingManual, setSavingManual] = useState(false)

  const activeLocationId = config?.location_id ?? null
  const isConnected = !connLoading && !connError
  const hasLocations = locations.length > 0

  async function handleSaveLocation() {
    if (!selectedLocation) return
    setSaving(true)
    await saveLocationId(selectedLocation.id, selectedLocation.name)
    setSaving(false)
    setSelectedLocation(null)
  }

  async function handleSaveManualId() {
    const id = manualId.trim()
    if (!id) return
    setSavingManual(true)
    await saveLocationId(id, id)
    setSavingManual(false)
    setManualId('')
  }

  async function handleSyncContacts() {
    const locId = activeLocationId
    if (!locId) return
    setSyncingContacts(true)
    setContactsResult(null)
    const { data, error } = await syncGHLContacts(locId)
    setSyncingContacts(false)
    if (error) { setContactsResult({ error }); return }
    setContactsResult({ message: `${data.synced} contacts synchronisés` })
  }

  async function handleSyncOpportunities() {
    const locId = activeLocationId
    if (!locId) return
    setSyncingOpps(true)
    setOppsResult(null)
    const { data, error } = await syncGHLOpportunities(locId)
    setSyncingOpps(false)
    if (error) { setOppsResult({ error }); return }
    setOppsResult({ message: `${data.pipelines} pipeline(s), ${data.opportunities} opportunités synchronisées` })
  }

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#1a1a1a]">Go High Level</h1>
        <p className="text-sm text-[#6b7280] mt-1">Configuration et synchronisation CRM</p>
      </div>

      {/* ── Statut de connexion ── */}
      <Card className="p-6 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-[#1a1a1a] uppercase tracking-wide">Connexion API</h2>
          <Button size="sm" variant="secondary" onClick={retestConn} loading={connLoading}>
            Tester la connexion
          </Button>
        </div>

        <div className="flex items-center gap-3 mb-2">
          {connLoading ? (
            <div className="flex items-center gap-2 text-sm text-[#6b7280]">
              <svg className="w-4 h-4 animate-spin text-[#00bbb1]" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Vérification en cours…
            </div>
          ) : connError ? (
            <div className="flex items-center gap-2">
              <StatusDot ok={false} />
              <span className="text-sm font-semibold text-red-600">Non connecté</span>
              <span className="text-xs text-red-400">{connError}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <StatusDot ok={true} />
              <span className="text-sm font-semibold text-emerald-600">Connecté</span>
              <span className="text-xs text-[#6b7280]">— clé API valide</span>
            </div>
          )}
        </div>

        <p className="text-xs text-[#9ca3af]">Clé : <code className="bg-gray-100 px-1.5 py-0.5 rounded text-[#6b7280]">pit-••••••••••••••••••••</code></p>
      </Card>

      {/* ── Sélection de la location ── */}
      {isConnected && (
        <Card className="p-6 mb-4">
          <h2 className="text-sm font-bold text-[#1a1a1a] uppercase tracking-wide mb-4">Location (sous-compte)</h2>

          {/* Location active */}
          {activeLocationId && !configLoading && (
            <div className="flex items-center gap-3 mb-4 px-4 py-3 bg-[#00bbb1]/5 border border-[#00bbb1]/20 rounded-xl">
              <StatusDot ok={true} />
              <div>
                <p className="text-sm font-semibold text-[#1a1a1a]">{config?.name || activeLocationId}</p>
                <p className="text-xs text-[#6b7280]">ID : {activeLocationId}</p>
              </div>
              <span className="ml-auto text-xs font-semibold text-[#00bbb1] bg-[#00bbb1]/10 px-2 py-0.5 rounded-full">Actif</span>
            </div>
          )}

          {/* Liste des locations disponibles */}
          {hasLocations ? (
            <>
              <p className="text-xs text-[#6b7280] mb-3">{locations.length} location{locations.length > 1 ? 's' : ''} disponible{locations.length > 1 ? 's' : ''}</p>
              <div className="space-y-2 mb-4">
                {locations.map(loc => {
                  const isActive = loc.id === activeLocationId
                  const isSelected = selectedLocation?.id === loc.id
                  return (
                    <button
                      key={loc.id}
                      onClick={() => !isActive && setSelectedLocation(isSelected ? null : loc)}
                      className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
                        isActive
                          ? 'border-[#00bbb1] bg-[#00bbb1]/5 cursor-default'
                          : isSelected
                          ? 'border-[#00bbb1] bg-[#00bbb1]/5'
                          : 'border-[#e5e7eb] hover:border-[#00bbb1]/40 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-[#1a1a1a]">{loc.name || 'Location sans nom'}</p>
                          <p className="text-xs text-[#9ca3af] mt-0.5">{loc.id}</p>
                        </div>
                        {isActive && <span className="text-xs font-semibold text-[#00bbb1]">✓ Actif</span>}
                        {isSelected && !isActive && <span className="text-xs font-semibold text-[#00bbb1]">Sélectionné</span>}
                      </div>
                    </button>
                  )
                })}
              </div>

              {selectedLocation && selectedLocation.id !== activeLocationId && (
                <Button onClick={handleSaveLocation} loading={saving}>
                  Utiliser « {selectedLocation.name || selectedLocation.id} »
                </Button>
              )}
            </>
          ) : (
            /* PIT token : aucune location auto-détectée → saisie manuelle */
            <div>
              <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700 mb-4">
                Aucune location auto-détectée. Votre clé PIT est scoped à une location — entrez son ID manuellement.
                <a
                  href="https://app.gohighlevel.com/settings/integrations"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block mt-1 text-xs text-amber-600 underline"
                >
                  Trouver mon Location ID dans GHL → Paramètres → Intégrations
                </a>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="ex: abc123defghi456"
                  value={manualId}
                  onChange={e => setManualId(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:border-[#00bbb1]"
                />
                <Button onClick={handleSaveManualId} loading={savingManual} disabled={!manualId.trim()}>
                  Enregistrer
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ── Synchronisation ── */}
      {activeLocationId && (
        <Card className="p-6">
          <h2 className="text-sm font-bold text-[#1a1a1a] uppercase tracking-wide mb-1">Synchronisation</h2>
          <p className="text-xs text-[#6b7280] mb-5">
            Importe les données GHL dans Supabase pour les afficher dans l'app.
            {config?.last_synced_at && (
              <> Dernière sync : {format(new Date(config.last_synced_at), "d MMM yyyy 'à' HH:mm", { locale: fr })}</>
            )}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Contacts */}
            <div className="border border-[#e5e7eb] rounded-xl p-4">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#1a1a1a]">Contacts / Leads</p>
                  <p className="text-xs text-[#6b7280]">Tous les contacts de la location</p>
                </div>
              </div>
              <Button
                className="w-full"
                variant="secondary"
                onClick={handleSyncContacts}
                loading={syncingContacts}
              >
                {syncingContacts ? 'Synchronisation…' : 'Synchroniser les contacts'}
              </Button>
              <SyncResult result={contactsResult} />
            </div>

            {/* Opportunités */}
            <div className="border border-[#e5e7eb] rounded-xl p-4">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#1a1a1a]">Opportunités / Pipeline</p>
                  <p className="text-xs text-[#6b7280]">Leads dans les étapes du pipeline</p>
                </div>
              </div>
              <Button
                className="w-full"
                variant="secondary"
                onClick={handleSyncOpportunities}
                loading={syncingOpps}
              >
                {syncingOpps ? 'Synchronisation…' : 'Synchroniser le pipeline'}
              </Button>
              <SyncResult result={oppsResult} />
            </div>
          </div>

          {/* Sync tout */}
          {(contactsResult || oppsResult) && (
            <p className="mt-4 text-xs text-[#9ca3af] text-center">
              Retourne sur le Dashboard pour voir les données mises à jour.
            </p>
          )}
        </Card>
      )}

      {/* Message si non connecté */}
      {!connLoading && connError && !isConnected && (
        <Card className="p-6">
          <div className="text-center py-4">
            <p className="text-sm text-[#6b7280] mb-2">Impossible de se connecter à Go High Level.</p>
            <p className="text-xs text-[#9ca3af]">Vérifiez que la clé API est correcte dans les secrets Supabase.</p>
          </div>
        </Card>
      )}
    </Layout>
  )
}
