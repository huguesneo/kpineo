// « Qui est dans la vidéo ? » au dépôt (rendu côté serveur, pas de DOM dans les tests du hub).
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ChoixPersonnes from './ChoixPersonnes'

describe('ChoixPersonnes', () => {
  it('deux choix, aucun coché par défaut', () => {
    const html = renderToStaticMarkup(<ChoixPersonnes valeur={null} onChange={() => {}} />)
    expect(html).toContain('Qui est dans la vidéo ?')
    expect(html).toContain("Moi ou l&#x27;équipe")
    expect(html).toContain('Une cliente')
    expect(html).toContain('rien ne part chez ElevenLabs')
    expect(html).not.toContain('checked')
  })

  it('le choix fait est coché ; l’erreur s’affiche ; verrouillé après le lancement', () => {
    expect(renderToStaticMarkup(<ChoixPersonnes valeur="cliente" onChange={() => {}} />)).toMatch(/checked="" value="cliente"/)
    expect(renderToStaticMarkup(<ChoixPersonnes valeur={null} onChange={() => {}} erreur="Indique qui est dans la vidéo." />))
      .toContain('Indique qui est dans la vidéo.')
    expect(renderToStaticMarkup(<ChoixPersonnes valeur="moi_equipe" onChange={() => {}} verrouille />).match(/disabled=""/g)).toHaveLength(2)
  })
})
