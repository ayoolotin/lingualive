import path from 'path'
import dotenv from 'dotenv'
import express from 'express'
import { router } from './routes'

dotenv.config({ path: path.resolve(__dirname, '..', '.env') })

const app = express()
app.use(express.json())
app.use('/api', router)

async function runEndpointTests() {
  console.log('--- 4. HTTP Endpoint Validation Tests ---')

  const server = app.listen(0)
  const port = (server.address() as { port: number }).port
  const baseUrl = `http://127.0.0.1:${port}/api`

  let testsPassed = 0
  let testsTotal = 0

  function assertHttp(name: string, ok: boolean, detail?: string) {
    testsTotal++
    if (ok) {
      testsPassed++
      console.log(`PASS: ${name}`)
    } else {
      console.error(`FAIL: ${name}${detail ? ` (${detail})` : ''}`)
    }
  }

  try {
    // 1. Health check
    const healthRes = await fetch(`${baseUrl}/health`)
    assertHttp('GET /api/health returns 200', healthRes.status === 200)

    // 2. Unsupported language -> 400
    const badLangRes = await fetch(`${baseUrl}/tutor/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetLanguage: 'Japanese',
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    })
    const badLangBody = (await badLangRes.json()) as { error?: string }
    assertHttp(
      'POST /api/tutor/respond rejects unsupported language with 400',
      badLangRes.status === 400 && typeof badLangBody.error === 'string',
    )

    // 3. Missing messages array -> 400
    const emptyMsgRes = await fetch(`${baseUrl}/tutor/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetLanguage: 'Spanish',
        messages: [],
      }),
    })
    assertHttp('POST /api/tutor/respond rejects empty messages with 400', emptyMsgRes.status === 400)

    // 4. Invalid role -> 400
    const badRoleRes = await fetch(`${baseUrl}/tutor/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetLanguage: 'Spanish',
        messages: [{ role: 'admin', content: 'test' }],
      }),
    })
    assertHttp('POST /api/tutor/respond rejects invalid role with 400', badRoleRes.status === 400)

    // 5. Empty body -> 400
    const emptyBodyRes = await fetch(`${baseUrl}/tutor/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    assertHttp('POST /api/tutor/respond rejects empty object body with 400', emptyBodyRes.status === 400)

    // 6. STT Token check
    const sttTokenRes = await fetch(`${baseUrl}/assemblyai/token`)
    const sttTokenJson = (await sttTokenRes.json()) as { token?: string }
    assertHttp(
      'GET /api/assemblyai/token returns valid STT token',
      sttTokenRes.status === 200 && typeof sttTokenJson.token === 'string',
    )

    // 7. TTS Token check
    const ttsTokenRes = await fetch(`${baseUrl}/assemblyai/tts-token`)
    const ttsTokenJson = (await ttsTokenRes.json()) as { token?: string }
    assertHttp(
      'GET /api/assemblyai/tts-token returns valid TTS token',
      ttsTokenRes.status === 200 && typeof ttsTokenJson.token === 'string' && ttsTokenJson.token.length > 50,
    )
    assertHttp(
      'TTS token is separate and distinct from STT token',
      Boolean(ttsTokenJson.token && sttTokenJson.token && ttsTokenJson.token !== sttTokenJson.token),
    )

    // 8. Live LLM Gateway test if API key is configured
    console.log('\n--- 5. Live LLM Gateway Verification ---')
    const key = process.env.ASSEMBLYAI_API_KEY?.trim()
    const isConfigured = key && key !== 'your_assemblyai_api_key_here' && key !== 'YOUR_ACTUAL_API_KEY'

    if (isConfigured) {
      console.log('Testing genuine LLM Gateway request with configured ASSEMBLYAI_API_KEY...')
      const liveRes = await fetch(`${baseUrl}/tutor/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetLanguage: 'Spanish',
          messages: [{ role: 'user', content: 'How do I say I would like a coffee with milk?' }],
        }),
      })

      const liveJson = (await liveRes.json()) as Record<string, unknown>
      const statusOk = liveRes.status === 200
      const hasPhrase = typeof liveJson.phrase === 'string' && liveJson.phrase.length > 0
      const hasMeaning = typeof liveJson.meaning === 'string' && liveJson.meaning.length > 0
      const hasPronunciation = typeof liveJson.pronunciation === 'string' && liveJson.pronunciation.length > 0
      const hasBreakdown = Array.isArray(liveJson.breakdown) && liveJson.breakdown.length > 0

      assertHttp(
        'Live AssemblyAI LLM Gateway returned structured tutor response (200)',
        statusOk && hasPhrase && hasMeaning && hasPronunciation && hasBreakdown,
        `Status: ${liveRes.status}, phrase: ${liveJson.phrase ? 'OK' : 'MISSING'}`,
      )

      // 9. Live TTS synthesis test for all 4 languages
      console.log('\n--- 6. Live AssemblyAI TTS WebSocket Verification ---')
      const ttsLanguages = [
        { name: 'Spanish', code: 'spanish', phrase: 'Me gustaría un café con leche.' },
        { name: 'French', code: 'french', phrase: 'Je voudrais un café au lait.' },
        { name: 'German', code: 'german', phrase: 'Ich möchte einen Kaffee mit Milch.' },
        { name: 'Italian', code: 'italian', phrase: 'Vorrei un caffè con latte.' },
      ]

      for (const lang of ttsLanguages) {
        // Fetch fresh token for each test session
        const freshTokenRes = await fetch(`${baseUrl}/assemblyai/tts-token`)
        const tokenData = (await freshTokenRes.json()) as { token: string }

        const wsUrl = `wss://tts.us.assemblyai.com/v1/ws?token=${encodeURIComponent(tokenData.token)}&voice_id=aai-jane&language=${lang.code}&sample_rate=24000`

        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            ws.close()
            reject(new Error(`TTS test timed out for ${lang.name}`))
          }, 15000)

          let audioChunksReceived = 0
          const ws = new WebSocket(wsUrl)

          ws.onmessage = (event) => {
            if (typeof event.data !== 'string') return
            try {
              const msg = JSON.parse(event.data)
              if (msg.type === 'Begin') {
                ws.send(JSON.stringify({ type: 'Generate', text: lang.phrase }))
                ws.send(JSON.stringify({ type: 'Flush' }))
              } else if (msg.type === 'Audio') {
                audioChunksReceived++
              } else if (msg.type === 'FlushDone') {
                clearTimeout(timeout)
                ws.send(JSON.stringify({ type: 'Terminate' }))
                ws.close()
                assertHttp(
                  `Live TTS synthesis succeeded for ${lang.name} (${audioChunksReceived} audio chunks, duration: ${msg.audio_duration_ms}ms)`,
                  audioChunksReceived > 0 && typeof msg.audio_duration_ms === 'number',
                )
                resolve()
              }
            } catch (e) {
              clearTimeout(timeout)
              reject(e)
            }
          }

          ws.onerror = (err) => {
            clearTimeout(timeout)
            reject(err)
          }
        })
      }
    } else {
      console.log('NOTICE: ASSEMBLYAI_API_KEY is not configured with a real key; skipping live network call.')
    }

    console.log(`\nENDPOINT TEST SUMMARY: ${testsPassed}/${testsTotal} passed.`)
  } finally {
    server.close()
  }
}

runEndpointTests().catch((err) => {
  console.error('Test runner encountered error:', err)
  process.exit(1)
})
