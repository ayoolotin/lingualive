import { useRef, useState, useCallback, useEffect } from 'react'
import type { Language, TtsPlaybackState, TtsTimingMetrics } from '../types'

const TTS_WS_URL = 'wss://tts.us.assemblyai.com/v1/ws'
const DEFAULT_VOICE_ID = 'aai-jane'
const SAMPLE_RATE = 24_000

const LANGUAGE_TO_TTS: Record<Language, string> = {
  es: 'spanish',
  fr: 'french',
  de: 'german',
  it: 'italian',
}

export interface UseTextToSpeechReturn {
  activePhraseId: string | null
  playbackState: TtsPlaybackState
  errorMessage: string | null
  metrics: TtsTimingMetrics | null
  speak: (phraseId: string, phrase: string, language: Language) => Promise<void>
  stop: () => void
}

/**
 * Decodes a base64-encoded PCM signed 16-bit little-endian string
 * into a Float32Array suitable for Web Audio API.
 */
function decodePcmBase64(base64: string): Float32Array {
  const binaryString = atob(base64)
  const len = binaryString.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  // 16-bit samples (2 bytes per sample)
  const int16 = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2))
  const float32 = new Float32Array(int16.length)
  for (let i = 0; i < int16.length; i++) {
    const s = int16[i]
    float32[i] = s < 0 ? s / 0x8000 : s / 0x7fff
  }
  return float32
}

export function useTextToSpeech(): UseTextToSpeechReturn {
  const [activePhraseId, setActivePhraseId] = useState<string | null>(null)
  const [playbackState, setPlaybackState] = useState<TtsPlaybackState>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [metrics, setMetrics] = useState<TtsTimingMetrics | null>(null)

  const audioContextRef = useRef<AudioContext | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([])
  const nextStartTimeRef = useRef<number>(0)
  const completionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timingRef = useRef<TtsTimingMetrics | null>(null)

  // Clean up all resources
  const stop = useCallback(() => {
    // 1. Clear completion timer
    if (completionTimerRef.current) {
      clearTimeout(completionTimerRef.current)
      completionTimerRef.current = null
    }

    // 2. Stop all scheduled audio source nodes
    for (const source of activeSourcesRef.current) {
      try {
        source.stop()
        source.disconnect()
      } catch {
        // ignore already stopped
      }
    }
    activeSourcesRef.current = [];

    // 3. Close active WebSocket session cleanly
    if (wsRef.current) {
      const ws = wsRef.current
      wsRef.current = null
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'Cancel' }))
          ws.send(JSON.stringify({ type: 'Terminate' }))
          ws.close()
        }
      } catch {
        // ignore
      }
    }

    // 4. Reset audio schedule cursor
    nextStartTimeRef.current = 0

    setActivePhraseId(null)
    setPlaybackState('idle')
  }, [])

  // Auto cleanup on unmount
  useEffect(() => {
    return () => {
      stop()
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {/* ignore */})
      }
    }
  }, [stop])

  const speak = useCallback(
    async (phraseId: string, phrase: string, language: Language) => {
      const trimmedPhrase = phrase.trim()
      if (!trimmedPhrase) return

      // If another phrase or current phrase is active, stop it first
      stop()

      setActivePhraseId(phraseId)
      setPlaybackState('loading')
      setErrorMessage(null)

      const requestInitiatedMs = performance.now()
      const currentTiming: TtsTimingMetrics = { requestInitiatedMs }
      timingRef.current = currentTiming
      setMetrics(currentTiming)

      // 1. Initialise / resume Web AudioContext
      let ctx = audioContextRef.current
      if (!ctx || ctx.state === 'closed') {
        ctx = new (window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)({
          sampleRate: SAMPLE_RATE,
        })
        audioContextRef.current = ctx
      }
      if (ctx.state === 'suspended') {
        await ctx.resume()
      }
      nextStartTimeRef.current = ctx.currentTime

      // 2. Fetch fresh temporary TTS token from backend
      let token: string
      try {
        const tokenRes = await fetch('/api/assemblyai/tts-token')
        if (!tokenRes.ok) {
          let errText = `Token service error (${tokenRes.status})`
          try {
            const errJson = (await tokenRes.json()) as { error?: string }
            if (errJson.error) errText = errJson.error
          } catch {
            // ignore
          }
          throw new Error(errText)
        }
        const tokenData = (await tokenRes.json()) as { token?: string }
        if (!tokenData.token) throw new Error('No TTS token returned from server')
        token = tokenData.token
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not obtain TTS authorization'
        setErrorMessage(msg)
        setPlaybackState('error')
        setActivePhraseId(null)
        return
      }

      // 3. Connect to AssemblyAI TTS WebSocket
      const ttsLang = LANGUAGE_TO_TTS[language] || 'spanish'
      const encodedToken = encodeURIComponent(token)
      const wsUrl = `${TTS_WS_URL}?token=${encodedToken}&voice_id=${DEFAULT_VOICE_ID}&language=${ttsLang}&sample_rate=${SAMPLE_RATE}`

      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      let hasReceivedFirstAudio = false

      ws.onopen = () => {
        // Wait for Begin event before sending Generate
      }

      ws.onmessage = (event) => {
        if (typeof event.data !== 'string') return

        let parsed: {
          type?: string
          audio?: string
          audio_duration_ms?: number
          message?: string
          error?: string
        }
        try {
          parsed = JSON.parse(event.data)
        } catch {
          return
        }

        switch (parsed.type) {
          case 'Begin': {
            // Session established — send phrase to synthesize
            ws.send(
              JSON.stringify({
                type: 'Generate',
                text: trimmedPhrase,
              }),
            )
            ws.send(
              JSON.stringify({
                type: 'Flush',
              }),
            )
            break
          }

          case 'Audio': {
            if (!parsed.audio) break

            const nowMs = performance.now()
            if (!hasReceivedFirstAudio) {
              hasReceivedFirstAudio = true
              currentTiming.firstAudioReceivedMs = nowMs
              currentTiming.timeToFirstAudioMs = Math.round(nowMs - currentTiming.requestInitiatedMs)
              setMetrics({ ...currentTiming })
            }

            // Decode base64 PCM s16le to Float32
            const float32Samples = decodePcmBase64(parsed.audio)
            if (float32Samples.length === 0) break

            // Create AudioBuffer
            const audioBuffer = ctx!.createBuffer(1, float32Samples.length, SAMPLE_RATE)
            audioBuffer.getChannelData(0).set(float32Samples)

            // Schedule audio chunk gaplessly
            const now = ctx!.currentTime
            const startTime = Math.max(now, nextStartTimeRef.current)
            const source = ctx!.createBufferSource()
            source.buffer = audioBuffer
            source.connect(ctx!.destination)
            source.start(startTime)

            if (!currentTiming.firstAudioPlayedMs) {
              currentTiming.firstAudioPlayedMs = performance.now()
              setMetrics({ ...currentTiming })
            }

            activeSourcesRef.current.push(source)
            nextStartTimeRef.current = startTime + audioBuffer.duration
            setPlaybackState('playing')
            break
          }

          case 'FlushDone': {
            // All audio sent from server. Schedule completion when last buffer finishes
            const remainingAudioSeconds = Math.max(0, nextStartTimeRef.current - ctx!.currentTime)
            const remainingMs = Math.ceil(remainingAudioSeconds * 1000) + 150

            completionTimerRef.current = setTimeout(() => {
              const completedMs = performance.now()
              currentTiming.playbackCompletedMs = completedMs
              if (currentTiming.firstAudioPlayedMs) {
                currentTiming.totalPlaybackTimeMs = Math.round(
                  completedMs - currentTiming.firstAudioPlayedMs,
                )
              }
              setMetrics({ ...currentTiming })
              setPlaybackState('idle')
              setActivePhraseId(null)

              // Gracefully close WebSocket
              try {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: 'Terminate' }))
                  ws.close()
                }
              } catch {
                // ignore
              }
              wsRef.current = null
            }, remainingMs)
            break
          }

          case 'Error': {
            const err = parsed.message || parsed.error || 'TTS synthesis error'
            setErrorMessage(err)
            setPlaybackState('error')
            stop()
            break
          }
        }
      }

      ws.onerror = () => {
        setErrorMessage('TTS connection error')
        setPlaybackState('error')
        stop()
      }

      ws.onclose = (event) => {
        if (event.code !== 1000 && event.code !== 1005) {
          if (!hasReceivedFirstAudio) {
            setErrorMessage(`TTS disconnected (code ${event.code})`)
            setPlaybackState('error')
            setActivePhraseId(null)
          }
        }
      }
    },
    [stop],
  )

  return {
    activePhraseId,
    playbackState,
    errorMessage,
    metrics,
    speak,
    stop,
  }
}
