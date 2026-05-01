import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ID fixe pour le pattern single-row
const TOKEN_ROW_ID = '00000000-0000-0000-0000-000000000001'

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url)
    const code = url.searchParams.get('code')
    const realmId = url.searchParams.get('realmId')
    const error = url.searchParams.get('error')

    const appUrl = Deno.env.get('APP_URL') ?? 'http://localhost:5173'

    // L'utilisateur a refusé l'accès
    if (error) {
      return new Response(null, {
        status: 302,
        headers: { Location: `${appUrl}/parametres?qb=denied` },
      })
    }

    if (!code || !realmId) {
      return new Response(null, {
        status: 302,
        headers: { Location: `${appUrl}/parametres?qb=error&reason=missing_params` },
      })
    }

    const clientId = Deno.env.get('QUICKBOOKS_CLIENT_ID')!
    const clientSecret = Deno.env.get('QUICKBOOKS_CLIENT_SECRET')!
    const redirectUri = Deno.env.get('QUICKBOOKS_REDIRECT_URI')!

    // Échange du code contre les tokens
    const tokenRes = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + btoa(`${clientId}:${clientSecret}`),
        'Accept': 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    })

    if (!tokenRes.ok) {
      const errText = await tokenRes.text()
      console.error('QB token exchange failed:', errText)
      return new Response(null, {
        status: 302,
        headers: { Location: `${appUrl}/parametres?qb=error&reason=token_exchange` },
      })
    }

    const tokens = await tokenRes.json()
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    // Stocker les tokens dans Supabase
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { error: dbError } = await supabase
      .from('quickbooks_tokens')
      .upsert({
        id: TOKEN_ROW_ID,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        realm_id: realmId,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })

    if (dbError) {
      console.error('QB token storage error:', dbError)
      return new Response(null, {
        status: 302,
        headers: { Location: `${appUrl}/parametres?qb=error&reason=storage` },
      })
    }

    // Succès — rediriger vers l'app
    return new Response(null, {
      status: 302,
      headers: { Location: `${appUrl}/parametres?qb=connected` },
    })
  } catch (err) {
    console.error('QB callback error:', err)
    const appUrl = Deno.env.get('APP_URL') ?? 'http://localhost:5173'
    return new Response(null, {
      status: 302,
      headers: { Location: `${appUrl}/parametres?qb=error&reason=exception` },
    })
  }
})
