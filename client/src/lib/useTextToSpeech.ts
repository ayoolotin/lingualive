import { useRef, useState, useCallback, useEffect } from 'react'
import type { Language, TtsPlaybackState, TtsTimingMetrics } from '../types'

const TTS_WS_URL = 'wss://tts.us.assemblyai.com/v1/ws'
const DEFAULT_VOICE_ID = 'aai-jane'
const TTS_MODEL_ID = 'assemblyai-tts-1'
const TTS_ENCODING = 'pcm_s16le'
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
  let binaryString: string
  try {
    binaryString = atob(base64)
  } catch {
    throw new Error('AssemblyAI returned invalid base64 PCM audio')
  }
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
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set())
  const nextStartTimeRef = useRef<number>(0)
  const completionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timingRef = useRef<TtsTimingMetrics | null>(null)
  const sessionGenerationRef = useRef(0)
  const flushDoneRef = useRef(false)

  const closeAudioContext = useCallback(async () => {
    const ctx = audioContextRef.current
    audioContextRef.current = null
    if (ctx && ctx.state !== 'closed') {
      try {
        await ctx.close()
      } catch {
        // Already closed by the browser.
      }
    }
  }, [])

  // Clean up all resources without changing an existing error message.
  const stop = useCallback(() => {
    sessionGenerationRef.current++
    flushDoneRef.current = false

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
    activeSourcesRef.current.clear()

    // 3. Close active WebSocket session cleanly
    if (wsRef.current) {
      const ws = wsRef.current
      wsRef.current = null
      try {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'Cancel' }))
          ws.send(JSON.stringify({ type: 'Terminate' }))
          }
          ws.close()
        }
      } catch {
        // ignore
      }
    }

    // 4. Reset audio schedule cursor
    nextStartTimeRef.current = 0

    void closeAudioContext()
    setActivePhraseId(null)
    setPlaybackState('idle')
  }, [closeAudioContext])

  // Auto cleanup on unmount
  useEffect(() => {
    return () => {
      stop()
      void closeAudioContext()
    }
  }, [stop, closeAudioContext])

  const speak = useCallback(
    async (phraseId: string, phrase: string, language: Language) => {
      const trimmedPhrase = phrase.trim()
      if (!trimmedPhrase) return

      // If another phrase or current phrase is active, stop it first
      stop()

      const generation = sessionGenerationRef.current
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
        try {
          await ctx.resume()
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Could not start the browser audio context'
          setErrorMessage(msg)
          setPlaybackState('error')
          setActivePhraseId(null)
          return
        }
      }
      if (ctx.state !== 'running') {
        setErrorMessage('Browser audio is suspended. Press Listen again to enable playback.')
        setPlaybackState('error')
        setActivePhraseId(null)
        return
      }
      nextStartTimeRef.current = ctx.currentTime
      if (import.meta.env.DEV) {
        console.debug('[LinguaLive TTS] AudioContext state:', ctx.state, 'sampleRate:', ctx.sampleRate)
      }

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
      const connectSession = (temporaryToken: string) => {
        const params = new URLSearchParams({
          token: temporaryToken,
          voice_id: DEFAULT_VOICE_ID,
          model_id: TTS_MODEL_ID,
          language: ttsLang,
          sample_rate: String(SAMPLE_RATE),
          encoding: TTS_ENCODING,
        })
        const ws = new WebSocket(`${TTS_WS_URL}?${params}`)
        wsRef.current = ws
        let hasReceivedFirstAudio = false
        let hasRetriedConnection = false
        let playbackCompleted = false

        const completePlayback = () => {
          if (playbackCompleted || sessionGenerationRef.current !== generation) return
          playbackCompleted = true
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
          wsRef.current = null
          try {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'Terminate' }))
            } else {
              ws.close()
            }
          } catch {
            // The context cleanup below still completes locally.
          }
          void closeAudioContext()
          if (import.meta.env.DEV) {
            console.debug('[LinguaLive TTS] Playback completed')
          }
        }

        ws.onopen = () => {
          if (import.meta.env.DEV) {
            console.debug('[LinguaLive TTS] WebSocket connection opened')
          }
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
            if (ctx!.state !== 'running') {
              setErrorMessage('Browser audio stopped. Press Listen again to resume playback.')
              setPlaybackState('error')
              sessionGenerationRef.current++
              ws.close()
              return
            }

            const nowMs = performance.now()
            if (!hasReceivedFirstAudio) {
              hasReceivedFirstAudio = true
              currentTiming.firstAudioReceivedMs = nowMs
              currentTiming.timeToFirstAudioMs = Math.round(nowMs - currentTiming.requestInitiatedMs)
              setMetrics({ ...currentTiming })
              if (import.meta.env.DEV) {
                console.debug('[LinguaLive TTS] First audio message received')
              }
            }

            // Decode base64 PCM s16le to Float32
            let float32Samples: Float32Array
            try {
              float32Samples = decodePcmBase64(parsed.audio)
            } catch (err) {
              const msg = err instanceof Error ? err.message : 'Could not decode TTS PCM audio'
              setErrorMessage(msg)
              setPlaybackState('error')
              setActivePhraseId(null)
              sessionGenerationRef.current++
              ws.close()
              void closeAudioContext()
              break
            }
            if (float32Samples.length === 0) break
            if (import.meta.env.DEV) {
              console.debug('[LinguaLive TTS] Decoded PCM samples:', float32Samples.length, 'sampleRate:', ctx!.sampleRate)
            }

            // Create AudioBuffer
            const audioBuffer = ctx!.createBuffer(1, float32Samples.length, SAMPLE_RATE)
            audioBuffer.getChannelData(0).set(float32Samples)

            // Schedule audio chunk gaplessly
            const now = ctx!.currentTime
            const startTime = Math.max(now, nextStartTimeRef.current)
            const source = ctx!.createBufferSource()
            source.buffer = audioBuffer
            source.connect(ctx!.destination)
            activeSourcesRef.current.add(source)
            source.onended = () => {
              source.disconnect()
              activeSourcesRef.current.delete(source)
              if (
                flushDoneRef.current &&
                activeSourcesRef.current.size === 0 &&
                sessionGenerationRef.current === generation
              ) {
                completePlayback()
              }
            }
            source.start(startTime)

            if (!currentTiming.firstAudioPlayedMs) {
              currentTiming.firstAudioPlayedMs = performance.now()
              setMetrics({ ...currentTiming })
              if (import.meta.env.DEV) {
                console.debug('[LinguaLive TTS] First audio chunk scheduled')
              }
            }

            nextStartTimeRef.current = startTime + audioBuffer.duration
            setPlaybackState('playing')
            break
          }

          case 'FlushDone': {
            flushDoneRef.current = true
            // All audio was delivered to the socket. Finish when the last scheduled buffer ends.
            const remainingAudioSeconds = Math.max(0, nextStartTimeRef.current - ctx!.currentTime)
            const remainingMs = Math.ceil(remainingAudioSeconds * 1000) + 150

            completionTimerRef.current = setTimeout(() => {
              completePlayback()
            }, remainingMs)
            if (import.meta.env.DEV) {
              console.debug('[LinguaLive TTS] FlushDone; scheduled playback remaining:', remainingMs, 'ms')
            }
            break
          }

          case 'Error': {
            const err = parsed.message || parsed.error || 'TTS synthesis error'
            if (import.meta.env.DEV) {
              console.debug('[LinguaLive TTS] Synthesis error:', err)
            }
            setErrorMessage(err)
            setPlaybackState('error')
            setActivePhraseId(null)
            sessionGenerationRef.current++
            wsRef.current = null
            for (const source of activeSourcesRef.current) {
              try { source.stop(); source.disconnect() } catch { /* already stopped */ }
            }
            activeSourcesRef.current.clear()
            void closeAudioContext()
            try { ws.close() } catch { /* already closed */ }
            break
          }
        }
        }

        ws.onerror = () => {
          if (sessionGenerationRef.current !== generation) return
          if (import.meta.env.DEV) {
            console.debug('[LinguaLive TTS] WebSocket error')
          }
          setErrorMessage('TTS connection error')
          setPlaybackState('error')
          setActivePhraseId(null)
          sessionGenerationRef.current++
          wsRef.current = null
          void closeAudioContext()
        }

        ws.onclose = (event) => {
          if (sessionGenerationRef.current !== generation) return
          if (import.meta.env.DEV) {
            console.debug('[LinguaLive TTS] WebSocket closed:', event.code)
          }
          if (event.code === 1000 || event.code === 1005) return

          if (!hasRetriedConnection && (event.code === 1008 || event.code === 3005 || event.code === 1012)) {
            hasRetriedConnection = true
            void fetch('/api/assemblyai/tts-token')
              .then(async (tokenRes) => {
                if (!tokenRes.ok) throw new Error('Could not refresh TTS authorization')
                const tokenData = (await tokenRes.json()) as { token?: string }
                if (!tokenData.token) throw new Error('No refreshed TTS token returned')
                if (sessionGenerationRef.current !== generation) return
                connectSession(tokenData.token)
              })
              .catch((err: unknown) => {
                if (sessionGenerationRef.current !== generation) return
                setErrorMessage(err instanceof Error ? err.message : 'TTS reconnection failed')
                setPlaybackState('error')
                setActivePhraseId(null)
              })
            return
          }

          if (event.code === 1008 && !hasReceivedFirstAudio) {
            setErrorMessage('TTS authorization expired. Please try again.')
          } else if (!flushDoneRef.current) {
            setErrorMessage(`TTS disconnected (code ${event.code})`)
          } else {
            setErrorMessage('TTS playback ended unexpectedly')
          }

          setPlaybackState('error')
          setActivePhraseId(null)
          sessionGenerationRef.current++
          wsRef.current = null
          void closeAudioContext()
        }
      }

      connectSession(token)
    },
    [stop, closeAudioContext],
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
