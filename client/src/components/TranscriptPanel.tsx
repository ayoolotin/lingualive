interface TranscriptPanelProps {
  transcript: string
}

export function TranscriptPanel({ transcript }: TranscriptPanelProps) {
  const isEmpty = transcript.trim() === ''

  return (
    <section
      aria-label="Live transcript"
      className="rounded-xl border border-slate-800 bg-slate-900/50 p-4"
    >
      <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
        {/* Recording dot */}
        <span
          className="w-1.5 h-1.5 rounded-full bg-slate-600"
          aria-hidden="true"
        />
        You said
      </h2>

      <div
        id="transcript-output"
        role="log"
        aria-live="polite"
        aria-label="Speech transcript"
        className={[
          'min-h-[56px] text-sm leading-relaxed transition-colors',
          isEmpty ? 'text-slate-600 italic' : 'text-slate-200',
        ].join(' ')}
      >
        {isEmpty ? 'Your words will appear here as you speak…' : transcript}
      </div>
    </section>
  )
}
