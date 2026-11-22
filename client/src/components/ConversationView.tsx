import { useEffect, useRef } from 'react'
import type { ConversationExchange, Language, TtsPlaybackState, TtsTimingMetrics } from '../types'
import { TutorResponsePanel } from './TutorResponsePanel'

interface ConversationViewProps {
  exchanges: ConversationExchange[]
  partialTranscript: string
  isListening: boolean
  onRetryExchange?: (exchangeId: string) => void

  // TTS playback controls
  activeTtsPhraseId: string | null
  ttsState: TtsPlaybackState
  ttsError: string | null
  ttsMetrics: TtsTimingMetrics | null
  onSpeakPhrase: (exchangeId: string, phrase: string, language: Language) => void
  onStopSpeak: () => void
}

export function ConversationView({
  exchanges,
  partialTranscript,
  isListening,
  onRetryExchange,
  activeTtsPhraseId,
  ttsState,
  ttsError,
  ttsMetrics,
  onSpeakPhrase,
  onStopSpeak,
}: ConversationViewProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null)

  // Scroll to bottom on updates
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [exchanges, partialTranscript])

  return (
    <div
      className="p-4 sm:p-6 flex flex-col gap-6"
      role="log"
      aria-label="Conversation history"
      aria-live="polite"
    >
      {/* ── Conversation Exchanges ── */}
      {exchanges.map((exchange) => {
        const isTtsActive = activeTtsPhraseId === exchange.id

        return (
          <div key={exchange.id} className="flex flex-col gap-3 fade-up">
            {/* User Speech Card */}
            <div className="rounded-xl border border-slate-700/60 bg-slate-800/50 px-4 py-3">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5 font-medium">
                <span className="flex items-center gap-2 uppercase tracking-wider text-slate-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block" aria-hidden="true" />
                  You said
                </span>
                <span className="font-normal normal-case text-slate-500">
                  {exchange.timestamp.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <p className="text-sm text-slate-100 leading-relaxed font-normal">
                {exchange.userTranscript}
              </p>
            </div>

            {/* Paired Tutor Response Card with Audio Controls */}
            <TutorResponsePanel
              language={exchange.targetLanguage}
              response={exchange.tutorResponse}
              isLoading={exchange.isLoading}
              error={exchange.error}
              onRetry={onRetryExchange ? () => onRetryExchange(exchange.id) : undefined}
              isTtsActive={isTtsActive}
              ttsState={ttsState}
              ttsError={isTtsActive ? ttsError : null}
              ttsMetrics={isTtsActive ? ttsMetrics : null}
              onSpeak={
                exchange.tutorResponse?.phrase
                  ? () => onSpeakPhrase(exchange.id, exchange.tutorResponse!.phrase, exchange.targetLanguage)
                  : undefined
              }
              onStopSpeak={onStopSpeak}
            />
          </div>
        )
      })}

      {/* ── In-Flight Live Transcription ── */}
      {partialTranscript ? (
        <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-3 transition-all fade-up">
          <p className="text-xs text-indigo-400 uppercase tracking-wider mb-1.5 font-medium flex items-center gap-2">
            <span
              className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse inline-block"
              aria-hidden="true"
            />
            Transcribing speech…
          </p>
          <p className="text-sm text-slate-200 leading-relaxed italic">{partialTranscript}</p>
        </div>
      ) : isListening ? (
        <div className="rounded-xl border border-dashed border-indigo-500/20 bg-indigo-500/5 px-4 py-3 transition-all fade-up">
          <p className="text-xs text-indigo-400 uppercase tracking-wider font-medium flex items-center gap-2">
            <span
              className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block"
              aria-hidden="true"
            />
            Listening… speak now into your microphone
          </p>
        </div>
      ) : null}

      <div ref={bottomRef} aria-hidden="true" />
    </div>
  )
}
