(() => {
  const LANGS = {
    'en':    { label: 'English',    badge: 'English'    },
    'zh-CN': { label: 'Chinese',    badge: '中文'        },
    'hi':    { label: 'Hindi',      badge: 'हिन्दी'      },
    'es':    { label: 'Spanish',    badge: 'Español'    },
    'fr':    { label: 'French',     badge: 'Français'   },
    'ar':    { label: 'Arabic',     badge: 'العربية'    },
    'bn':    { label: 'Bengali',    badge: 'বাংলা'      },
    'ru':    { label: 'Russian',    badge: 'Русский'    },
    'pt':    { label: 'Portuguese', badge: 'Português'  },
    'id':    { label: 'Indonesian', badge: 'Indonesia'  },
    'de':    { label: 'German',     badge: 'Deutsch'    },
    'ja':    { label: 'Japanese',   badge: '日本語'      },
    'ur':    { label: 'Urdu',       badge: 'اردو'       },
    'ko':    { label: 'Korean',     badge: '한국어'      },
    'it':    { label: 'Italian',    badge: 'Italiano'   },
    'tr':    { label: 'Turkish',    badge: 'Türkçe'     },
    'vi':    { label: 'Vietnamese', badge: 'Tiếng Việt' },
    'th':    { label: 'Thai',       badge: 'ไทย'         },
    'nl':    { label: 'Dutch',      badge: 'Nederlands' },
    'pl':    { label: 'Polish',     badge: 'Polski'     }
  };
  const DEFAULT_SOURCE = 'en';
  const DEFAULT_TARGET = 'bn';
  const MAX_LEN = 200;
  const MIN_LEN = 1;

  let popup = null;
  let currentController = null;
  let lastSelectionText = '';

  function getLangs() {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get(
          { sourceLang: DEFAULT_SOURCE, targetLang: DEFAULT_TARGET },
          (res) => {
            const src = (res && res.sourceLang && LANGS[res.sourceLang]) ? res.sourceLang : DEFAULT_SOURCE;
            const tgt = (res && res.targetLang && LANGS[res.targetLang]) ? res.targetLang : DEFAULT_TARGET;
            resolve({ src, tgt });
          }
        );
      } catch (_) {
        resolve({ src: DEFAULT_SOURCE, tgt: DEFAULT_TARGET });
      }
    });
  }

  function removePopup() {
    if (currentController) {
      try { currentController.abort(); } catch (_) {}
      currentController = null;
    }
    if (popup && popup.parentNode) {
      popup.parentNode.removeChild(popup);
    }
    popup = null;
  }

  function buildPopup(originalText, langCode) {
    const lang = LANGS[langCode] || LANGS[DEFAULT_TARGET];

    const root = document.createElement('div');
    root.className = 'pop-translate-popup pop-translate-fade-in';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Translation');

    const header = document.createElement('div');
    header.className = 'pop-translate-header';

    const badge = document.createElement('span');
    badge.className = 'pop-translate-badge';
    badge.textContent = lang.badge;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'pop-translate-close';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removePopup();
    });

    header.appendChild(badge);
    header.appendChild(closeBtn);

    const original = document.createElement('div');
    original.className = 'pop-translate-original';
    original.textContent = originalText;

    const translated = document.createElement('div');
    translated.className = 'pop-translate-translated pop-translate-loading';
    translated.textContent = 'Translating…';

    root.appendChild(header);
    root.appendChild(original);
    root.appendChild(translated);

    return { root, translated };
  }

  function positionPopup(root, rect) {
    const margin = 8;
    const popupWidth = 280;
    document.body.appendChild(root);

    const measured = root.getBoundingClientRect();
    const popupHeight = measured.height || 80;

    let top = rect.bottom + window.scrollY + margin;
    let left = rect.left + window.scrollX;

    const viewportRight = window.scrollX + window.innerWidth;
    if (left + popupWidth + margin > viewportRight) {
      left = viewportRight - popupWidth - margin;
    }
    if (left < window.scrollX + margin) {
      left = window.scrollX + margin;
    }

    const viewportBottom = window.scrollY + window.innerHeight;
    if (top + popupHeight + margin > viewportBottom) {
      const above = rect.top + window.scrollY - popupHeight - margin;
      if (above > window.scrollY + margin) top = above;
    }

    root.style.top = top + 'px';
    root.style.left = left + 'px';
  }

  async function translate(text, srcCode, tgtCode, signal) {
    const url = 'https://api.mymemory.translated.net/get?q=' +
      encodeURIComponent(text) +
      '&langpair=' + encodeURIComponent(srcCode) + '|' + encodeURIComponent(tgtCode);
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const out = data && data.responseData && data.responseData.translatedText;
    if (!out) throw new Error('No translation');
    return out;
  }

  async function showPopupForSelection(selectionText, rect) {
    removePopup();

    const { src, tgt } = await getLangs();
    const built = buildPopup(selectionText, tgt);
    popup = built.root;
    positionPopup(popup, rect);

    if (src === tgt) {
      built.translated.classList.remove('pop-translate-loading');
      built.translated.textContent = selectionText;
      return;
    }

    currentController = new AbortController();
    const mySignal = currentController.signal;
    const myController = currentController;

    try {
      const translated = await translate(selectionText, src, tgt, mySignal);
      if (myController !== currentController) return;
      built.translated.classList.remove('pop-translate-loading');
      built.translated.classList.remove('pop-translate-error');
      built.translated.textContent = translated;
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      if (myController !== currentController) return;
      built.translated.classList.remove('pop-translate-loading');
      built.translated.classList.add('pop-translate-error');
      built.translated.textContent = 'Translation failed.';
    }
  }

  function handleMouseUp(e) {
    if (popup && popup.contains(e.target)) return;

    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        return;
      }
      const text = sel.toString().trim();
      if (text.length < MIN_LEN || text.length > MAX_LEN) {
        return;
      }
      if (text === lastSelectionText && popup) {
        return;
      }
      lastSelectionText = text;

      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (!rect || (rect.width === 0 && rect.height === 0)) {
        return;
      }
      showPopupForSelection(text, rect);
    }, 10);
  }

  function handleMouseDown(e) {
    if (!popup) return;
    if (popup.contains(e.target)) return;
    removePopup();
    lastSelectionText = '';
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape' && popup) {
      removePopup();
      lastSelectionText = '';
    }
  }

  document.addEventListener('mouseup', handleMouseUp, true);
  document.addEventListener('mousedown', handleMouseDown, true);
  document.addEventListener('keydown', handleKeyDown, true);
})();
