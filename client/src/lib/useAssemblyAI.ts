import { useRef, useCallback } from 'react'
import type { AaiEvent, AaiTurnEvent } from './assemblyaiTypes'
import { FinalTurnDeduplicator } from './finalTurnDeduplicator'
import { SttSessionOwnership } from './sttSessionOwnership'

const AAI_WS_URL = 'wss://streaming.assemblyai.com/v3/ws'
const SAMPLE_RATE = 16_000
const SPEECH_MODEL = 'assemblyai-stt-3-7-realtime-agent'
const TERMINATION_TIMEOUT_MS = 3_000

export type SessionState =
  | 'disconnected'
  | 'connecting'
  | 'listening'
  | 'processing'
  | 'error'

export interface CompletedTurn {
  id: string
  transcript: string
  timestamp: Date
}

export interface UseAssemblyAICallbacks {
  onStateChange: (state: SessionState) => void
  onPartialTranscript: (text: string) => void
  onFinalTurn: (turn: CompletedTurn) => void
  onError: (message: string) => void
}

export interface UseAssemblyAIReturn {
  /**
   * Connect to AssemblyAI Streaming v3 WebSocket using a temporary token from backend.
   * onSessionReady is invoked when the 'Begin' event is received.
   * onCleanup is invoked when the session terminates or errors out.
   */
  connect: (onSessionReady: () => void, onCleanup: () => void) => Promise<void>
  /**
   * Gracefully terminate the streaming session:
   * 1. Send {"type":"Terminate"}
   * 2. Wait for 'Termination' event (or timeout)
   * 3. Close the WebSocket and trigger onCleanup
   */
  disconnect: () => void
  /**
   * Send a binary 16 kHz 16-bit PCM ArrayBuffer chunk over the active WebSocket.
   */
  sendAudio: (pcm: ArrayBuffer) => void
}

export function useAssemblyAI(callbacks: UseAssemblyAICallbacks): UseAssemblyAIReturn {
  const wsRef = useRef<WebSocket | null>(null)
  const onCleanupRef = useRef<(() => void) | null>(null)
  const isTerminatingRef = useRef(false)
  const turnCounterRef = useRef(0)
  const finalTurnDeduplicatorRef = useRef(new FinalTurnDeduplicator())
  const terminationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sessionOwnershipRef = useRef(new SttSessionOwnership())

  /**
   * Request a short-lived temporary token from the backend.
   * The permanent API key remains securely on the server.
   */
  async function fetchToken(): Promise<string> {
    const res = await fetch('/api/assemblyai/token')
    if (!res.ok) {
      let errorMsg = `Server error (${res.status})`
      try {
        const body = (await res.json()) as { error?: string }
        if (body.error) errorMsg = body.error
      } catch {
        // ignore parse error
      }
      throw new Error(errorMsg)
    }

    const data = (await res.json()) as { token?: string }
    if (!data.token) {
      throw new Error('No temporary token received from server')
    }
    return data.token
  }

  const cleanupSession = useCallback((sessionId: number) => {
    if (!sessionOwnershipRef.current.isActive(sessionId)) return false

    if (terminationTimerRef.current) {
      clearTimeout(terminationTimerRef.current)
      terminationTimerRef.current = null
    }

    if (onCleanupRef.current) {
      try {
        onCleanupRef.current()
      } catch {
        // ignore cleanup errors
      }
      onCleanupRef.current = null
    }

    if (wsRef.current) {
      const ws = wsRef.current
      wsRef.current = null
      try {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close()
        }
      } catch {
        // ignore close error
      }
    }

    isTerminatingRef.current = false
    finalTurnDeduplicatorRef.current.reset()
    return true
  }, [])

  const cleanup = useCallback(() => {
    cleanupSession(sessionOwnershipRef.current.activeSessionId)
  }, [cleanupSession])

  const disconnect = useCallback(() => {
    const ws = wsRef.current
    const sessionId = sessionOwnershipRef.current.activeSessionId
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      cleanupSession(sessionId)
      callbacks.onStateChange('disconnected')
      return
    }

    // Set UI to processing while we wait for graceful termination
    callbacks.onStateChange('processing')
    isTerminatingRef.current = true

    // 1. Send WebSocket termination message
    try {
      ws.send(JSON.stringify({ type: 'Terminate' }))
    } catch {
      cleanupSession(sessionId)
      callbacks.onStateChange('disconnected')
      return
    }

    // 2. Safe timeout in case server doesn't respond with Termination
    terminationTimerRef.current = setTimeout(() => {
      cleanupSession(sessionId)
      callbacks.onStateChange('disconnected')
    }, TERMINATION_TIMEOUT_MS)
  }, [callbacks, cleanupSession])

  const sendAudio = useCallback((pcm: ArrayBuffer) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN && !isTerminatingRef.current) {
      try {
        ws.send(pcm)
      } catch (err) {
        console.error('[AssemblyAI] Failed to send audio chunk:', err)
      }
    }
  }, [])

  const connect = useCallback(
    async (onSessionReady: () => void, onCleanup: () => void) => {
      // Clean up any stale connection first
      cleanup()

      const sessionId = sessionOwnershipRef.current.beginSession()
      callbacks.onStateChange('connecting')
      isTerminatingRef.current = false
      turnCounterRef.current = 0
      finalTurnDeduplicatorRef.current.reset()
      onCleanupRef.current = onCleanup

      // 1. Fetch short-lived token from backend
      let token: string
      try {
        token = await fetchToken()
      } catch (err) {
        if (!sessionOwnershipRef.current.isActive(sessionId)) return
        const message = err instanceof Error ? err.message : 'Failed to obtain AssemblyAI token'
        callbacks.onError(message)
        cleanupSession(sessionId)
        callbacks.onStateChange('error')
        return
      }

      if (!sessionOwnershipRef.current.isActive(sessionId)) return

      // 2. Connect to AssemblyAI Streaming v3 WebSocket
      const encodedModel = encodeURIComponent(SPEECH_MODEL)
      const encodedToken = encodeURIComponent(token)
      const wsUrl = `${AAI_WS_URL}?sample_rate=${SAMPLE_RATE}&speech_model=${encodedModel}&token=${encodedToken}`

      const ws = new WebSocket(wsUrl)
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      ws.onmessage = (event) => {
        if (
          wsRef.current !== ws ||
          !sessionOwnershipRef.current.isActive(sessionId)
        ) {
          if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close()
          }
          return
        }

        let parsed: AaiEvent
        try {
          parsed = JSON.parse(event.data as string) as AaiEvent
        } catch {
          return // Ignore non-JSON messages
        }

        switch (parsed.type) {
          case 'Begin': {
            // Connection/session has started — now begin sending audio
            callbacks.onStateChange('listening')
            try {
              onSessionReady()
            } catch (err) {
              callbacks.onError('Failed to start audio streaming')
              disconnect()
            }
            break
          }

          case 'SpeechStarted': {
            // Speech detected
            break
          }

          case 'Turn': {
            const turn = parsed as AaiTurnEvent
            const text = turn.transcript?.trim()
            if (!text) break // Ignore empty transcript messages

            if (turn.end_of_turn) {
              // turn_order identifies a Turn in this session. Identical text
              // from a different turn_order is a legitimate repeated utterance.
              if (finalTurnDeduplicatorRef.current.shouldCommit(turn)) {
                const id = `turn-${++turnCounterRef.current}-${Date.now()}`
                callbacks.onFinalTurn({ id, transcript: text, timestamp: new Date() })
              }
              // Clear partial transcript
              callbacks.onPartialTranscript('')
            } else {
              // Mutable partial transcript: replace current value
              callbacks.onPartialTranscript(text)
            }
            break
          }

          case 'Termination': {
            // Session cleanly ended by server
            callbacks.onPartialTranscript('')
            cleanupSession(sessionId)
            callbacks.onStateChange('disconnected')
            break
          }

          case 'Error': {
            const errorMsg = parsed.error || 'AssemblyAI streaming error'
            callbacks.onError(errorMsg)
            cleanupSession(sessionId)
            callbacks.onStateChange('error')
            break
          }
        }
      }

      ws.onerror = () => {
        if (
          wsRef.current !== ws ||
          !sessionOwnershipRef.current.isActive(sessionId)
        ) {
          if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close()
          }
          return
        }
        if (!isTerminatingRef.current) {
          callbacks.onError('WebSocket connection error with AssemblyAI')
          callbacks.onStateChange('error')
        }
        cleanupSession(sessionId)
      }

      ws.onclose = (event) => {
        if (
          wsRef.current !== ws ||
          !sessionOwnershipRef.current.isActive(sessionId)
        ) {
          return
        }
        if (!isTerminatingRef.current && event.code !== 1000) {
          callbacks.onError(`AssemblyAI connection closed (code ${event.code})`)
          callbacks.onStateChange('error')
        }
        cleanupSession(sessionId)
        if (!isTerminatingRef.current) {
          callbacks.onStateChange('disconnected')
        }
      }
    },
    [callbacks, cleanup, cleanupSession, disconnect],
  )

  return { connect, disconnect, sendAudio }
}
