import { describe, it, expect } from 'vitest'
import { analyserMarkdown, analyserEnLigne } from './markdownSimple'

const t = (texte) => ({ type: 'texte', texte })

describe('analyserEnLigne', () => {
  it('gras, italique, code', () => {
    expect(analyserEnLigne('Le **hook** est *plus court* avec `npm run couper`')).toEqual([
      t('Le '), { type: 'gras', enfants: [t('hook')] }, t(' est '), { type: 'italique', enfants: [t('plus court')] },
      t(' avec '), { type: 'code', texte: 'npm run couper' },
    ])
  })
  it('italique dans du gras', () => {
    expect(analyserEnLigne('**très *fort* ici**')).toEqual([{ type: 'gras', enfants: [t('très '), { type: 'italique', enfants: [t('fort')] }, t(' ici')] }])
  })
  it('astérisques isolées et soulignés dans un mot : texte simple', () => {
    expect(analyserEnLigne('2 * 3 = 6')).toEqual([t('2 * 3 = 6')])
    expect(analyserEnLigne('m_abc_def')).toEqual([t('m_abc_def')])
  })
})

describe('analyserMarkdown', () => {
  it('titres et paragraphes (lignes gardées)', () => {
    expect(analyserMarkdown('## Ce que j\'ai fait\nLigne 1\nLigne 2\n\nAutre')).toEqual([
      { type: 'titre', niveau: 2, contenu: [t('Ce que j\'ai fait')] },
      { type: 'paragraphe', lignes: [[t('Ligne 1')], [t('Ligne 2')]] },
      { type: 'paragraphe', lignes: [[t('Autre')]] },
    ])
  })
  it('listes à puces et numérotées', () => {
    expect(analyserMarkdown('- un\n- **deux**\n\n1. premier\n2. second')).toEqual([
      { type: 'liste', ordonnee: false, elements: [[t('un')], [{ type: 'gras', enfants: [t('deux')] }]] },
      { type: 'liste', ordonnee: true, elements: [[t('premier')], [t('second')]] },
    ])
  })
  it('tableau avec ligne d\'en-tête', () => {
    expect(analyserMarkdown('| Moment | Carte |\n|---|:---:|\n| 0:03 | **Hook** |\n| 0:10 | Stat |')).toEqual([{
      type: 'tableau',
      entetes: [[t('Moment')], [t('Carte')]],
      lignes: [[[t('0:03')], [{ type: 'gras', enfants: [t('Hook')] }]], [[t('0:10')], [t('Stat')]]],
    }])
  })
  it('barre verticale sans ligne d\'en-tête : paragraphe', () => {
    expect(analyserMarkdown('| pas un tableau |')).toEqual([{ type: 'paragraphe', lignes: [[t('| pas un tableau |')]] }])
  })
  it('bloc de code et séparateur', () => {
    expect(analyserMarkdown('```\nnpm run rendu\n```\n---')).toEqual([{ type: 'code', texte: 'npm run rendu' }, { type: 'separateur' }])
  })
  it('vide ou absent : aucun bloc', () => {
    expect(analyserMarkdown('')).toEqual([])
    expect(analyserMarkdown(null)).toEqual([])
  })
})
