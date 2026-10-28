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
  const isSingleWord = self.popTranslateIsSingleWord;
  const AUTO = 'auto';
  const DEFAULT_SOURCE = AUTO;
  const DEFAULT_TARGET = 'bn';
  // Google takes the text in the request URL; 1500 chars stays under its URL
  // limit even for scripts like Bengali that take ~8 bytes per char once encoded.
  const MAX_LEN = 1500;
  // Longer selections get a wider popup.
  const WIDE_LEN = 200;
  const MIN_LEN = 1;
  const HOST = location.hostname;

  let popup = null;
  // Re-positions the popup whenever its size changes (translation, details, errors).
  let popupObserver = null;
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
    if (popupObserver) {
      popupObserver.disconnect();
      popupObserver = null;
    }
    if (popup && popup.parentNode) {
      popup.parentNode.removeChild(popup);
    }
    popup = null;
  }

  const ICON_BOOK = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4.5C6.8 3.4 5 3 2.5 3v9c2.5 0 4.3.4 5.5 1.5 1.2-1.1 3-1.5 5.5-1.5V3C11 3 9.2 3.4 8 4.5z"/><path d="M8 4.5v9"/></svg>';
  const ICON_SPARKLE = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 2.5 8.2 6 11.5 7.2 8.2 8.4 7 12 5.8 8.4 2.5 7.2 5.8 6z"/><path d="M12.5 10.5v3M11 12h3"/></svg>';
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
    if (originalText.length > WIDE_LEN) root.classList.add('pop-translate-wide');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Translation');

    const header = document.createElement('div');
    header.className = 'pop-translate-header';

    const badge = document.createElement('span');
    badge.className = 'pop-translate-badge';
    badge.textContent = lang.badge;

    const actions = document.createElement('div');
    actions.className = 'pop-translate-actions';

    // Word details only make sense for one selected word.
    const detailsBtn = isSingleWord(originalText) ? makeIconBtn('Word details', ICON_BOOK) : null;
    if (detailsBtn) detailsBtn.setAttribute('aria-pressed', 'false');
    const soundBtn = makeIconBtn('Speak translation', ICON_SOUND);
    const searchBtn = makeIconBtn('Search on Google', ICON_SEARCH);
    const copyBtn = makeIconBtn('Copy translation', ICON_COPY);
    const askBtn = makeIconBtn('Ask AI', ICON_SPARKLE);
    askBtn.setAttribute('aria-haspopup', 'menu');
    askBtn.setAttribute('aria-expanded', 'false');

    const closeBtn = document.createElement('button');
    closeBtn.className = 'pop-translate-close';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removePopup();
    });

    if (detailsBtn) actions.appendChild(detailsBtn);
    actions.appendChild(soundBtn);
    actions.appendChild(searchBtn);
    actions.appendChild(copyBtn);
    actions.appendChild(askBtn);
    actions.appendChild(closeBtn);

    header.appendChild(badge);
    header.appendChild(actions);

    const original = document.createElement('div');
    original.className = 'pop-translate-original';
    original.textContent = originalText;

    const translated = document.createElement('div');
    translated.className = 'pop-translate-translated pop-translate-loading';
    translated.textContent = 'Translating…';

    // Filled when the user clicks the word details button.
    const details = document.createElement('div');
    details.className = 'pop-translate-details';

    root.appendChild(header);
    root.appendChild(original);
    root.appendChild(translated);
    root.appendChild(details);

    return { root, badge, translated, details, detailsBtn, soundBtn, searchBtn, copyBtn, askBtn };
  }

  function positionPopup(root, rect) {
    const margin = 8;
    if (!root.isConnected) document.body.appendChild(root);

    const measured = root.getBoundingClientRect();
    const popupWidth = measured.width || 280;
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
      if (above > window.scrollY + margin) {
        top = above;
      } else {
        // No room above or below a tall selection: keep the popup on screen,
        // even if it covers part of the selection.
        top = Math.max(window.scrollY + margin, viewportBottom - popupHeight - margin);
      }
    }

    root.style.top = top + 'px';
    root.style.left = left + 'px';
  }

  // Fetch runs in the service worker: page CSP can't block it.
  function sendRequest(msg) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(msg, (res) => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          if (res && res.ok) resolve(res);
          else reject(new Error((res && res.error) || 'Request failed'));
        });
      } catch (err) {
        // Extension reloaded/updated: this content script is orphaned.
        reject(err);
      }
    });
  }

  function translate(text, srcCode, tgtCode) {
    return sendRequest({ type: 'translate', text, src: srcCode, tgt: tgtCode });
  }

  function fetchWordDetails(word, srcCode, tgtCode) {
    return sendRequest({ type: 'wordDetails', text: word, src: srcCode, tgt: tgtCode });
  }

  function makeEl(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  // External link that opens in a new tab without closing the popup.
  function makeLink(className, text, href) {
    const link = makeEl('a', className, text);
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.addEventListener('click', (e) => e.stopPropagation());
    return link;
  }

  // Word types with meanings in the target language (from Google).
  function renderDictionary(container, dictionary) {
    if (!Array.isArray(dictionary) || !dictionary.length) return false;
    const section = makeEl('div', 'pop-translate-dict');
    dictionary.forEach((group) => {
      const row = makeEl('div', 'pop-translate-dict-row');
      row.appendChild(makeEl('span', 'pop-translate-pos', group.pos));
      row.appendChild(makeEl('span', 'pop-translate-dict-words', group.words.join(', ')));
      section.appendChild(row);
    });
    container.appendChild(section);
    return true;
  }

  // English definitions and examples (Wiktionary via dictionaryapi.dev).
  function renderDefinitions(container, def) {
    if (!def || !def.found || !Array.isArray(def.meanings) || !def.meanings.length) return false;
    const section = makeEl('div', 'pop-translate-defs');
    if (def.phonetic) {
      const head = makeEl('div', 'pop-translate-phonetic');
      head.appendChild(makeEl('strong', '', def.word));
      head.appendChild(document.createTextNode(' ' + def.phonetic));
      section.appendChild(head);
    }
    def.meanings.forEach((m) => {
      const item = makeEl('div', 'pop-translate-def');
      item.appendChild(makeEl('span', 'pop-translate-pos', m.pos));
      item.appendChild(document.createTextNode(' ' + m.definition));
      if (m.example) item.appendChild(makeEl('div', 'pop-translate-example', '“' + m.example + '”'));
      section.appendChild(item);
    });
    section.appendChild(makeLink('pop-translate-credit', 'Definitions: Wiktionary',
      'https://en.wiktionary.org/wiki/' + encodeURIComponent(def.word || '')));
    container.appendChild(section);
    return true;
  }

  function setDetailsStatus(built, text) {
    built.details.textContent = '';
    built.details.appendChild(makeEl('div', 'pop-translate-details-status', text));
  }

  // The word details button loads details on first click, then shows/hides them.
  function wireDetails(built, word, srcCode, tgtCode) {
    const btn = built.detailsBtn;
    if (!btn) return;
    btn.disabled = false;
    let state = 'idle'; // idle | loading | loaded

    function setOpen(open) {
      btn.setAttribute('aria-pressed', String(open));
      built.details.classList.toggle('is-collapsed', !open);
    }

    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (state === 'loading') return;
      if (state === 'loaded') {
        setOpen(btn.getAttribute('aria-pressed') !== 'true');
        return;
      }
      state = 'loading';
      setDetailsStatus(built, 'Loading word details…');
      setOpen(true);
      try {
        const res = await fetchWordDetails(word, srcCode, tgtCode);
        if (!built.root.isConnected) return;
        built.details.textContent = '';
        const hasDictionary = renderDictionary(built.details, res.dictionary);
        const hasDefinitions = renderDefinitions(built.details, res.definition);
        if (!hasDictionary && !hasDefinitions) setDetailsStatus(built, 'No word details found for this word.');
        state = 'loaded';
      } catch (_) {
        if (!built.root.isConnected) return;
        // Let the user try again with another click.
        setDetailsStatus(built, 'Word details are not available now. Click again to retry.');
        state = 'idle';
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

  // "Ask AI" opens the user's AI assistant in a new tab with a ready-made
  // question. These ?q= links are not official APIs; if one stops working the
  // site still opens, just with an empty message box.
  const AI_SITES = [
    { id: 'chatgpt', name: 'ChatGPT', url: (q) => 'https://chatgpt.com/?q=' + encodeURIComponent(q) },
    { id: 'claude', name: 'Claude', url: (q) => 'https://claude.ai/new?q=' + encodeURIComponent(q) },
    { id: 'grok', name: 'Grok', url: (q) => 'https://grok.com/?q=' + encodeURIComponent(q) },
    { id: 'google', name: 'Google AI Mode', url: (q) => 'https://www.google.com/search?udm=50&q=' + encodeURIComponent(q) },
  ];

  // The answer is written in the user's chosen target language (e.g. Bengali).
  function buildAiPrompt(text, srcCode, answerCode) {
    const answerIn = (findLang(answerCode) || LANGS.en).label;
    const srcLang = findLang(srcCode);
    const kind = srcLang ? srcLang.label + ' ' : '';
    if (isSingleWord(text)) {
      return 'Explain the ' + kind + 'word "' + text + '" in simple words. Write your answer in ' + answerIn +
        '. Include: its meaning, its word type (noun, verb, adjective, etc.), and 2 short example sentences.';
    }
    return 'Explain the grammar of this ' + kind + 'sentence in simple words. Write your answer in ' + answerIn +
      '. Include: the tense, the sentence structure (subject, verb, object), and the role of each word or phrase.' +
      '\n\n"' + text + '"';
  }

  function getLastAi() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get({ lastAi: null }, (res) => resolve(res && res.lastAi));
      } catch (_) {
        resolve(null);
      }
    });
  }

  function wireAskAi(built, text, srcCode, answerCode) {
    const btn = built.askBtn;
    btn.disabled = false;
    let menu = null;

    function closeMenu() {
      if (!menu) return;
      menu.remove();
      menu = null;
      btn.setAttribute('aria-expanded', 'false');
    }

    async function openMenu() {
      const lastAi = await getLastAi();
      if (!built.root.isConnected) return;
      menu = makeEl('div', 'pop-translate-ai-menu');
      menu.setAttribute('role', 'menu');
      menu.appendChild(makeEl('div', 'pop-translate-ai-title', 'Explain with AI'));
      AI_SITES.forEach((site) => {
        const item = makeEl('button', 'pop-translate-ai-item', site.name);
        item.type = 'button';
        item.setAttribute('role', 'menuitem');
        if (site.id === lastAi) item.appendChild(makeEl('span', 'pop-translate-ai-last', 'Last used'));
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          window.open(site.url(buildAiPrompt(text, srcCode, answerCode)), '_blank', 'noopener');
          try { chrome.storage.local.set({ lastAi: site.id }); } catch (_) {}
          closeMenu();
        });
        menu.appendChild(item);
      });
      built.root.appendChild(menu);
      btn.setAttribute('aria-expanded', 'true');
      const first = menu.querySelector('.pop-translate-ai-item');
      if (first) first.focus();
    }

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (menu) closeMenu();
      else openMenu();
    });
    // A click elsewhere inside the popup closes the menu.
    built.root.addEventListener('click', (e) => {
      if (menu && !menu.contains(e.target) && !btn.contains(e.target)) closeMenu();
    });
  }

  // Google Translate's web page accepts up to 5000 characters.
  function googleTranslateUrl(text, srcCode, tgtCode) {
    return 'https://translate.google.com/?sl=' + encodeURIComponent(srcCode) +
      '&tl=' + encodeURIComponent(tgtCode) +
      '&text=' + encodeURIComponent(text.slice(0, 5000)) + '&op=translate';
  }

  function showError(built, selectionText, src, tgt, { message = 'Translation failed.', retry = true } = {}) {
    const el = built.translated;
    el.classList.remove('pop-translate-loading');
    el.classList.add('pop-translate-error');
    el.textContent = '';
    el.appendChild(makeEl('div', '', message));

    const row = makeEl('div', 'pop-translate-error-actions');
    if (retry) {
      const retryBtn = makeEl('button', 'pop-translate-text-btn', 'Retry');
      retryBtn.type = 'button';
      retryBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        runTranslation(built, selectionText, src, tgt);
      });
      row.appendChild(retryBtn);
    }
    row.appendChild(makeLink('pop-translate-text-btn', 'Open in Google Translate',
      googleTranslateUrl(selectionText, src, tgt)));
    el.appendChild(row);
  }

  // Shows a finished result and enables the buttons that need it.
  // answerCode: the user's target language, used for Ask AI answers.
  function showResult(built, text, translation, src, tgt, answerCode) {
    built.translated.classList.remove('pop-translate-loading');
    built.translated.textContent = translation;
    enableSoundCopy(built.soundBtn, built.copyBtn, translation, tgt);
    wireDetails(built, text, src, tgt);
    wireAskAi(built, text, src, answerCode);
  }

  async function runTranslation(built, selectionText, src, tgt) {
    const myRequest = ++currentRequest;
    built.translated.classList.remove('pop-translate-error');
    built.translated.classList.add('pop-translate-loading');
    built.translated.textContent = 'Translating…';

    try {
      const res = await translate(selectionText, src, tgt);
      if (myRequest !== currentRequest) return;
      built.badge.textContent = pairLabel(res.src, res.tgt);
      showResult(built, selectionText, res.translation, res.src, res.tgt, tgt);
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
    popupObserver = new ResizeObserver(() => positionPopup(built.root, rect));
    popupObserver.observe(built.root);

    // Too long for one request: say so instead of failing, and offer Google Translate.
    if (selectionText.length > MAX_LEN) {
      showError(built, selectionText, src, tgt, {
        message: 'This text is too long to translate here (max ' +
          MAX_LEN.toLocaleString('en-US') + ' characters). Select a shorter part, or:',
        retry: false,
      });
      return;
    }

    wireSearch(built.searchBtn, selectionText);

    if (src === tgt) {
      showResult(built, selectionText, selectionText, src, tgt, tgt);
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
      if (text.length < MIN_LEN) {
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
