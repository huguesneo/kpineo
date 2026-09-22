// Répartition des objections principales des closeurs (fonction pure).
// Source : les rapports de fin de journée (end_of_day_reports, rôle closer).
// Une ligne compte quand ce n'est pas une vente (is_closed === false).
// La même liste que le champ GHL opportunity.objection_principale.

export const OBJECTIONS = ['Prix', 'Temps', 'Conjoint', 'Autre'];

// reports : [{ report_date, user_id, data: { rows: [...] }, profiles?: { full_name } }]
// Retourne { parCloser: [{ closer, total, parObjection: {Prix, …}, sansObjection }], total, parObjection }
export function repartitionObjections(reports, nomParUserId = {}) {
  const vide = () => Object.fromEntries(OBJECTIONS.map(o => [o, 0]));
  const parCloser = new Map();
  const global = vide();
  let total = 0;
  let sansObjectionTotal = 0;

  for (const r of reports ?? []) {
    const closer = r.profiles?.full_name ?? nomParUserId[r.user_id] ?? r.user_id ?? '—';
    if (!parCloser.has(closer)) parCloser.set(closer, { closer, total: 0, parObjection: vide(), sansObjection: 0 });
    const acc = parCloser.get(closer);

    for (const row of r.data?.rows ?? []) {
      if (row?.is_closed !== false) continue;
      const o = row.objection_principale;
      if (OBJECTIONS.includes(o)) {
        acc.parObjection[o]++; acc.total++; global[o]++; total++;
      } else {
        acc.sansObjection++; sansObjectionTotal++; // saisi avant la mise en place du champ
      }
    }
  }

  const lignes = [...parCloser.values()]
    .filter(c => c.total > 0 || c.sansObjection > 0)
    .sort((a, b) => b.total - a.total || a.closer.localeCompare(b.closer))
    .map(c => ({
      ...c,
      principale: OBJECTIONS.reduce((best, o) => c.parObjection[o] > c.parObjection[best] ? o : best, OBJECTIONS[0]),
    }))
    .map(c => ({ ...c, principale: c.total > 0 ? c.principale : null }));

  return { parCloser: lignes, total, parObjection: global, sansObjection: sansObjectionTotal };
}

// Précisions saisies pour « Autre » (objection_reason), pour affichage.
export function precisionsAutre(reports) {
  const out = [];
  for (const r of reports ?? []) {
    for (const row of r.data?.rows ?? []) {
      if (row?.is_closed === false && row.objection_principale === 'Autre' && row.objection_reason) {
        out.push({ date: r.report_date, contact: row.contact_name ?? '—', precision: row.objection_reason });
      }
    }
  }
  return out;
}
