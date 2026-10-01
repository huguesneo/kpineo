// Retirée : les prélèvements récurrents sont maintenant faits par Moneris
// (abonnements). Cette fonction ne prélève plus rien, pour éviter tout double
// prélèvement. La synchronisation est dans moneris-webhook.

Deno.serve(() =>
  new Response(JSON.stringify({ error: 'Fonction retirée : Moneris gère les prélèvements récurrents.' }), {
    status: 410, headers: { 'Content-Type': 'application/json' },
  }),
)
