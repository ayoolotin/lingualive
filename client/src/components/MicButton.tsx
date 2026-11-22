import type { SessionStatus } from '../types'

interface MicButtonProps {
  status: SessionStatus
  onClick: () => void
}

export function MicButton({ status, onClick }: MicButtonProps) {
  const isListening = status === 'listening'
  const isConnecting = status === 'connecting'
  const isDisabled = isConnecting // during connecting, disable to prevent double-click

  const ariaLabel =
    isConnecting ? 'Connecting to session…'
    : isListening ? 'Stop listening'
    : 'Start listening'

  const buttonClass = [
    'relative w-20 h-20 rounded-full flex items-center justify-center',
    'transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0f1a]',
    isDisabled
      ? 'bg-slate-800 border border-slate-700 cursor-not-allowed opacity-60'
      : isListening
        ? 'bg-indigo-600 border border-indigo-500 hover:bg-indigo-700 mic-pulse focus-visible:ring-indigo-500'
        : 'bg-slate-800 border border-slate-700 hover:border-indigo-500/60 hover:bg-slate-700 focus-visible:ring-indigo-500',
  ].join(' ')

  const iconClass = [
    'w-8 h-8 transition-colors',
    isDisabled ? 'text-slate-600'
    : isListening ? 'text-white'
    : 'text-slate-300',
  ].join(' ')

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        id="mic-button"
        type="button"
        disabled={isDisabled}
        onClick={onClick}
        aria-label={ariaLabel}
        className={buttonClass}
      >
        {isConnecting ? (
          /* Spinner shown while connecting */
          <svg
            className="w-7 h-7 animate-spin text-amber-400"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className={iconClass}
            aria-hidden="true"
          >
            <path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 1 1-6 0V5a3 3 0 0 1 3-3z" />
            <path d="M19 11a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.92V20H9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-2.08A7 7 0 0 0 19 11z" />
          </svg>
        )}
      </button>

      <p className="text-xs text-slate-500 text-center">
        {isConnecting
          ? 'Opening session…'
          : isListening
          ? 'Listening — tap to stop'
          : 'Tap to speak'}
      </p>
    </div>
  )
}
