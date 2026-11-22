export function Footer() {
  return (
    <footer className="border-t border-slate-800 mt-auto">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 h-12 flex items-center justify-center">
        <p className="text-slate-500 text-xs flex items-center gap-2">
          <span>Powered by</span>
          <a
            href="https://www.assemblyai.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-400 hover:text-indigo-400 transition-colors font-medium"
            aria-label="AssemblyAI (opens in a new tab)"
          >
            AssemblyAI
          </a>
          <span aria-hidden="true">·</span>
          <span>Real-time speech intelligence</span>
        </p>
      </div>
    </footer>
  )
}
