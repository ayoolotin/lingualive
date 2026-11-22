import type { SessionStatus } from '../types'

interface StatusIndicatorProps {
  status: SessionStatus
  errorMessage?: string
}

const STATUS_CONFIG: Record<
  SessionStatus,
  { dot: string; label: string; description: string }
> = {
  disconnected: {
    dot: 'bg-slate-500',
    label: 'Not connected',
    description: 'Click the mic to start',
  },
  connecting: {
    dot: 'bg-amber-400 animate-pulse',
    label: 'Connecting…',
    description: 'Opening session',
  },
  listening: {
    dot: 'bg-emerald-400 animate-pulse',
    label: 'Listening',
    description: 'Speak now',
  },
  processing: {
    dot: 'bg-indigo-400 animate-pulse',
    label: 'Processing…',
    description: 'Waiting for final transcript',
  },
  error: {
    dot: 'bg-red-400',
    label: 'Error',
    description: 'Something went wrong',
  },
}

export function StatusIndicator({ status, errorMessage }: StatusIndicatorProps) {
  const { dot, label, description } = STATUS_CONFIG[status]
  const displayDescription = status === 'error' && errorMessage ? errorMessage : description

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Connection status: ${label}`}
      className="inline-flex items-center gap-2 text-xs max-w-xs"
    >
      <span
        className={`w-2 h-2 rounded-full shrink-0 ${dot}`}
        aria-hidden="true"
      />
      <span className="text-slate-400">
        <span className="font-medium text-slate-300">{label}</span>
        <span className="hidden sm:inline"> · {displayDescription}</span>
      </span>
    </div>
  )
}
