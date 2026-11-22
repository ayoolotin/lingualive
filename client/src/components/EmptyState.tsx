import type { Language } from '../types'

interface EmptyStateProps {
  language: Language
}

const LANGUAGE_NAMES: Record<Language, string> = {
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
}

const SUGGESTIONS: Record<Language, string[]> = {
  es: ['"How do I say good morning?"', '"What\'s the word for library?"', '"Help me with ser vs estar"'],
  fr: ['"How do I say excuse me?"', '"What\'s the word for umbrella?"', '"Explain le vs la"'],
  de: ['"How do I say thank you?"', '"What\'s the word for airport?"', '"How do cases work?"'],
  it: ['"How do I say cheers?"', '"What\'s the word for beautiful?"', '"Explain masculine vs feminine"'],
}


export function EmptyState({ language }: EmptyStateProps) {
  const langName = LANGUAGE_NAMES[language]
  const suggestions = SUGGESTIONS[language]

  return (
    <div className="flex flex-col items-center text-center py-10 px-4 fade-up">
      {/* Icon */}
      <div
        className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-5"
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="w-7 h-7 text-indigo-400"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 0 1-.923 1.785A5.969 5.969 0 0 0 6 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z"
          />
        </svg>
      </div>

      <h3 className="text-base font-semibold text-slate-200 mb-1.5">
        Start speaking in {langName}
      </h3>
      <p className="text-sm text-slate-500 max-w-xs text-balance mb-6">
        Connect your session, then tap the microphone and ask anything — your tutor will respond with translations, pronunciation tips and examples.
      </p>

      {/* Example prompts */}
      <div className="flex flex-col gap-2 w-full max-w-xs">
        <p className="text-xs text-slate-600 uppercase tracking-wider mb-1">Try asking</p>
        {suggestions.map((s) => (
          <div
            key={s}
            className="text-xs text-slate-400 bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-2 text-left"
          >
            {s}
          </div>
        ))}
      </div>
    </div>
  )
}
