import { LANGS_MAP, DEFAULT_LANG } from '../lib/constants.js'

export default function App({ originalText, langCode, loading, translatedText, error, onClose }) {
  const lang = LANGS_MAP[langCode] || LANGS_MAP[DEFAULT_LANG]

  return (
    <div
      className="animate-fade-in bg-white text-pt-text border border-pt-border rounded-lg shadow-[0_6px_20px_rgba(20,50,90,0.18),0_1px_3px_rgba(20,50,90,0.08)] p-3 max-w-[280px] min-w-[180px] text-left leading-relaxed box-border"
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        fontSize: '14px',
      }}
      role="dialog"
      aria-label="Translation"
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="inline-block px-2 py-0.5 bg-pt-blue text-white rounded-full text-[11px] font-semibold tracking-wide">
          {lang.badge}
        </span>
        <button
          type="button"
          aria-label="Close"
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
          className="w-5 h-5 inline-flex items-center justify-center text-lg leading-none text-slate-500 rounded hover:bg-pt-hover hover:text-pt-text transition-colors duration-100 cursor-pointer border-none bg-transparent p-0"
        >
          ×
        </button>
      </div>

      <div className="text-xs text-slate-500 break-words mb-1">
        {originalText}
      </div>

      <div
        className={[
          'text-[15px] font-medium break-words',
          loading ? 'text-slate-500 italic font-normal' : 'text-pt-text',
          error ? 'text-red-700 font-normal' : '',
        ].join(' ')}
      >
        {loading ? 'Translating…' : error ? 'Translation failed.' : translatedText}
      </div>
    </div>
  )
}
