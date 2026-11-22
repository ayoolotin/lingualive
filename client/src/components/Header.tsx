interface HeaderProps {
  /** Rendered by the parent so the header stays pure */
  children?: React.ReactNode
}

export function Header(_props: HeaderProps) {
  return (
    <header className="border-b border-slate-800 bg-[#0b0f1a]/80 backdrop-blur-sm sticky top-0 z-10">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center shrink-0"
            aria-hidden="true"
          >
            <svg
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="w-4 h-4 text-white"
            >
              <path
                d="M10 2a8 8 0 100 16A8 8 0 0010 2zm0 3a1 1 0 110 2 1 1 0 010-2zm-1 4h2v5H9V9z"
                fill="currentColor"
              />
            </svg>
          </div>
          <div>
            <span className="text-white font-semibold text-lg leading-none tracking-tight">
              LinguaLive
            </span>
            <p className="text-slate-400 text-xs leading-none mt-0.5">
              Learn languages by speaking.
            </p>
          </div>
        </div>

        {/* Badge */}
        <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" aria-hidden="true" />
          AI Tutor
        </span>
      </div>
    </header>
  )
}
