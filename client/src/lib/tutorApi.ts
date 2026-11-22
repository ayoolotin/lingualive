import type { TutorResponseData } from '../types'

export interface ApiChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export async function fetchTutorResponse(
  targetLanguage: string,
  messages: ApiChatMessage[],
): Promise<TutorResponseData> {
  const response = await fetch('/api/tutor/respond', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      targetLanguage,
      messages,
    }),
  })

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new Error(`Failed to parse tutor response (${response.status})`)
  }

  if (!response.ok) {
    const errorMsg = (body as { error?: string })?.error || `Tutor service error (${response.status})`
    throw new Error(errorMsg)
  }

  return body as TutorResponseData
}
