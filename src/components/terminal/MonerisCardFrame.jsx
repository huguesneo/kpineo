import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

// Champ carte hébergé par Moneris (Hosted Tokenization).
// Le numéro de carte ne passe jamais par NEO : Moneris retourne un jeton
// temporaire (dataKey) qu'on envoie ensuite à l'edge function.
//
// Variables Netlify :
//   VITE_MONERIS_HT_URL         https://esqa.moneris.com/HPPtoken/index.php (test)
//                               https://www3.moneris.com/HPPtoken/index.php (production)
//   VITE_MONERIS_HT_PROFILE_ID  ht... (profil créé dans le MRC, lié au domaine du site)

const HT_URL = import.meta.env.VITE_MONERIS_HT_URL || 'https://esqa.moneris.com/HPPtoken/index.php'
const PROFILE_ID = import.meta.env.VITE_MONERIS_HT_PROFILE_ID || ''

const CSS_BODY = 'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;margin:0;padding:0;color:#111827;'
const CSS_TEXTBOX = 'font-size:15px;border:1px solid #d1d5db;border-radius:8px;padding:10px 12px;margin:0 0 10px 0;height:22px;width:calc(100% - 26px);display:block;'
const CSS_LABEL = 'font-size:13px;color:#6b7280;display:block;margin:0 0 4px 0;'

const ERRORS = {
  '943': 'Numéro de carte invalide.',
  '944': 'Date d’expiration invalide (MMAA).',
  '945': 'Code de sécurité invalide.',
  '940': 'Configuration Moneris invalide (profil).',
  '942': 'Ce site n’est pas autorisé dans le profil Moneris.',
  '941': 'Erreur Moneris, réessaie.',
}

function frameSrc() {
  const params = new URLSearchParams({
    id: PROFILE_ID,
    pmmsg: 'true',
    enable_exp: '1',
    enable_cvd: '1',
    enable_cc_formatting: '1',
    enable_exp_formatting: '1',
    display_labels: '1',
    pan_label: 'Numéro de carte',
    exp_label: 'Expiration (MM/AA)',
    cvd_label: 'Code de sécurité (CVC)',
    css_body: CSS_BODY,
    css_textbox: CSS_TEXTBOX,
    css_input_label: CSS_LABEL,
  })
  return `${HT_URL}?${params.toString()}`
}

// onToken(tempToken) | onError(message)
const MonerisCardFrame = forwardRef(function MonerisCardFrame({ onToken, onError }, ref) {
  const frameRef = useRef(null)
  const origin = new URL(HT_URL).origin

  useImperativeHandle(ref, () => ({
    tokenize() {
      frameRef.current?.contentWindow?.postMessage('tokenize', HT_URL)
    },
  }))

  useEffect(() => {
    function onMessage(e) {
      if (e.origin !== origin) return
      let data
      try { data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data } catch { return }
      const codes = [].concat(data?.responseCode ?? [])
      if (codes.length === 1 && codes[0] === '001' && data.dataKey) {
        onToken?.(data.dataKey)
      } else {
        const msg = codes.map(c => ERRORS[c] ?? `Erreur ${c}`).join(' ')
        onError?.(msg || 'Carte invalide.')
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [origin, onToken, onError])

  if (!PROFILE_ID) {
    return <p className="text-sm text-red-600">VITE_MONERIS_HT_PROFILE_ID n’est pas configuré.</p>
  }

  return (
    <iframe
      ref={frameRef}
      title="Carte de crédit (sécurisé par Moneris)"
      src={frameSrc()}
      className="w-full border-0"
      style={{ height: 230 }}
    />
  )
})

export default MonerisCardFrame
