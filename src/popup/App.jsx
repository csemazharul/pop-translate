import { useEffect, useState } from 'react'
import { LANGS, DEFAULT_LANG } from '../lib/constants.js'

function getStorage() {
  try {
    return chrome?.storage?.sync ?? null
  } catch (_) {
    return null
  }
}

function App() {
  const [activeCode, setActiveCode] = useState(DEFAULT_LANG)

  useEffect(() => {
    const storage = getStorage()
    if (!storage) return
    try {
      storage.get({ targetLang: DEFAULT_LANG }, (res) => {
        const code =
          res?.targetLang && LANGS.some((l) => l.code === res.targetLang)
            ? res.targetLang
            : DEFAULT_LANG
        setActiveCode(code)
      })
    } catch (_) {
      // fallback to default
    }
  }, [])

  function select(code) {
    const storage = getStorage()
    if (!storage) {
      setActiveCode(code)
      return
    }
    try {
      storage.set({ targetLang: code }, () => {
        setActiveCode(code)
      })
    } catch (_) {
      setActiveCode(code)
    }
  }

  return (
    <div className="select-none">
      <div className="flex items-center gap-2 mb-2.5">
        <span className="w-[26px] h-[26px] rounded-md bg-pt-blue text-white inline-flex items-center justify-center font-bold text-sm">
          P
        </span>
        <span className="font-semibold text-[15px]">PeekTranslate</span>
      </div>
      <p className="text-pt-muted text-xs mb-2.5">
        Highlight any text on a page to see it translated.
      </p>

      <span className="block text-xs font-semibold text-pt-muted uppercase tracking-wide mt-2 mb-1.5">
        Translate to
      </span>
      <ul className="list-none m-0 p-0 border border-pt-border rounded-lg overflow-hidden">
        {LANGS.map(({ code, label, native }) => {
          const isActive = code === activeCode
          return (
            <li
              key={code}
              role="button"
              tabIndex={0}
              onClick={() => select(code)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  select(code)
                }
              }}
              className={[
                'flex items-center justify-between px-3 py-2 cursor-pointer transition-colors duration-100',
                'border-b border-pt-border last:border-b-0',
                isActive ? 'bg-pt-hover' : 'hover:bg-pt-hover',
              ].join(' ')}
            >
              <span className="flex flex-col">
                <span className="font-medium text-sm">{label}</span>
                <span className="text-xs text-pt-muted">{native}</span>
              </span>
              <span
                className={[
                  'text-pt-blue font-bold text-base',
                  isActive ? 'visible' : 'invisible',
                ].join(' ')}
              >
                ✓
              </span>
            </li>
          )
        })}
      </ul>

      <div className="mt-2.5 text-[11px] text-pt-muted text-center">
        Powered by MyMemory
      </div>
    </div>
  )
}

export default App
