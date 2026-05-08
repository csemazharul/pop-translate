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

  const ICON_SOUND = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3 4.5 6H2v4h2.5L8 13z"/><path d="M11 5.5a3.5 3.5 0 0 1 0 5"/><path d="M12.5 3.5a6 6 0 0 1 0 9"/></svg>';
  const ICON_SEARCH = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="4.5"/><path d="m13.5 13.5-3-3"/></svg>';
  const ICON_COPY = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="8" height="9" rx="1.5"/><path d="M3 11V3.5A1.5 1.5 0 0 1 4.5 2H10"/></svg>';
  const ICON_CHECK = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 8 3.5 3.5L13 5"/></svg>';

  function makeIconBtn(label, svg) {
    const btn = document.createElement('button');
    btn.className = 'pop-translate-icon-btn';
    btn.type = 'button';
    btn.setAttribute('aria-label', label);
    btn.title = label;
    btn.disabled = true;
    btn.innerHTML = svg;
    return btn;
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

    const actions = document.createElement('div');
    actions.className = 'pop-translate-actions';

    const soundBtn = makeIconBtn('Speak translation', ICON_SOUND);
    const searchBtn = makeIconBtn('Search on Google', ICON_SEARCH);
    const copyBtn = makeIconBtn('Copy translation', ICON_COPY);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'pop-translate-close';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removePopup();
    });

    actions.appendChild(soundBtn);
    actions.appendChild(searchBtn);
    actions.appendChild(copyBtn);
    actions.appendChild(closeBtn);

    header.appendChild(badge);
    header.appendChild(actions);

    const original = document.createElement('div');
    original.className = 'pop-translate-original';
    original.textContent = originalText;

    const translated = document.createElement('div');
    translated.className = 'pop-translate-translated pop-translate-loading';
    translated.textContent = 'Translating…';

    root.appendChild(header);
    root.appendChild(original);
    root.appendChild(translated);

    return { root, translated, soundBtn, searchBtn, copyBtn };
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

  function wireSearch(btn, originalText) {
    btn.disabled = false;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const url = 'https://www.google.com/search?q=' + encodeURIComponent(originalText);
      window.open(url, '_blank', 'noopener');
    });
  }

  function enableSoundCopy(soundBtn, copyBtn, originalText, translatedText, tgtCode) {
    soundBtn.disabled = false;
    copyBtn.disabled = false;

    soundBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      try {
        const u = new SpeechSynthesisUtterance(translatedText);
        u.lang = tgtCode;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
      } catch (_) {}
    });

    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(originalText).then(() => {
        const prev = copyBtn.innerHTML;
        copyBtn.innerHTML = ICON_CHECK;
        copyBtn.classList.add('copied');
        setTimeout(() => {
          if (!copyBtn.isConnected) return;
          copyBtn.innerHTML = prev;
          copyBtn.classList.remove('copied');
        }, 1000);
      }).catch(() => {});
    });
  }

  async function showPopupForSelection(selectionText, rect) {
    removePopup();

    const { src, tgt } = await getLangs();
    const built = buildPopup(selectionText, tgt);
    popup = built.root;
    positionPopup(popup, rect);

    wireSearch(built.searchBtn, selectionText);

    if (src === tgt) {
      built.translated.classList.remove('pop-translate-loading');
      built.translated.textContent = selectionText;
      enableSoundCopy(built.soundBtn, built.copyBtn, selectionText, selectionText, tgt);
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
      enableSoundCopy(built.soundBtn, built.copyBtn, selectionText, translated, tgt);
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
