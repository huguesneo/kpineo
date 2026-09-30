// Terminal de paiement Moneris : caché tant que VITE_TERMINAL_MONERIS n'est pas « true »
export const TERMINAL_ENABLED = import.meta.env.VITE_TERMINAL_MONERIS === 'true'
