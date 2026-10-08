export type SavePageTemplateParams = {
  name: string
  template_type: 'daily' | 'weekly_left' | 'weekly_right' | 'monthly' | 'extra'
  is_default: boolean
  user_id: string
  planner_id: string
  content: any
}

const BASE = (import.meta as any).env?.VITE_BACKEND_URL || ''

export async function savePageTemplate(params: SavePageTemplateParams) {
  const res = await fetch(`${BASE}/page_templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `HTTP ${res.status}`)
  }
  return res.json().catch(() => ({}))
}
