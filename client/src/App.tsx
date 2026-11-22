import { useState, useCallback, useRef } from 'react'

import { Header } from './components/Header'
import { Footer } from './components/Footer'
import { LanguageSelector } from './components/LanguageSelector'
import { StatusIndicator } from './components/StatusIndicator'
import { MicButton } from './components/MicButton'
import { EmptyState } from './components/EmptyState'
import { ConversationView } from './components/ConversationView'

import { useMicrophone } from './lib/useMicrophone'
import { useAssemblyAI } from './lib/useAssemblyAI'
import { useTextToSpeech } from './lib/useTextToSpeech'
import { fetchTutorResponse, type ApiChatMessage } from './lib/tutorApi'
import type { CompletedTurn, SessionState } from './lib/useAssemblyAI'

import { LANGUAGE_OPTIONS } from './constants'
import type { Language, ConversationExchange } from './types'

function formatMicError(err: string): string {
  switch (err) {
    case 'permission-denied':
      return 'Microphone permission was denied. Please allow microphone access in your browser and try again.'
    case 'not-found':
      return 'No microphone was found. Please connect an audio input device and try again.'
    case 'not-supported':
      return 'Your browser does not support Web Audio Worklets. Please use a modern browser.'
    default:
      return 'Could not access the microphone. Please check your browser and system permissions.'
  }
}

export default function App() {
  const [language, setLanguage] = useState<Language>('es')
  const [sessionStatus, setSessionStatus] = useState<SessionState>('disconnected')
  const [partialTranscript, setPartialTranscript] = useState('')
  const [exchanges, setExchanges] = useState<ConversationExchange[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Guard against rapid duplicate clicks
  const isTransitioning = useRef(false)
  // Track in-flight LLM request IDs to prevent duplicate calls
  const inFlightRequests = useRef<Set<string>>(new Set())
  // Keep track of active session state for post-LLM status restoration
  const isMicActiveRef = useRef(false)

  const mic = useMicrophone()
  const tts = useTextToSpeech()

  /**
   * Dispatches a tutor request to the backend for a given exchange.
   */
  const handleTutorRequest = useCallback(
    async (exchangeId: string, userText: string, currentTargetLang: Language, history: ConversationExchange[]) => {
      if (inFlightRequests.current.has(exchangeId)) return
      inFlightRequests.current.add(exchangeId)

      setSessionStatus('processing')

      const langLabel =
        LANGUAGE_OPTIONS.find((l) => l.code === currentTargetLang)?.label || 'Spanish'

      // Build recent conversation history (up to last 10 messages)
      const chatMessages: ApiChatMessage[] = []
      const previousExchanges = history.filter((e) => e.id !== exchangeId && !e.isLoading)

      for (const prev of previousExchanges) {
        chatMessages.push({ role: 'user', content: prev.userTranscript })
        if (prev.tutorResponse?.phrase) {
          chatMessages.push({
            role: 'assistant',
            content: `${prev.tutorResponse.phrase} (${prev.tutorResponse.meaning})`,
          })
        }
      }

      // Append current message
      chatMessages.push({ role: 'user', content: userText })

      try {
        const responseData = await fetchTutorResponse(langLabel, chatMessages)
        setExchanges((prev) =>
          prev.map((e) =>
            e.id === exchangeId
              ? { ...e, tutorResponse: responseData, isLoading: false, error: undefined }
              : e,
          ),
        )
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Tutor response failed'
        setExchanges((prev) =>
          prev.map((e) =>
            e.id === exchangeId
              ? { ...e, isLoading: false, error: message }
              : e,
          ),
        )
      } finally {
        inFlightRequests.current.delete(exchangeId)
        // Return UI to listening if mic is still on, otherwise disconnected
        setSessionStatus(isMicActiveRef.current ? 'listening' : 'disconnected')
      }
    },
    [],
  )

  const aai = useAssemblyAI({
    onStateChange: useCallback((state: SessionState) => {
      setSessionStatus(state)
      if (state === 'listening') {
        isMicActiveRef.current = true
        isTransitioning.current = false
      } else if (state === 'disconnected' || state === 'error') {
        isMicActiveRef.current = false
        isTransitioning.current = false
      }
      if (state !== 'error') {
        setErrorMessage(null)
      }
    }, []),
    onPartialTranscript: useCallback((text: string) => {
      setPartialTranscript(text)
    }, []),
    onFinalTurn: useCallback(
      (turn: CompletedTurn) => {
        const newExchange: ConversationExchange = {
          id: turn.id,
          userTranscript: turn.transcript,
          timestamp: turn.timestamp,
          targetLanguage: language,
          isLoading: true,
        }

        setExchanges((prev) => {
          const updated = [...prev, newExchange]
          // Trigger LLM request with current history
          handleTutorRequest(turn.id, turn.transcript, language, updated)
          return updated
        })
      },
      [language, handleTutorRequest],
    ),
    onError: useCallback((msg: string) => {
      setErrorMessage(msg)
    }, []),
  })

  async function handleMicClick() {
    if (isTransitioning.current) return

    // If currently listening or processing, stop session
    if (sessionStatus === 'listening' || sessionStatus === 'processing') {
      isMicActiveRef.current = false
      aai.disconnect()
      mic.stop()
      setPartialTranscript('')
      return
    }

    // Stop TTS if speaking before listening to user
    tts.stop()

    // If disconnected or error, begin connection sequence
    if (sessionStatus === 'disconnected' || sessionStatus === 'error') {
      isTransitioning.current = true
      setErrorMessage(null)

      // Step 1: Request microphone permission first
      let stream: MediaStream
      try {
        stream = await mic.requestStream()
      } catch (err) {
        isTransitioning.current = false
        setErrorMessage(formatMicError(err as string))
        return
      }

      // Step 2 & 3: Obtain temporary token and connect to AssemblyAI WebSocket
      await aai.connect(
        // onSessionReady: WebSocket received 'Begin'
        async () => {
          try {
            await mic.startProcessing(stream, (pcm) => {
              aai.sendAudio(pcm)
            })
          } catch (err) {
            console.error('Worklet start error:', err)
            setErrorMessage('Could not initialise audio processing worklet.')
            aai.disconnect()
          }
        },
        // onCleanup: called on termination, close, or error
        () => {
          mic.stop()
        },
      )
    }
  }

  // Retry an exchange that failed
  const handleRetryExchange = useCallback(
    (exchangeId: string) => {
      const target = exchanges.find((e) => e.id === exchangeId)
      if (!target) return

      setExchanges((prev) =>
        prev.map((e) => (e.id === exchangeId ? { ...e, isLoading: true, error: undefined } : e)),
      )
      handleTutorRequest(exchangeId, target.userTranscript, target.targetLanguage, exchanges)
    },
    [exchanges, handleTutorRequest],
  )

  const hasContent =
    exchanges.length > 0 || partialTranscript !== '' || sessionStatus === 'listening'

  return (
    <div className="min-h-screen flex flex-col bg-[#0b0f1a]">
      <Header />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6">
        {/* ── Error Banner ── */}
        {errorMessage && (
          <div
            role="alert"
            className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 flex items-start gap-3 fade-up"
          >
            <svg
              className="w-4 h-4 text-red-400 mt-0.5 shrink-0"
              fill="currentColor"
              viewBox="0 0 20 20"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm-.75-11.25a.75.75 0 011.5 0v4.5a.75.75 0 01-1.5 0v-4.5zm.75 7.5a.75.75 0 100-1.5.75.75 0 000 1.5z"
                clipRule="evenodd"
              />
            </svg>
            <p className="text-sm text-red-300 flex-1">{errorMessage}</p>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-red-400 hover:text-red-200 transition-colors text-xs ml-2 font-medium"
              aria-label="Dismiss error"
            >
              ✕
            </button>
          </div>
        )}

        {/* ── Top control bar ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-2 font-medium">
              Target language
            </p>
            <LanguageSelector
              options={LANGUAGE_OPTIONS}
              selected={language}
              onChange={(newLang) => {
                setLanguage(newLang)
                // Stop any TTS audio when language changes
                tts.stop()
              }}
            />
          </div>

          <StatusIndicator status={sessionStatus} errorMessage={errorMessage ?? undefined} />
        </div>

        {/* ── Conversation area ── */}
        <div className="flex-1 rounded-2xl border border-slate-800 bg-slate-900/30 overflow-hidden flex flex-col min-h-[420px]">
          {/* Conversation content */}
          <div className="flex-1 overflow-y-auto">
            {!hasContent ? (
              <EmptyState language={language} />
            ) : (
              <ConversationView
                exchanges={exchanges}
                partialTranscript={partialTranscript}
                isListening={sessionStatus === 'listening'}
                onRetryExchange={handleRetryExchange}
                activeTtsPhraseId={tts.activePhraseId}
                ttsState={tts.playbackState}
                ttsError={tts.errorMessage}
                ttsMetrics={tts.metrics}
                onSpeakPhrase={tts.speak}
                onStopSpeak={tts.stop}
              />
            )}
          </div>

          {/* ── Mic area ── */}
          <div className="border-t border-slate-800 bg-slate-900/50 px-4 py-6 flex flex-col items-center gap-4">
            <MicButton status={sessionStatus} onClick={handleMicClick} />
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
