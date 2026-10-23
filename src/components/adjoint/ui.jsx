// Petits éléments de la page Adjoint (maquette docs/maquettes/adjoint-v2.dc.html) :
// Montserrat, accent #00bbb1, texte teal accessible #00857e / #00665f, fond #f4f5f7.

const TONS = {
  neutre: 'bg-[#f1f3f5] text-[#3d434f]',
  succes: 'bg-[#e3f6f4] text-[#00665f]',
  alerte: 'bg-[#fff4e5] text-[#9a4d00]',
  danger: 'bg-[#fef3f2] text-[#b42318]',
  info: 'bg-[#eef2ff] text-[#3538cd]',
}
export function Pastille({ ton = 'neutre', children, className = '', title }) {
  return (
    <span title={title} className={`inline-flex items-center whitespace-nowrap text-[11px] font-bold px-2 py-0.5 rounded-full ${TONS[ton] ?? TONS.neutre} ${className}`}>
      {children}
    </span>
  )
}

const ICONES = {
  courriel: 'M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75',
  commande: 'M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007z',
  agenda: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5',
  sms: 'M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z',
  leo: 'M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z',
  check: 'M4.5 12.75l6 6 9-13.5',
  recherche: 'M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z',
  retour: 'M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18',
  trombone: 'M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13',
}
ICONES.reseaux_sociaux = ICONES.sms

export function Icone({ nom, taille = 18, epaisseur = 1.7, className = '' }) {
  return (
    <svg width={taille} height={taille} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={epaisseur} aria-hidden="true" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d={ICONES[nom] ?? ICONES.courriel} />
    </svg>
  )
}

export function IconeCanal({ canal }) {
  return (
    <span className="w-8 h-8 flex-shrink-0 rounded-lg bg-[#f1f3f5] text-[#3d434f] flex items-center justify-center">
      <Icone nom={canal} />
    </span>
  )
}

export function Carte({ children, className = '', ...rest }) {
  return <section className={`bg-white border border-[#e6e8ec] rounded-xl ${className}`} {...rest}>{children}</section>
}

export function Vide({ children }) {
  return <p className="m-0 px-5 py-10 text-center text-sm text-[#5b616e]">{children}</p>
}

export function Chargement({ texte = 'Chargement...' }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm font-semibold text-[#5b616e]">
      <svg className="animate-spin h-5 w-5 text-[#00bbb1]" fill="none" viewBox="0 0 24 24" aria-hidden="true">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      {texte}
    </div>
  )
}

export function Erreur({ children, onReessayer }) {
  return (
    <div className="m-4 rounded-lg border border-[#fecdca] bg-[#fef3f2] px-4 py-3 text-sm text-[#7a271a] flex flex-wrap items-center gap-3">
      <span className="flex-1">{children}</span>
      {onReessayer && <button type="button" onClick={onReessayer} className="font-bold underline">Réessayer</button>}
    </div>
  )
}

const BOUTONS = {
  principal: 'border-0 bg-[#00857e] text-white hover:bg-[#00665f] disabled:bg-[#9fb5b3]',
  secondaire: 'bg-white text-[#16181d] border border-[#d5d9e0] hover:bg-[#f7f8fa]',
  danger: 'bg-white text-[#b42318] border border-[#fecdca] hover:bg-[#fef3f2]',
  discret: 'bg-white text-[#3d434f] border border-[#e6e8ec] hover:bg-[#f7f8fa]',
}
export function Bouton({ variante = 'secondaire', className = '', ...rest }) {
  return (
    <button
      type="button"
      className={`text-sm font-bold px-4 py-2.5 rounded-[9px] min-h-[44px] disabled:cursor-not-allowed disabled:opacity-60 ${BOUTONS[variante]} ${className}`}
      {...rest}
    />
  )
}

// Bouton de section ou de filtre (pilule)
export function Puce({ actif, desactive, onClick, children, compte }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={desactive}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[13px] font-semibold border transition-colors ${
        desactive ? 'border-[#eef0f3] text-[#9aa0ab] bg-white cursor-not-allowed'
          : actif ? 'border-[#00857e] bg-[#00857e] text-white' : 'border-[#e6e8ec] bg-white text-[#3d434f] hover:border-[#00bbb1]'
      }`}
    >
      {children}
      {compte != null && compte > 0 && (
        <span className={`text-[11px] font-bold rounded-full px-1.5 ${actif ? 'bg-white/25 text-white' : 'bg-[#e3f6f4] text-[#00665f]'}`}>{compte}</span>
      )}
    </button>
  )
}

export function Champ({ label, valeur }) {
  return (
    <div className="min-w-0">
      <p className="m-0 text-xs text-[#5b616e]">{label}</p>
      <p className="m-0 mt-0.5 text-[13px] font-bold break-words">{valeur || 'non renseigné'}</p>
    </div>
  )
}
