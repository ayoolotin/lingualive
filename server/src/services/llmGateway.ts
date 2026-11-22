export interface TutorBreakdownItem {
  term: string
  meaning: string
}

export interface TutorResponseData {
  phrase: string
  meaning: string
  breakdown: TutorBreakdownItem[]
  pronunciation: string
  usageTip: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface TutorRequest {
  targetLanguage: string
  messages: ChatMessage[]
}

const SUPPORTED_LANGUAGES = ['Spanish', 'French', 'German', 'Italian'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

const LLM_GATEWAY_URL = 'https://llm-gateway.assemblyai.com/v1/chat/completions'
const DEFAULT_MODEL = 'gpt-4.1'
const FALLBACK_MODEL = 'qwen3.5-4b-32k-fast'
const REQUEST_TIMEOUT_MS = 30_000
const MAX_MESSAGE_LENGTH = 1_000
const MAX_HISTORY_MESSAGES = 10

/**
 * Normalises and validates the target language.
 */
export function validateTargetLanguage(lang: unknown): SupportedLanguage {
  if (typeof lang !== 'string') {
    throw new Error('Target language must be a string')
  }
  const match = SUPPORTED_LANGUAGES.find(
    (l) => l.toLowerCase() === lang.trim().toLowerCase(),
  )
  if (!match) {
    throw new Error(
      `Unsupported target language: "${lang}". Supported languages are: ${SUPPORTED_LANGUAGES.join(', ')}`,
    )
  }
  return match
}

/**
 * Validates conversation messages from the client.
 */
export function validateMessages(messages: unknown): ChatMessage[] {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('Messages must be a non-empty array')
  }

  const validMessages: ChatMessage[] = []
  for (const m of messages) {
    if (!m || typeof m !== 'object') {
      throw new Error('Each message must be an object')
    }
    const role = (m as { role?: unknown }).role
    const content = (m as { content?: unknown }).content

    if (role !== 'user' && role !== 'assistant') {
      throw new Error(`Invalid message role "${role}". Only "user" and "assistant" are accepted`)
    }
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('Message content must be a non-empty string')
    }
    if (content.length > MAX_MESSAGE_LENGTH) {
      throw new Error(`Message content exceeds maximum allowed length of ${MAX_MESSAGE_LENGTH} characters`)
    }
    validMessages.push({ role, content: content.trim() })
  }

  // Ensure last message is from user
  if (validMessages[validMessages.length - 1].role !== 'user') {
    throw new Error('The final message must be from the user')
  }

  // Cap at the most recent 10 messages
  return validMessages.slice(-MAX_HISTORY_MESSAGES)
}

/**
 * Builds the strict, pedagogical system prompt for the tutor.
 */
export function buildSystemPrompt(targetLanguage: SupportedLanguage): string {
  return `You are LinguaLive, a patient, encouraging, and practical language tutor.
The user is learning ${targetLanguage}.
Your job is to help them communicate naturally and confidently in everyday situations.

For every response, you MUST output a valid JSON object strictly matching this schema:
{
  "phrase": "The natural translation or response in ${targetLanguage}",
  "meaning": "Clear English meaning of the phrase",
  "breakdown": [
    { "term": "word or short component", "meaning": "English meaning" }
  ],
  "pronunciation": "Easy-to-follow English phonetic approximation (e.g. kee-see-EH-rah)",
  "usageTip": "One practical usage note, cultural context, or register guidance"
}

Pedagogical rules:
1. Provide the most natural, authentic expression in ${targetLanguage} for spoken conversation.
2. Distinguish between literal translations and how native speakers actually speak.
3. Keep the pronunciation guide intuitive for English speakers using hyphens and capitalization for stressed syllables.
4. Provide a word-by-word or constituent breakdown so the learner understands sentence anatomy.
5. If the learner made a mistake or used awkward phrasing in ${targetLanguage}, constructively correct it in the breakdown or usageTip.
6. If the user asks something unrelated to language learning, answer briefly while teaching a relevant ${targetLanguage} phrase and gently guide them back to language learning.
7. Return ONLY valid JSON. Do not wrap in markdown quotes or extra prose.`
}

/**
 * Extracts and parses the structured JSON tutor response.
 */
export function parseTutorResponse(rawContent: string): TutorResponseData {
  const cleaned = rawContent.trim()
  if (!cleaned) {
    throw new TutorResponseValidationError('The Gateway returned an empty tutor response')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    throw new TutorResponseValidationError(
      'The Gateway returned invalid JSON for the tutor response',
    )
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new TutorResponseValidationError(
      'The Gateway tutor response must be a JSON object',
    )
  }

  const obj = parsed as Record<string, unknown>
  const fields: Array<keyof TutorResponseData> = [
    'phrase',
    'meaning',
    'pronunciation',
    'usageTip',
  ]
  const strings: Record<string, string> = {}
  for (const field of fields) {
    const value = obj[field]
    if (typeof value !== 'string' || !value.trim()) {
      throw new TutorResponseValidationError(
        `The Gateway tutor response has missing or invalid "${field}"`,
      )
    }
    strings[field] = value.trim()
  }

  if (!Array.isArray(obj.breakdown) || obj.breakdown.length === 0) {
    throw new TutorResponseValidationError(
      'The Gateway tutor response has missing or empty "breakdown"',
    )
  }

  const breakdown: TutorBreakdownItem[] = []
  for (let index = 0; index < obj.breakdown.length; index++) {
    const item = obj.breakdown[index]
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new TutorResponseValidationError(
        `The Gateway tutor response has an invalid "breakdown" entry at index ${index}`,
      )
    }
    const record = item as Record<string, unknown>
    if (typeof record.term !== 'string' || !record.term.trim()) {
      throw new TutorResponseValidationError(
        `The Gateway tutor response has missing or invalid "breakdown.term" at index ${index}`,
      )
    }
    if (typeof record.meaning !== 'string' || !record.meaning.trim()) {
      throw new TutorResponseValidationError(
        `The Gateway tutor response has missing or invalid "breakdown.meaning" at index ${index}`,
      )
    }
    breakdown.push({
      term: record.term.trim(),
      meaning: record.meaning.trim(),
    })
  }

  return {
    phrase: strings.phrase,
    meaning: strings.meaning,
    breakdown,
    pronunciation: strings.pronunciation,
    usageTip: strings.usageTip,
  }
}

export class TutorResponseValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TutorResponseValidationError'
  }
}

/**
 * Sends a chat completion payload to AssemblyAI's LLM Gateway.
 */
async function callLlmGateway(apiKey: string, model: string, systemPrompt: string, messages: ChatMessage[]) {
  const payload = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
    temperature: 0.3,
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    return await fetch(LLM_GATEWAY_URL, {
      method: 'POST',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Sends conversation to AssemblyAI's LLM Gateway and returns structured tutor response.
 */
export async function requestTutorResponse(
  apiKey: string,
  targetLanguage: SupportedLanguage,
  messages: ChatMessage[],
): Promise<TutorResponseData> {
  const preferredModel = process.env.ASSEMBLYAI_LLM_MODEL?.trim() || DEFAULT_MODEL
  const systemPrompt = buildSystemPrompt(targetLanguage)

  let upstreamResponse: Response
  try {
    upstreamResponse = await callLlmGateway(apiKey, preferredModel, systemPrompt, messages)
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      const error = new Error('LLM Gateway request timed out')
      ;(error as unknown as { status: number }).status = 504
      throw error
    }
    const error = new Error(`Network error contacting LLM Gateway: ${(err as Error).message}`)
    ;(error as unknown as { status: number }).status = 502
    throw error
  }

  // Handle upstream error
  if (!upstreamResponse.ok) {
    let errorDetail = `Status ${upstreamResponse.status}`
    let isAccessError = false

    try {
      const errBody = (await upstreamResponse.json()) as {
        error?: { message?: string } | string
        metadata?: { errors?: string[] }
        message?: string
      }
      if (errBody.metadata?.errors?.length) {
        errorDetail = errBody.metadata.errors.join('; ')
        if (errorDetail.includes('does not have access to this LLM Gateway model')) {
          isAccessError = true
        }
      } else if (typeof errBody.error === 'string') {
        errorDetail = errBody.error
      } else if (errBody.error?.message) {
        errorDetail = errBody.error.message
      } else if (errBody.message) {
        errorDetail = errBody.message
      }
    } catch {
      // ignore json parse error
    }

    // If account doesn't have access to the preferred model, automatically try the accessible fallback model
    if (isAccessError && preferredModel !== FALLBACK_MODEL) {
      console.warn(`[LLM Gateway] Model "${preferredModel}" not accessible on this account. Falling back to "${FALLBACK_MODEL}".`)
      try {
        upstreamResponse = await callLlmGateway(apiKey, FALLBACK_MODEL, systemPrompt, messages)
      } catch (err) {
        const error = new Error(`Fallback LLM Gateway call failed: ${(err as Error).message}`)
        ;(error as unknown as { status: number }).status = 502
        throw error
      }
    }

    // Re-check response status after fallback
    if (!upstreamResponse.ok) {
      const error = new Error(
        upstreamResponse.status === 401 || upstreamResponse.status === 403
          ? 'AssemblyAI LLM Gateway authentication failed. Please verify your API key.'
          : upstreamResponse.status === 429
            ? 'AssemblyAI LLM Gateway rate limit reached. Please wait a moment before asking again.'
            : `AssemblyAI LLM Gateway error: ${errorDetail}`,
      )
      ;(error as unknown as { status: number }).status =
        upstreamResponse.status >= 400 && upstreamResponse.status < 500
          ? upstreamResponse.status
          : 502
      throw error
    }
  }

  let data: unknown
  try {
    data = await upstreamResponse.json()
  } catch {
    const error = new Error('Invalid JSON response from LLM Gateway')
    ;(error as unknown as { status: number }).status = 502
    throw error
  }

  const content = (data as { choices?: Array<{ message?: { content?: string } }> })
    ?.choices?.[0]?.message?.content

  if (typeof content !== 'string' || !content.trim()) {
    const error = new Error('Empty completion received from LLM Gateway')
    ;(error as unknown as { status: number }).status = 502
    throw error
  }

  try {
    return parseTutorResponse(content)
  } catch (err) {
    if (err instanceof TutorResponseValidationError) {
      const error = new Error('The LLM Gateway returned an invalid tutor response')
      ;(error as unknown as { status: number }).status = 502
      throw error
    }
    throw err
  }
}
