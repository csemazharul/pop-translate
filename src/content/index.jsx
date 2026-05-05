import { createRoot } from 'react-dom/client'
import styles from './index.css?inline'
import App from './App.jsx'
import { DEFAULT_LANG, MAX_LEN, MIN_LEN, LANGS_MAP } from '../lib/constants.js'

let hostEl = null
let reactRoot = null
let currentController = null
let lastSelectionText = ''

function getTargetLang() {
  return new Promise((resolve) => {
    try {
      chrome.storage.sync.get({ targetLang: DEFAULT_LANG }, (res) => {
        const code =
          res?.targetLang && LANGS_MAP[res.targetLang]
            ? res.targetLang
            : DEFAULT_LANG
        resolve(code)
      })
    } catch (_) {
      resolve(DEFAULT_LANG)
    }
  })
}

function removePopup() {
  if (currentController) {
    try {
      currentController.abort()
    } catch (_) {}
    currentController = null
  }
  if (reactRoot) {
    reactRoot.unmount()
    reactRoot = null
  }
  if (hostEl) {
    hostEl.remove()
    hostEl = null
  }
}

function ensureHost() {
  if (!hostEl) {
    hostEl = document.createElement('div')
    hostEl.id = 'peek-translate-host'
    hostEl.style.position = 'absolute'
    hostEl.style.zIndex = '2147483647'
    hostEl.style.top = '0'
    hostEl.style.left = '0'
    const shadow = hostEl.attachShadow({ mode: 'open' })
    const styleEl = document.createElement('style')
    styleEl.textContent = styles
    shadow.appendChild(styleEl)
    const container = document.createElement('div')
    shadow.appendChild(container)
    document.body.appendChild(hostEl)
    reactRoot = createRoot(container)
  }
  return { hostEl, reactRoot }
}

function positionPopup(rect) {
  const margin = 8
  const popupWidth = 280

  requestAnimationFrame(() => {
    const container = hostEl.shadowRoot.querySelector('div')
    const popupEl = container?.firstElementChild
    if (!popupEl) return

    const popupHeight = popupEl.getBoundingClientRect().height || 80

    let top = rect.bottom + window.scrollY + margin
    let left = rect.left + window.scrollX

    const viewportRight = window.scrollX + window.innerWidth
    if (left + popupWidth + margin > viewportRight) {
      left = viewportRight - popupWidth - margin
    }
    if (left < window.scrollX + margin) {
      left = window.scrollX + margin
    }

    const viewportBottom = window.scrollY + window.innerHeight
    if (top + popupHeight + margin > viewportBottom) {
      const above = rect.top + window.scrollY - popupHeight - margin
      if (above > window.scrollY + margin) top = above
    }

    hostEl.style.top = top + 'px'
    hostEl.style.left = left + 'px'
    hostEl.style.width = popupWidth + 'px'
  })
}

function cleanTranslation(raw) {
  let text = raw
  if (typeof text !== 'string') return null
  text = text.trim()
  if (text.toUpperCase() === text && text !== text.toLowerCase()) {
    // API returns UPPERCASE when it can't translate — convert to normal case
    text = text.charAt(0).toUpperCase() + text.slice(1).toLowerCase()
  }
  if (/^MYMEMORY\s+WARNING/i.test(text)) return null
  text = text.replace(/^DEFINE\s*:\s*/i, '')
  text = text.replace(/^\[[\w\s]+\]\s*/, '')
  if (!text || text.trim().length === 0) return null
  return text
}

async function translate(text, langCode, signal) {
  const url =
    'https://api.mymemory.translated.net/get?q=' +
    encodeURIComponent(text) +
    '&langpair=en|' +
    encodeURIComponent(langCode)
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error('HTTP ' + res.status)
  const data = await res.json()
  const raw = data?.responseData?.translatedText
  const out = cleanTranslation(raw)
  if (!out) throw new Error('No translation')
  return out
}

async function showPopupForSelection(selectionText, rect) {
  removePopup()

  const langCode = await getTargetLang()
  const { reactRoot: root } = ensureHost()

  const handleClose = () => {
    removePopup()
    lastSelectionText = ''
  }

  root.render(
    <App
      originalText={selectionText}
      langCode={langCode}
      loading={true}
      translatedText=""
      error={false}
      onClose={handleClose}
    />
  )

  positionPopup(rect)

  currentController = new AbortController()
  const mySignal = currentController.signal
  const myController = currentController

  try {
    const translated = await translate(selectionText, langCode, mySignal)
    if (myController !== currentController) return
    root.render(
      <App
        originalText={selectionText}
        langCode={langCode}
        loading={false}
        translatedText={translated}
        error={false}
        onClose={handleClose}
      />
    )
    positionPopup(rect)
  } catch (err) {
    if (err?.name === 'AbortError') return
    if (myController !== currentController) return
    root.render(
      <App
        originalText={selectionText}
        langCode={langCode}
        loading={false}
        translatedText=""
        error={true}
        onClose={handleClose}
      />
    )
    positionPopup(rect)
  }
}

function handleMouseUp(e) {
  if (hostEl && e.composedPath().includes(hostEl)) return

  setTimeout(() => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      return
    }
    const text = sel.toString().trim()
    if (text.length < MIN_LEN || text.length > MAX_LEN) {
      return
    }
    if (text === lastSelectionText && hostEl) {
      return
    }
    lastSelectionText = text

    const range = sel.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      return
    }
    showPopupForSelection(text, rect)
  }, 10)
}

function handleMouseDown(e) {
  if (!hostEl) return
  if (e.composedPath().includes(hostEl)) return
  removePopup()
  lastSelectionText = ''
}

function handleKeyDown(e) {
  if (e.key === 'Escape' && hostEl) {
    removePopup()
    lastSelectionText = ''
  }
}

document.addEventListener('mouseup', handleMouseUp, true)
document.addEventListener('mousedown', handleMouseDown, true)
document.addEventListener('keydown', handleKeyDown, true)
