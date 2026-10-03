// Étape 9, rendue côté serveur (pas de DOM dans les tests du hub) :
// Restaurer, Terminer, confirmations, lien d'export, cas d'erreur.
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { RestaurerVersion, BoutonTerminer, BandeauExport, LienExport } from './FinMontage'
import FilConversation from './FilConversation'
import { LienDrive } from './MontageAccueil'
import { filConversation } from '../../../lib/montageEditeur'

const JOB = '22222222-0000-0000-0000-000000000001'
const job = (extra = {}) => ({ id: JOB, titre: 'Pub cortisol', statut: 'apercu_pret', version_courante: 3, format: '9:16', ...extra })
const v = (numero) => ({ id: `v${numero}`, numero, chemin_apercu: `apercus/${JOB}/v${numero}.mp4`, created_at: `2026-10-03T1${numero}:00:00Z` })
const tache = (statut, extra = {}) => ({ id: 'a', job_id: JOB, type: 'montage', statut, created_at: '2026-10-03T15:00:00Z', payload: {}, ...extra })
const rien = () => {}
const CHEMIN = 'NEO vidéo/Out/Pub cortisol/Pub cortisol_v3.mp4'

describe('Restaurer cette version', () => {
  const rendre = (props) => renderToStaticMarkup(<RestaurerVersion job={job()} taches={[]} version={v(1)} onRestaurer={rien} {...props} />)

  it('ancienne version : bouton actif', () => {
    expect(rendre()).toMatch(/<button(?![^>]*disabled="")[^>]*>Restaurer cette version<\/button>/)
  })

  it('version actuelle : aucun bouton', () => {
    expect(rendre({ version: v(3) })).toBe('')
  })

  it('tâche en cours : bouton désactivé, raison affichée', () => {
    const html = rendre({ taches: [tache('en_cours')] })
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Restaurer cette version<\/button>/)
    expect(html).toContain('agent travaille')
  })

  it('montage terminé : bouton actif (plus de verrou après Terminer)', () => {
    const html = rendre({ job: job({ statut: 'termine', lien_drive_export: CHEMIN }) })
    expect(html).toMatch(/<button(?![^>]*disabled="")[^>]*>Restaurer cette version<\/button>/)
  })

  it('confirmation avant l\'envoi : ce que ça fait, Annuler, Restaurer la v1', () => {
    const html = rendre({ ouvertInitial: true })
    expect(html).toContain('role="alertdialog"')
    expect(html).toContain('Restaurer la v1 ?')
    expect(html).toContain('nouvelle version, v4, identique à la v1')
    expect(html).toContain('rien n&#x27;est perdu')
    expect(html).toContain('>Annuler</button>')
    expect(html).toContain('>Restaurer la v1</button>')
  })

  it('confirmation ouverte mais tâche arrivée entre-temps : pas de confirmation possible', () => {
    const html = rendre({ ouvertInitial: true, taches: [tache('en_attente')] })
    expect(html).not.toContain('alertdialog')
    expect(html).toContain('attend son tour')
  })
})

describe('Terminer et exporter', () => {
  const rendre = (props) => renderToStaticMarkup(<BoutonTerminer job={job()} taches={[]} onTerminer={rien} {...props} />)

  it('bouton actif avec une version', () => {
    expect(rendre()).toMatch(/<button(?![^>]*disabled="")[^>]*>Terminer et exporter<\/button>/)
  })

  it('confirmation : HD, dossier Out, aucune approbation', () => {
    const html = rendre({ ouvertInitial: true })
    expect(html).toContain('Terminer et exporter la v3 ?')
    expect(html).toContain('1080 x 1920, 30 images/s')
    expect(html).toContain('NEO vidéo/Out/Pub cortisol/')
    expect(html).toContain('Aucune approbation')
    expect(html).toContain('>Exporter en HD</button>')
  })

  it('pendant le rendu : désactivé', () => {
    const html = rendre({ job: job({ statut: 'rendu' }), taches: [tache('en_cours', { type: 'terminer' })] })
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Terminer et exporter<\/button>/)
  })

  it('version actuelle déjà exportée : bouton désactivé, message « déjà exportée »', () => {
    const html = rendre({ job: job({ statut: 'termine', lien_drive_export: CHEMIN }) })
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Terminer et exporter<\/button>/)
    expect(html).toContain('Cette version est déjà exportée, fais un changement pour créer une nouvelle version.')
  })

  it('export de v3 puis changement (v4) : bouton actif, la confirmation parle de la v4', () => {
    const j = job({ statut: 'apercu_pret', version_courante: 4, lien_drive_export: CHEMIN })
    expect(rendre({ job: j })).toMatch(/<button(?![^>]*disabled="")[^>]*>Terminer et exporter<\/button>/)
    expect(rendre({ job: j, ouvertInitial: true })).toContain('Pub cortisol_v4.mp4')
  })

  it('erreur d\'export : on peut relancer Terminer, et le fil le dit', () => {
    const taches = [tache('erreur', { type: 'terminer', erreur: 'Le rendu final a échoué.' })]
    const j = job({ statut: 'erreur', erreur: 'Le rendu final a échoué.' })
    expect(rendre({ job: j, taches })).toMatch(/<button(?![^>]*disabled="")[^>]*>Terminer et exporter<\/button>/)
    const fil = renderToStaticMarkup(<FilConversation messages={filConversation({ versions: [v(1), v(2), v(3)], taches })} />)
    expect(fil).toContain('Le rendu final a échoué.')
    expect(fil).toContain('relancer « Terminer et exporter »')
  })
})

describe('lien d\'export', () => {
  it('dernier export de la version actuelle : fichier, version, chemin et « Ouvrir dans Drive »', () => {
    const html = renderToStaticMarkup(<BandeauExport job={job({ statut: 'termine', lien_drive_export: CHEMIN })} />)
    expect(html).toContain('Dernier export : Pub cortisol_v3.mp4')
    expect(html).toContain('export de la version actuelle (v3)')
    expect(html).toContain(CHEMIN)
    expect(html).toContain('>Ouvrir dans Drive</a>')
    expect(html).toContain('href="https://drive.google.com/drive/search?safe=strict&amp;q=Pub%20cortisol_v3.mp4"')
    expect(html).toContain('target="_blank"')
  })

  it('après un changement : le dernier export reste affiché, avec la version actuelle', () => {
    const html = renderToStaticMarkup(<BandeauExport job={job({ statut: 'montage', version_courante: 4, lien_drive_export: CHEMIN })} />)
    expect(html).toContain('Dernier export : Pub cortisol_v3.mp4')
    expect(html).toContain('export de v3, version actuelle : v4')
    expect(html).toContain('>Ouvrir dans Drive</a>')
  })

  it('pas de bandeau sans export', () => {
    expect(renderToStaticMarkup(<BandeauExport job={job()} />)).toBe('')
  })

  it('URL écrite par l\'agent : lien direct', () => {
    const html = renderToStaticMarkup(<LienExport job={{ lien_drive_export: 'https://drive.google.com/file/d/abc/view' }} compact />)
    expect(html).toContain('href="https://drive.google.com/file/d/abc/view"')
  })

  it('rien d\'exporté : aucun lien', () => {
    expect(renderToStaticMarkup(<LienExport job={job()} />)).toBe('')
  })

  it('liste des montages, colonne Google Drive : « Ouvrir dans Drive » puis la vidéo source', () => {
    const html = renderToStaticMarkup(<LienDrive job={job({ statut: 'termine', lien_drive_export: CHEMIN, fichier_drive_id: 'f9' })} />)
    expect(html.indexOf('Ouvrir dans Drive')).toBeLessThan(html.indexOf('Vidéo source'))
    expect(html).toContain(`title="${CHEMIN}"`)
    expect(html).toContain('href="https://drive.google.com/drive/search?safe=strict&amp;q=Pub%20cortisol_v3.mp4"')
    expect(html).toContain('href="https://drive.google.com/file/d/f9/view"')
  })

  it('liste, montage revenu en cours après un export : le lien reste', () => {
    const html = renderToStaticMarkup(<LienDrive job={job({ statut: 'montage', version_courante: 4, lien_drive_export: CHEMIN })} />)
    expect(html).toContain('>Ouvrir dans Drive</a>')
  })

  it('liste, pas encore exporté : vidéo source seulement', () => {
    const html = renderToStaticMarkup(<LienDrive job={job({ fichier_drive_id: 'f9' })} />)
    expect(html).not.toContain('Ouvrir dans Drive')
    expect(html).toContain('Vidéo source')
    expect(renderToStaticMarkup(<LienDrive job={job()} />)).toContain('Aucun lien')
  })
})
