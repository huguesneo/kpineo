// Corbeille, rendue côté serveur (pas de DOM dans les tests du hub) : bouton
// Supprimer, vue Corbeille, bandeau de l'éditeur, liste des montages.
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'
import { BoutonSupprimer, ListeCorbeille, BandeauCorbeille } from './CorbeilleMontage'
import { ListeMontages } from './MontageAccueil'
import { LienOrigine } from './VariantesMontage'

const SUPPRIME = '2026-10-03T12:00:00Z'
const INFO = 'info@neoperformance.ca'
const job = (id, extra = {}) => ({ id, titre: `Montage ${id}`, statut: 'apercu_pret', version_courante: 2, cree_par: INFO, created_at: '2026-10-01T10:00:00Z', ...extra })
const rendre = (el) => renderToStaticMarkup(<StaticRouter location="/">{el}</StaticRouter>)
const onSupprimer = async () => {}

describe('BoutonSupprimer', () => {
  it('confirmation : corbeille, Drive pas touché, bouton rouge', () => {
    const html = rendre(<BoutonSupprimer job={job('a')} taches={[]} nbVariantes={2} onSupprimer={onSupprimer} ouvertInitial />)
    expect(html).toContain('Mettre « Montage a » à la corbeille ?')
    expect(html).toContain('Les exports déjà dans Google Drive ne sont pas touchés.')
    expect(html).toContain('Ses 2 variantes restent dans la liste.')
    expect(html).toContain('Mettre à la corbeille')
    expect(html).toContain('bg-[#ef4444]')
  })
  it('tâche active : désactivé avec la raison', () => {
    const html = rendre(<BoutonSupprimer job={job('a')} taches={[{ job_id: 'a', statut: 'en_attente' }]} onSupprimer={onSupprimer} ouvertInitial />)
    expect(html).not.toContain('alertdialog')
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Supprimer<\/button>/)
    expect(html).toContain("Annule d&#x27;abord la demande en cours.")
  })
  it('déjà dans la corbeille : rien', () => {
    expect(rendre(<BoutonSupprimer job={job('a', { supprime_le: SUPPRIME })} taches={[]} onSupprimer={onSupprimer} />)).toBe('')
  })
})

describe('ListeCorbeille', () => {
  it('vide', () => {
    expect(rendre(<ListeCorbeille corbeille={[]} onRestaurer={onSupprimer} />)).toContain('La corbeille est vide.')
  })
  it('montages supprimés avec Restaurer', () => {
    const html = rendre(<ListeCorbeille corbeille={[job('a', { supprime_le: SUPPRIME, supprime_par: INFO })]} noms={{ [INFO]: 'Cloé' }} onRestaurer={onSupprimer} />)
    expect(html).toContain('Montage a')
    expect(html).toContain('Cloé')
    expect(html).toContain('>Restaurer</button>')
    expect(html).toContain('Les exports dans Google Drive ne sont jamais touchés.')
  })
})

describe('BandeauCorbeille', () => {
  it('éditeur : dans la corbeille, par qui, Restaurer', () => {
    const html = rendre(<BandeauCorbeille job={job('a', { supprime_le: SUPPRIME, supprime_par: INFO })} noms={{ [INFO]: 'Cloé' }} onRestaurer={onSupprimer} />)
    expect(html).toContain('Ce montage est dans la corbeille')
    expect(html).toContain('par Cloé')
    expect(html).toContain('>Restaurer</button>')
  })
})

describe('ListeMontages et variantes', () => {
  const origine = job('o', { supprime_le: SUPPRIME })
  const variante = job('v', { titre: 'Variante 1:1', variante_de: 'o' })
  it('variante d\'un montage supprimé : « montage supprimé »', () => {
    const html = rendre(<ListeMontages jobs={[variante]} tous={[variante, origine]} noms={{}} loading={false} error={null} reload={() => {}} positions={{}} taches={{}} onSupprimer={onSupprimer} />)
    expect(html).toContain('Variante de')
    expect(html).toContain('Montage o')
    expect(html).toContain('(montage supprimé)')
    expect(html).toContain('>Supprimer</button>')
  })
  it('sans onSupprimer : pas de colonne Actions', () => {
    const html = rendre(<ListeMontages jobs={[job('a')]} noms={{}} loading={false} error={null} reload={() => {}} positions={{}} taches={{}} />)
    expect(html).not.toContain('Supprimer')
  })
  it('LienOrigine : origine présente, sans mention', () => {
    expect(rendre(<LienOrigine origine={{ id: 'o', titre: 'Montage o', supprime: false }} />)).not.toContain('montage supprimé')
  })
})
