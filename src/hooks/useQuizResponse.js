import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Field definitions — keys match quiz_responses DB columns
export const QUIZ_FIELDS = [
  { key: 'questionnaire_sexe',       label: 'Quel est ton sexe biologique ?' },
  { key: 'questionnaire_age',        label: 'Quel est ton âge ?' },
  { key: 'questionnaire_energie',    label: "Comment décris-tu ton niveau d'énergie au quotidien ?" },
  { key: 'questionnaire_stockage',   label: 'Où ton corps a-t-il tendance à stocker davantage ?' },
  { key: 'questionnaire_ventre',     label: 'Comment ton ventre se comporte-t-il ?' },
  { key: 'questionnaire_symptomes',  label: 'As-tu remarqué ces signes silencieux ?' },
  { key: 'questionnaire_objectifs',  label: "Qu'est-ce qui changerait dans ta vie si ton métabolisme fonctionnait à 100% ?" },
  { key: 'questionnaire_motivation', label: 'Ta motivation profonde' },
  { key: 'questionnaire_engagement', label: "Ton niveau d'engagement (1 à 10)" },
]

export function getQuizField(quiz, key) {
  if (!quiz) return null
  const val = quiz[key]
  if (val == null || String(val).trim() === '') return null
  return String(val)
}

export function isQuizCompleted(quiz) {
  if (!quiz) return false
  return QUIZ_FIELDS.some(f => {
    const v = quiz[f.key]
    return v != null && String(v).trim().length > 0
  })
}

// Load quiz response from Supabase by contact email
export function useQuizResponseByEmail(email) {
  const [quiz, setQuiz]       = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!email) { setLoading(false); return }
    setLoading(true)
    supabase
      .from('quiz_responses')
      .select('*')
      .ilike('email', email.trim())
      .maybeSingle()
      .then(({ data }) => {
        setQuiz(data)
        setLoading(false)
      })
  }, [email])

  return { quiz, loading }
}
