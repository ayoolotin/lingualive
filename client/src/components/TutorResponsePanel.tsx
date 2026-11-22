import type { Language, TutorResponseData, TtsPlaybackState, TtsTimingMetrics } from '../types'
import { LANGUAGE_OPTIONS } from '../constants'

interface TutorResponsePanelProps {
  language: Language
  response?: TutorResponseData
  isLoading?: boolean
  error?: string
  onRetry?: () => void

  // TTS props
  isTtsActive?: boolean
  ttsState?: TtsPlaybackState
  ttsError?: string | null
  ttsMetrics?: TtsTimingMetrics | null
  onSpeak?: () => void
  onStopSpeak?: () => void
}

export function TutorResponsePanel({
  language,
  response,
  isLoading,
  error,
  onRetry,
  isTtsActive = false,
  ttsState = 'idle',
  ttsError,
  ttsMetrics,
  onSpeak,
  onStopSpeak,
}: TutorResponsePanelProps) {
  const langOption = LANGUAGE_OPTIONS.find((l) => l.code === language)
  const langLabel = langOption?.label ?? 'Language'

  const isTtsLoading = isTtsActive && ttsState === 'loading'
  const isTtsPlaying = isTtsActive && ttsState === 'playing'

  return (
    <section
      aria-label={`Tutor response in ${langLabel}`}
      className="rounded-xl border border-indigo-500/20 bg-slate-900/60 p-4 sm:p-5 flex flex-col gap-3.5 transition-all shadow-lg shadow-indigo-950/20"
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-indigo-400" aria-hidden="true" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-indigo-300">
            LinguaLive Tutor · {langLabel}
          </h3>
        </div>
        <span className="text-xs text-slate-500">
          {langOption?.flag} {langOption?.nativeName}
        </span>
      </div>

      {/* ── LLM Loading State ── */}
      {isLoading && (
        <div className="py-4 flex flex-col items-center justify-center gap-3 text-center" aria-live="polite">
          <div className="flex items-center gap-2 text-indigo-400">
            <svg
              className="animate-spin h-5 w-5 text-indigo-400"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            <span className="text-sm font-medium text-slate-200">Your tutor is thinking…</span>
          </div>
          <p className="text-xs text-slate-400 max-w-sm">
            Crafting translation, pronunciation guide and vocabulary breakdown.
          </p>
        </div>
      )}

      {/* ── LLM Error State ── */}
      {!isLoading && error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <p className="text-xs text-red-300">{error}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="self-start sm:self-auto px-3 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-200 text-xs font-medium rounded-md transition-colors border border-red-500/30"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* ── Tutor Response Content ── */}
      {!isLoading && !error && response && (
        <div className="flex flex-col gap-3.5">
          {/* Target Language Phrase + TTS Audio Controls */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="flex-1">
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-1">
                Phrase
              </p>
              <p className="text-lg sm:text-xl font-semibold text-white tracking-tight leading-snug">
                {response.phrase}
              </p>
              <p className="text-sm text-indigo-300 mt-0.5 font-normal">
                "{response.meaning}"
              </p>
            </div>

            {/* ── TTS Listen / Stop Controls ── */}
            {onSpeak && (
              <div className="flex flex-col items-start sm:items-end gap-1.5 shrink-0 pt-1">
                <div className="flex items-center gap-1.5">
                  {/* Play / Listen Button */}
                  <button
                    type="button"
                    onClick={isTtsPlaying ? onStopSpeak : onSpeak}
                    disabled={isTtsLoading}
                    aria-label={
                      isTtsPlaying
                        ? 'Stop pronunciation audio'
                        : isTtsLoading
                        ? 'Loading audio…'
                        : `Listen to pronunciation in ${langLabel}`
                    }
                    className={[
                      'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all shadow-sm',
                      isTtsPlaying
                        ? 'bg-indigo-600 text-white border-indigo-500 animate-pulse'
                        : isTtsLoading
                        ? 'bg-slate-800 text-slate-400 border-slate-700 cursor-wait'
                        : 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30 hover:bg-indigo-500/25 hover:border-indigo-500/50',
                    ].join(' ')}
                  >
                    {isTtsLoading ? (
                      <>
                        <svg
                          className="w-3.5 h-3.5 animate-spin text-indigo-400"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                        </svg>
                        <span>Loading…</span>
                      </>
                    ) : isTtsPlaying ? (
                      <>
                        <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
                        </svg>
                        <span>Playing…</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                          <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" />
                        </svg>
                        <span>Listen</span>
                      </>
                    )}
                  </button>

                  {/* Stop button when playing */}
                  {isTtsPlaying && onStopSpeak && (
                    <button
                      type="button"
                      onClick={onStopSpeak}
                      aria-label="Stop audio"
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 hover:text-white transition-colors"
                    >
                      Stop
                    </button>
                  )}
                </div>

                {/* Subtitle / Latency Metrics Display */}
                {isTtsActive && ttsMetrics?.timeToFirstAudioMs && (
                  <span className="text-[10px] text-slate-500 font-mono">
                    TTFA: {ttsMetrics.timeToFirstAudioMs}ms
                    {ttsMetrics.totalPlaybackTimeMs ? ` · Duration: ${(ttsMetrics.totalPlaybackTimeMs / 1000).toFixed(1)}s` : ''}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* TTS Error Notice (unobtrusive, preserves text) */}
          {isTtsActive && ttsError && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1.5 flex items-center justify-between text-xs text-red-300">
              <span>Voice synthesis error: {ttsError}</span>
              {onSpeak && (
                <button
                  type="button"
                  onClick={onSpeak}
                  className="underline text-red-200 hover:text-white ml-2 text-[11px]"
                >
                  Try again
                </button>
              )}
            </div>
          )}

          {/* Pronunciation Guide */}
          {response.pronunciation && (
            <div className="bg-slate-800/50 rounded-lg p-2.5 border border-slate-700/40">
              <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-400 block mb-1">
                Phonetic Guide
              </span>
              <p className="font-mono text-xs sm:text-sm text-indigo-200 tracking-wide">
                {response.pronunciation}
              </p>
            </div>
          )}

          {/* Word-by-word Breakdown */}
          {response.breakdown && response.breakdown.length > 0 && (
            <div>
              <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-400 block mb-1.5">
                Word Breakdown
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {response.breakdown.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-baseline justify-between gap-2 bg-slate-800/40 border border-slate-700/30 rounded-md px-2.5 py-1.5 text-xs"
                  >
                    <span className="font-medium text-slate-200">{item.term}</span>
                    <span className="text-slate-400 text-right">{item.meaning}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Usage Tip */}
          {response.usageTip && (
            <div className="bg-indigo-950/30 border border-indigo-500/20 rounded-lg p-2.5 flex items-start gap-2">
              <span className="text-indigo-400 text-xs mt-0.5" aria-hidden="true">
                💡
              </span>
              <div>
                <span className="text-[10px] uppercase font-semibold tracking-wider text-indigo-300 block mb-0.5">
                  Usage Note
                </span>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {response.usageTip}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
