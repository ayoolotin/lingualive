import type { Language, LanguageOption } from '../types'

interface LanguageSelectorProps {
  options: LanguageOption[]
  selected: Language
  onChange: (lang: Language) => void
}

export function LanguageSelector({ options, selected, onChange }: LanguageSelectorProps) {
  return (
    <div role="group" aria-label="Target language" className="flex flex-wrap gap-2">
      {options.map((option) => {
        const isSelected = option.code === selected
        return (
          <button
            key={option.code}
            id={`lang-${option.code}`}
            type="button"
            onClick={() => onChange(option.code)}
            aria-pressed={isSelected}
            className={[
              'inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium',
              'border transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
              isSelected
                ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300'
                : 'bg-slate-800/50 border-slate-700/60 text-slate-400 hover:border-slate-600 hover:text-slate-200',
            ].join(' ')}
          >
            <span aria-hidden="true">{option.flag}</span>
            <span>{option.label}</span>
            {isSelected && (
              <span className="ml-0.5 text-indigo-400 text-xs font-normal hidden sm:inline">
                — {option.nativeName}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
