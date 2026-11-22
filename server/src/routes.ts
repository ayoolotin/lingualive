import { Router, Request, Response } from 'express'
import {
  validateTargetLanguage,
  validateMessages,
  requestTutorResponse,
} from './services/llmGateway'

export const router = Router()

const AAI_TOKEN_URL = 'https://streaming.assemblyai.com/v3/token?expires_in_seconds=60'
const AAI_TTS_TOKEN_URL = 'https://token.assemblyai.com/v1/token'

/**
 * GET /api/health
 * Basic health-check — confirms the server is running.
 */
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'lingualive-server',
    timestamp: new Date().toISOString(),
  })
})

/**
 * GET /api/assemblyai/token
 * Exchanges the server-side permanent API key for a short-lived (60 s) streaming
 * token and returns that token to the browser. The permanent key is never sent
 * to the client.
 */
router.get('/assemblyai/token', async (_req: Request, res: Response) => {
  const apiKey = process.env.ASSEMBLYAI_API_KEY?.trim()

  if (!apiKey || apiKey === 'your_assemblyai_api_key_here' || apiKey === 'YOUR_ACTUAL_API_KEY') {
    res.status(503).json({
      error: 'AssemblyAI API key is not configured on the server.',
    })
    return
  }

  let upstream: Response | globalThis.Response
  try {
    upstream = await fetch(AAI_TOKEN_URL, {
      method: 'GET',
      headers: {
        // AssemblyAI uses the raw key — no "Bearer" prefix
        Authorization: apiKey,
      },
    })
  } catch (err) {
    console.error('[assemblyai/token] Network error reaching AssemblyAI:', (err as Error).message)
    res.status(502).json({ error: 'Could not reach AssemblyAI token service.' })
    return
  }

  if (!upstream.ok) {
    console.error('[assemblyai/token] AssemblyAI returned', upstream.status)
    res.status(502).json({ error: `AssemblyAI token service returned ${upstream.status}.` })
    return
  }

  let body: unknown
  try {
    body = await upstream.json()
  } catch {
    res.status(502).json({ error: 'Invalid response from AssemblyAI token service.' })
    return
  }

  const token = (body as Record<string, unknown>)?.token
  if (typeof token !== 'string' || !token) {
    res.status(502).json({ error: 'AssemblyAI token service returned an unexpected payload.' })
    return
  }

  // Return only the token — never the API key
  res.json({ token })
})

/**
 * GET /api/assemblyai/tts-token
 * Generates a short-lived (60 s) temporary token specifically scoped for
 * AssemblyAI Text-to-Speech (TTS).
 */
router.get('/assemblyai/tts-token', async (_req: Request, res: Response) => {
  const apiKey = process.env.ASSEMBLYAI_API_KEY?.trim()

  if (!apiKey || apiKey === 'your_assemblyai_api_key_here' || apiKey === 'YOUR_ACTUAL_API_KEY') {
    res.status(503).json({
      error: 'AssemblyAI API key is not configured on the server.',
    })
    return
  }

  let upstream: Response | globalThis.Response
  try {
    upstream = await fetch(AAI_TTS_TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        expires_in_seconds: 60,
        product: 'tts',
      }),
    })
  } catch (err) {
    console.error('[assemblyai/tts-token] Network error reaching AssemblyAI token service:', (err as Error).message)
    res.status(502).json({ error: 'Could not reach AssemblyAI TTS token service.' })
    return
  }

  if (!upstream.ok) {
    console.error('[assemblyai/tts-token] AssemblyAI returned', upstream.status)
    res.status(502).json({ error: `AssemblyAI TTS token service returned ${upstream.status}.` })
    return
  }

  let body: unknown
  try {
    body = await upstream.json()
  } catch {
    res.status(502).json({ error: 'Invalid response from AssemblyAI TTS token service.' })
    return
  }

  const token = (body as Record<string, unknown>)?.token
  if (typeof token !== 'string' || !token) {
    res.status(502).json({ error: 'AssemblyAI TTS token service returned an unexpected payload.' })
    return
  }

  res.json({ token })
})

/**
 * POST /api/tutor/respond
 * Receives the conversation history and target language, and queries AssemblyAI's
 * LLM Gateway to generate an educational tutor response.
 */
router.post('/tutor/respond', async (req: Request, res: Response) => {
  const apiKey = process.env.ASSEMBLYAI_API_KEY?.trim()

  if (!apiKey || apiKey === 'your_assemblyai_api_key_here' || apiKey === 'YOUR_ACTUAL_API_KEY') {
    res.status(503).json({
      error: 'AssemblyAI API key is not configured on the server.',
    })
    return
  }

  // 1. Validate request body
  if (!req.body || typeof req.body !== 'object') {
    res.status(400).json({ error: 'Request body must be a JSON object.' })
    return
  }

  let targetLanguage
  try {
    targetLanguage = validateTargetLanguage(req.body.targetLanguage)
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
    return
  }

  let messages
  try {
    messages = validateMessages(req.body.messages)
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
    return
  }

  // 2. Call LLM Gateway
  try {
    const tutorResponse = await requestTutorResponse(apiKey, targetLanguage, messages)
    res.json(tutorResponse)
  } catch (err: unknown) {
    const error = err as { status?: number; message?: string }
    const status = typeof error.status === 'number' && error.status >= 400 && error.status < 600
      ? error.status
      : 500
    res.status(status).json({
      error: error.message || 'Failed to generate tutor response.',
    })
  }
})
