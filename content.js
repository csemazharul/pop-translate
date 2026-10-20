(() => {
  // From languages.js (loaded first by the manifest).
  const LANGS = {};
  (self.POP_TRANSLATE_LANGS || []).forEach(({ code, name, native }) => {
    LANGS[code] = { label: name, badge: native || name };
  });
  if (!LANGS.en) LANGS.en = { label: 'English', badge: 'English' };
  if (!LANGS.bn) LANGS.bn = { label: 'Bengali', badge: 'বাংলা' };
  // Google's legacy codes vs the BCP 47 tags speech voices use.
  const SPEECH_LANG = { iw: 'he', jw: 'jv' };
  const AUTO = 'auto';
  const DEFAULT_SOURCE = AUTO;
  const DEFAULT_TARGET = 'bn';
  const MAX_LEN = 200;
  const MIN_LEN = 1;
  const HOST = location.hostname;

  let popup = null;
  let currentRequest = 0;
  let lastSelectionText = '';
  let globalEnabled = true;
  let siteDisabled = false;
  let enabled = true;

  function sendSafe(msg) {
    try {
      const p = chrome.runtime.sendMessage(msg);
      if (p && p.catch) p.catch(() => {});
    } catch (_) {}
  }

  function applyEnabled() {
    enabled = globalEnabled && !siteDisabled;
    sendSafe({ type: 'siteState', off: !enabled });
    if (!enabled) {
      removePopup();
      lastSelectionText = '';
    }
  }

  try {
    chrome.storage.sync.get({ enabled: true, disabledSites: [] }, (res) => {
      globalEnabled = !res || res.enabled !== false;
      siteDisabled = !!(res && Array.isArray(res.disabledSites) && res.disabledSites.includes(HOST));
      applyEnabled();
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      if (!changes.enabled && !changes.disabledSites) return;
      if (changes.enabled) globalEnabled = changes.enabled.newValue !== false;
      if (changes.disabledSites) {
        const list = changes.disabledSites.newValue;
        siteDisabled = Array.isArray(list) && list.includes(HOST);
      }
      applyEnabled();
    });
  } catch (_) {}

  function baseLang(code) {
    return String(code || '').toLowerCase().split('-')[0];
  }

  // Accepts API codes like "zh" or "en-US" as well as our own keys.
  function findLang(code) {
    if (LANGS[code]) return LANGS[code];
    const key = Object.keys(LANGS).find((k) => baseLang(k) === baseLang(code));
    return key ? LANGS[key] : null;
  }

  function getLangs() {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get(
          { sourceLang: DEFAULT_SOURCE, targetLang: DEFAULT_TARGET },
          (res) => {
            const src = (res && res.sourceLang && (res.sourceLang === AUTO || LANGS[res.sourceLang])) ? res.sourceLang : DEFAULT_SOURCE;
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
    currentRequest++;
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

  function pairLabel(srcCode, tgtCode) {
    const src = findLang(srcCode);
    const tgt = findLang(tgtCode) || LANGS[DEFAULT_TARGET];
    const srcName = src ? src.label : String(srcCode || '').toUpperCase();
    return srcName + ' → ' + tgt.badge;
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

    return { root, badge, translated, soundBtn, searchBtn, copyBtn };
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

  // Fetch runs in the service worker: page CSP can't block it.
  function translate(text, srcCode, tgtCode) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({ type: 'translate', text, src: srcCode, tgt: tgtCode }, (res) => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          if (res && res.ok) resolve(res);
          else reject(new Error((res && res.error) || 'No translation'));
        });
      } catch (err) {
        // Extension reloaded/updated: this content script is orphaned.
        reject(err);
      }
    });
  }

  function wireSearch(btn, originalText) {
    btn.disabled = false;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const url = 'https://www.google.com/search?q=' + encodeURIComponent(originalText);
      window.open(url, '_blank', 'noopener');
    });
  }

  function enableSoundCopy(soundBtn, copyBtn, translatedText, tgtCode) {
    soundBtn.disabled = false;
    copyBtn.disabled = false;

    soundBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      try {
        const u = new SpeechSynthesisUtterance(translatedText);
        u.lang = SPEECH_LANG[tgtCode] || tgtCode;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
      } catch (_) {}
    });

    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(translatedText).then(() => {
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

  function googleTranslateUrl(text, srcCode, tgtCode) {
    return 'https://translate.google.com/?sl=' + encodeURIComponent(srcCode) +
      '&tl=' + encodeURIComponent(tgtCode) +
      '&text=' + encodeURIComponent(text) + '&op=translate';
  }

  function showError(built, selectionText, src, tgt) {
    const el = built.translated;
    el.classList.remove('pop-translate-loading');
    el.classList.add('pop-translate-error');
    el.textContent = '';

    const msg = document.createElement('div');
    msg.textContent = 'Translation failed.';

    const row = document.createElement('div');
    row.className = 'pop-translate-error-actions';

    const retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.className = 'pop-translate-text-btn';
    retryBtn.textContent = 'Retry';
    retryBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      runTranslation(built, selectionText, src, tgt);
    });

    const link = document.createElement('a');
    link.className = 'pop-translate-text-btn';
    link.href = googleTranslateUrl(selectionText, src, tgt);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Open in Google Translate';
    link.addEventListener('click', (e) => e.stopPropagation());

    row.appendChild(retryBtn);
    row.appendChild(link);
    el.appendChild(msg);
    el.appendChild(row);
  }

  async function runTranslation(built, selectionText, src, tgt) {
    const myRequest = ++currentRequest;
    built.translated.classList.remove('pop-translate-error');
    built.translated.classList.add('pop-translate-loading');
    built.translated.textContent = 'Translating…';

    try {
      const res = await translate(selectionText, src, tgt);
      if (myRequest !== currentRequest) return;
      built.translated.classList.remove('pop-translate-loading');
      built.translated.textContent = res.translation;
      built.badge.textContent = pairLabel(res.src, res.tgt);
      enableSoundCopy(built.soundBtn, built.copyBtn, res.translation, res.tgt);
    } catch (err) {
      if (myRequest !== currentRequest) return;
      showError(built, selectionText, src, tgt);
    }
  }

  async function showPopupForSelection(selectionText, rect) {
    removePopup();
    const myRequest = currentRequest;

    const { src, tgt } = await getLangs();
    // Another selection or a dismiss happened while reading settings.
    if (myRequest !== currentRequest || !enabled) return;

    const built = buildPopup(selectionText, tgt);
    popup = built.root;
    positionPopup(popup, rect);

    wireSearch(built.searchBtn, selectionText);

    if (src === tgt) {
      built.translated.classList.remove('pop-translate-loading');
      built.translated.textContent = selectionText;
      enableSoundCopy(built.soundBtn, built.copyBtn, selectionText, tgt);
      return;
    }

    runTranslation(built, selectionText, src, tgt);
  }

  // Selecting text while typing (inputs, textareas, rich editors) shouldn't pop up.
  function isEditable(node) {
    const el = node && (node.nodeType === 1 ? node : node.parentElement);
    if (!el) return false;
    if (el.isContentEditable) return true;
    return !!el.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])');
  }

  function handleMouseUp(e) {
    if (!enabled) return;
    if (popup && popup.contains(e.target)) return;
    if (isEditable(e.target) || isEditable(document.activeElement)) return;

    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        return;
      }
      if (isEditable(sel.anchorNode) || isEditable(sel.focusNode)) {
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
