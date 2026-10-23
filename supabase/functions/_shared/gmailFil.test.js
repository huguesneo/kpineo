import { describe, it, expect } from 'vitest'
import {
  decoderBase64Url, lireAdresse, lireAdresses, partiesDuMessage, nettoyerHtml, separerCitation, messageDuFil,
  filEnConversation, idsGmail, texteEnHtml, tailleLisible, documentIframe, extraitTexte,
  libelleDeClassement, modificationClassement, classementAReessayer,
} from './gmailFil.js'

const b64 = (t) => Buffer.from(t, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const msg = ({ id, de, date, html, texte, labels = ['INBOX'], pj = [] }) => ({
  id,
  internalDate: String(new Date(date).getTime()),
  labelIds: labels,
  payload: {
    mimeType: 'multipart/mixed',
    headers: [{ name: 'From', value: de }, { name: 'To', value: 'Info NEO <info@neoperformance.ca>' }, { name: 'Subject', value: 'Reçus' }],
    parts: [
      { mimeType: 'multipart/alternative', parts: [
        ...(texte ? [{ mimeType: 'text/plain', body: { data: b64(texte) } }] : []),
        ...(html ? [{ mimeType: 'text/html', body: { data: b64(html) } }] : []),
      ] },
      ...pj.map(nom => ({ mimeType: 'application/pdf', filename: nom, body: { attachmentId: 'a1', size: 52000 } })),
    ],
  },
})

describe('décodage', () => {
  it('base64url UTF-8 (accents)', () => {
    expect(decoderBase64Url(b64('Reçu à Montréal ✓'))).toBe('Reçu à Montréal ✓')
    expect(decoderBase64Url(null)).toBe('')
  })
  it('adresses', () => {
    expect(lireAdresse('"Julie Roy" <Julie@X.ca>')).toEqual({ nom: 'Julie Roy', courriel: 'julie@x.ca' })
    expect(lireAdresse('julie@x.ca')).toEqual({ nom: null, courriel: 'julie@x.ca' })
    expect(lireAdresses('"Roy, Julie" <j@x.ca>, b@y.ca').map(a => a.courriel)).toEqual(['j@x.ca', 'b@y.ca'])
  })
  it('parties MIME : html, texte, pièces jointes avec leur nom', () => {
    const p = partiesDuMessage(msg({ id: '1', de: 'a@b.c', date: '2026-10-20', html: '<p>Salut</p>', texte: 'Salut', pj: ['recu.pdf'] }).payload)
    expect(p.html).toBe('<p>Salut</p>')
    expect(p.texte).toBe('Salut')
    expect(p.piecesJointes).toEqual([{ nom: 'recu.pdf', type: 'application/pdf', taille: 52000 }])
  })
})

describe('nettoyage HTML', () => {
  it('retire scripts, iframes, formulaires, gestionnaires et liens javascript:', () => {
    const sale = '<p onclick="vol()">Bonjour</p><script>alert(1)</script><iframe src="x"></iframe><form><input></form><a href="javascript:alert(1)">x</a><style>p{}</style>'
    const propre = nettoyerHtml(sale)
    expect(propre).toBe('<p>Bonjour</p><a>x</a>')
  })
  it('retire les images de suivi et cid:, garde les vraies images', () => {
    const html = '<img src="https://x.com/logo.png" width="120"><img src="https://t.sendgrid.net/wf/open?u=1" width="1" height="1"><img src="https://x.com/a.gif" style="display:none"><img src="cid:image001">'
    expect(nettoyerHtml(html)).toBe('<img src="https://x.com/logo.png" width="120">')
  })
  it('texte brut : échappé, retours à la ligne', () => {
    expect(texteEnHtml('a < b\nc')).toBe('a &lt; b<br>c')
  })
})

describe('citations repliées', () => {
  it('div gmail_quote', () => {
    const r = separerCitation('<div>Merci!</div><div class="gmail_quote">Le lun. 20 oct., Cloé a écrit :<blockquote>…</blockquote></div>')
    expect(r.principal).toBe('<div>Merci!</div>')
    expect(r.citation).toMatch(/^<div class="gmail_quote">/)
  })
  it('ligne « Le … a écrit : » ou « On … wrote: » en texte', () => {
    const r = separerCitation('Parfait, merci<br><br>Le 20 oct. 2026 à 10:02, NEO Performance &lt;info@neoperformance.ca&gt; a écrit :<br>&gt; Bonjour')
    expect(r.principal).toBe('Parfait, merci')
    expect(r.citation).toMatch(/^Le 20 oct\. 2026/)
    expect(separerCitation('Thanks<br>On Mon, Oct 20, 2026 at 10:02 AM Info wrote:<br>&gt; hi').citation).toMatch(/^On Mon/)
  })
  it('rien avant la citation, ou pas de citation : tout reste ouvert', () => {
    expect(separerCitation('<div class="gmail_quote">seulement</div>').citation).toBe(null)
    expect(separerCitation('<p>Juste un message</p>')).toEqual({ principal: '<p>Juste un message</p>', citation: null })
  })
})

describe('fil en conversation', () => {
  const thread = {
    messages: [
      msg({ id: '2', de: 'NEO Performance <info@neoperformance.ca>', date: '2026-10-21T14:00:00Z', html: '<p>Bonjour Julie :)</p>', labels: ['SENT'] }),
      msg({ id: '1', de: 'Julie Roy <julie@x.ca>', date: '2026-10-20T09:00:00Z', texte: 'Mes reçus svp', pj: ['assurance.pdf'] }),
      msg({ id: '3', de: 'NEO Performance <info@neoperformance.ca>', date: '2026-10-22T09:00:00Z', html: '<p>brouillon</p>', labels: ['DRAFT'] }),
    ],
  }
  it('plus récent en haut, sens, sans brouillons', () => {
    const fil = filEnConversation(thread)
    expect(fil.map(m => m.id)).toEqual(['2', '1'])
    expect(fil[0].sens).toBe('envoye')
    expect(fil[1]).toMatchObject({ sens: 'recu', de: { nom: 'Julie Roy', courriel: 'julie@x.ca' }, date: '2026-10-20T09:00:00.000Z' })
    expect(fil[1].piecesJointes.map(p => p.nom)).toEqual(['assurance.pdf'])
    expect(fil[1].html).toBe('Mes reçus svp')
    expect(fil[1].extrait).toBe('Mes reçus svp')
  })
  it('extrait : texte sans balises ni entités, coupé', () => {
    expect(extraitTexte('<p>Bonjour&nbsp;Julie</p><p>Voici &lt;tes&gt; reçus</p>')).toBe('Bonjour Julie Voici <tes> reçus')
    expect(extraitTexte('a'.repeat(200), 10)).toBe('aaaaaaaaa…')
  })
  it('message envoyé reconnu par le libellé SENT même depuis un alias', () => {
    expect(messageDuFil(msg({ id: 'x', de: 'cloe@neoperformance.ca', date: '2026-10-20', texte: 'x', labels: ['SENT'] })).sens).toBe('envoye')
  })
  it('message vide ou fil absent : pas de crash', () => {
    expect(filEnConversation(null)).toEqual([])
    expect(messageDuFil({}).html).toBe('')
  })
})

describe('ids et tailles', () => {
  it('fil, sinon message', () => {
    expect(idsGmail({ gmail_thread_id: 't', gmail_message_id: 'm' })).toEqual({ threadId: 't', messageId: 'm' })
    expect(idsGmail({ gmail_message_id: 'm', payload: {} })).toEqual({ threadId: null, messageId: 'm' })
    expect(idsGmail({ payload: { gmail_message_id: 'p' } })).toEqual({ threadId: null, messageId: 'p' })
  })
  it('taille lisible', () => {
    expect(tailleLisible(52000)).toBe('51 Ko')
    expect(tailleLisible(3_500_000)).toBe('3,3 Mo')
    expect(tailleLisible(null)).toBe(null)
  })
})

describe('document de l’iframe', () => {
  it('bloque les scripts et ouvre les liens ailleurs', () => {
    const doc = documentIframe('<p>Salut</p>')
    expect(doc).toContain("script-src 'none'")
    expect(doc).toContain('<base target="_blank">')
    expect(doc).toContain('<body><p>Salut</p></body>')
  })
})

describe('classement sur Rejeter et Déjà traité', () => {
  it('libellé : label_final du dossier, sinon celui de la catégorie, jamais un nom', () => {
    expect(libelleDeClassement({ payload: { label_final: 'Label_12' } }, 'Label_99')).toBe('Label_12')
    expect(libelleDeClassement({ payload: { label_final: 'CLIENTS/Reçus' } }, 'Label_99')).toBe('Label_99')
    expect(libelleDeClassement({ payload: {} }, null)).toBe(null)
  })
  it('ajoute le libellé et retire INBOX', () => {
    expect(modificationClassement('Label_12')).toEqual({ addLabelIds: ['Label_12'], removeLabelIds: ['INBOX'] })
    expect(modificationClassement(null)).toEqual({ addLabelIds: [], removeLabelIds: ['INBOX'] })
  })
  it('Réessayer seulement après un échec sur un dossier fermé dans le Hub', () => {
    expect(classementAReessayer({ decision: 'rejected', payload: { hub_gmail: { erreur: 'Gmail 500' } } })).toBe(true)
    expect(classementAReessayer({ decision: 'traite_manuellement', payload: { hub_gmail: { classe_le: 'x' } } })).toBe(false)
    expect(classementAReessayer({ decision: 'pending', payload: { hub_gmail: { erreur: 'x' } } })).toBe(false)
  })
})
