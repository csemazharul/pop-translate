(() => {
  const LANGS = self.POP_TRANSLATE_LANGS || [];
  const POPULAR = self.POP_TRANSLATE_POPULAR || [];
  const ALIASES = self.POP_TRANSLATE_ALIASES || {};
  const AUTO = 'auto';
  const DEFAULT_SOURCE = AUTO;
  const DEFAULT_TARGET = 'bn';

  const sourceEl = document.getElementById('pt-source');
  const targetEl = document.getElementById('pt-target');
  const enabledEl = document.getElementById('pt-enabled');
  const enabledHintEl = document.getElementById('pt-enabled-hint');
  const langsEl = document.getElementById('pt-langs');
  const siteRowEl = document.getElementById('pt-site-row');
  const siteEnabledEl = document.getElementById('pt-site-enabled');
  const siteHostEl = document.getElementById('pt-site-host');

  let currentHost = null;

  function renderEnabled(enabled) {
    enabledEl.checked = enabled;
    enabledEl.setAttribute('aria-checked', String(enabled));
    enabledHintEl.textContent = enabled
      ? 'The translation shows when you select text'
      : 'Off. Nothing shows when you select text';
    langsEl.classList.toggle('is-disabled', !enabled);
    siteEnabledEl.disabled = !enabled;
    siteRowEl.classList.toggle('is-disabled', !enabled);
  }

  function renderSite(siteOn) {
    siteEnabledEl.checked = siteOn;
    siteEnabledEl.setAttribute('aria-checked', String(siteOn));
    siteHostEl.textContent = siteOn ? currentHost : 'Off on ' + currentHost;
  }

  // activeTab lets the popup read the current tab's URL without the "tabs" permission.
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    let url = null;
    try { url = tab && tab.url ? new URL(tab.url) : null; } catch (_) {}
    if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:') || !url.hostname) return;
    currentHost = url.hostname;
    chrome.storage.sync.get({ disabledSites: [] }, (res) => {
      const list = Array.isArray(res.disabledSites) ? res.disabledSites : [];
      renderSite(!list.includes(currentHost));
      siteRowEl.classList.add('is-visible');
    });
  });

  siteEnabledEl.addEventListener('change', () => {
    if (!currentHost) return;
    const siteOn = siteEnabledEl.checked;
    renderSite(siteOn);
    chrome.storage.sync.get({ disabledSites: [] }, (res) => {
      const list = (Array.isArray(res.disabledSites) ? res.disabledSites : []).filter((h) => h !== currentHost);
      if (!siteOn) list.push(currentHost);
      chrome.storage.sync.set({ disabledSites: list });
    });
  });

  function optionText({ name, native }) {
    return native ? name + ' — ' + native : name;
  }

  // Lowercase and drop Latin accents so "francais" finds "Français".
  function normalize(str) {
    return String(str || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  // Searchable language picker: a button that opens a panel with a search box
  // and a listbox. Shows "Popular" then "All languages"; a search shows one
  // flat list matched on English name, native name, alias or code.
  // label: names the picker for screen readers, e.g. "Source".
  function createPicker({ button, label, langs, extra, onChange }) {
    const panel = document.createElement('div');
    panel.className = 'pt-picker-panel';
    panel.hidden = true;
    const search = document.createElement('input');
    search.type = 'text';
    search.className = 'pt-picker-search';
    search.placeholder = 'Search language';
    search.autocomplete = 'off';
    search.spellcheck = false;
    search.setAttribute('aria-label', 'Search ' + label + ' language');
    search.setAttribute('role', 'combobox');
    search.setAttribute('aria-expanded', 'true');
    search.setAttribute('aria-autocomplete', 'list');
    const list = document.createElement('ul');
    list.className = 'pt-picker-list';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', label + ' language');
    panel.append(search, list);
    button.after(panel);

    const byCode = new Map(langs.map((l) => [l.code, l]));
    if (extra) byCode.set(extra.code, extra);
    const popular = POPULAR.map((c) => byCode.get(c)).filter(Boolean);
    const popularSet = new Set(POPULAR);
    // Normalized search keys, computed once instead of on every keystroke.
    const searchable = (extra ? [extra].concat(langs) : langs).map((lang) => ({
      lang,
      name: normalize(lang.name),
      native: normalize(lang.native),
      code: normalize(lang.code),
      aliases: (ALIASES[lang.code] || []).map(normalize),
    }));
    const listId = button.id + '-list';
    list.id = listId;
    search.setAttribute('aria-controls', listId);

    let value = null;
    let options = [];
    let active = -1;

    function setActive(i) {
      if (options[active]) options[active].classList.remove('is-active');
      active = i;
      const el = options[active];
      if (!el) {
        search.removeAttribute('aria-activedescendant');
        return;
      }
      el.classList.add('is-active');
      search.setAttribute('aria-activedescendant', el.id);
      el.scrollIntoView({ block: 'nearest' });
    }

    function addGroup(label) {
      const li = document.createElement('li');
      li.className = 'pt-picker-group';
      li.setAttribute('role', 'presentation');
      li.textContent = label;
      list.appendChild(li);
    }

    function addOption(lang) {
      const li = document.createElement('li');
      li.className = 'pt-picker-option';
      li.id = button.id + '-opt-' + options.length;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(lang.code === value));
      li.dataset.code = lang.code;
      li.textContent = optionText(lang);
      list.appendChild(li);
      options.push(li);
    }

    function render() {
      const q = normalize(search.value.trim());
      list.textContent = '';
      options = [];
      active = -1;

      if (!q) {
        if (extra) addOption(extra);
        addGroup('Popular');
        popular.forEach(addOption);
        addGroup('All languages');
        langs.forEach(addOption);
      } else {
        // Matching inside a word is noisy for 1–2 Latin letters ("zh" is in "Brezhoneg").
        const inWord = q.length >= 3 || /[^\x00-\x7f]/.test(q);
        const starts = [];
        const contains = [];
        searchable.forEach(({ lang, name, native, code, aliases }) => {
          if (name.startsWith(q) || native.startsWith(q) || code === q || code.startsWith(q + '-') ||
              aliases.some((a) => a.startsWith(q))) {
            starts.push(lang);
          } else if (inWord && (name.includes(q) || native.includes(q) || aliases.some((a) => a.includes(q)))) {
            contains.push(lang);
          }
        });
        // Popular languages first, then A–Z (the list order).
        const rank = (lang) => (popularSet.has(lang.code) ? 0 : 1);
        const byRank = (x, y) => rank(x) - rank(y);
        starts.sort(byRank).concat(contains.sort(byRank)).forEach(addOption);
        if (!options.length) {
          const li = document.createElement('li');
          li.className = 'pt-picker-empty';
          li.setAttribute('role', 'presentation');
          li.textContent = 'No language found';
          list.appendChild(li);
        }
      }

      const selected = options.findIndex((el) => el.dataset.code === value);
      setActive(q ? (options.length ? 0 : -1) : selected);
    }

    function isOpen() {
      return !panel.hidden;
    }

    function open() {
      pickers.forEach((p) => { if (p !== api) p.close(false); });
      panel.hidden = false;
      button.setAttribute('aria-expanded', 'true');
      search.value = '';
      render();
      search.focus();
    }

    function close(focusButton) {
      if (!isOpen()) return;
      panel.hidden = true;
      button.setAttribute('aria-expanded', 'false');
      if (focusButton) button.focus();
    }

    function setValue(code) {
      value = code;
      const lang = byCode.get(code);
      button.textContent = lang ? optionText(lang) : code;
    }

    function choose(code) {
      if (!code) return;
      const changed = code !== value;
      setValue(code);
      close(true);
      if (changed) onChange(code);
    }

    button.addEventListener('click', () => (isOpen() ? close(true) : open()));
    button.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        open();
      }
    });
    search.addEventListener('input', render);
    search.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (options.length) setActive(Math.min(active + 1, options.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (options.length) setActive(Math.max(active - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (options[active]) choose(options[active].dataset.code);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        close(true);
      } else if (e.key === 'Tab') {
        close(false);
      }
    });
    // mousedown keeps focus in the search box until the click lands.
    list.addEventListener('mousedown', (e) => e.preventDefault());
    list.addEventListener('click', (e) => {
      const el = e.target.closest('.pt-picker-option');
      if (el) choose(el.dataset.code);
    });
    list.addEventListener('mousemove', (e) => {
      const el = e.target.closest('.pt-picker-option');
      if (el && options[active] !== el) setActive(options.indexOf(el));
    });

    const api = { setValue, close, contains: (node) => button.parentNode.contains(node) };
    return api;
  }

  const pickers = [];
  // Close on a press outside every picker. A press on another picker is left to
  // its click handler: closing here would shift the layout before the click lands.
  document.addEventListener('mousedown', (e) => {
    if (pickers.some((p) => p.contains(e.target))) return;
    pickers.forEach((p) => p.close(false));
  });

  const sourcePicker = createPicker({
    button: sourceEl,
    label: 'Source',
    langs: LANGS.filter((l) => !l.targetOnly),
    extra: { code: AUTO, name: 'Auto-detect' },
    onChange: (code) => chrome.storage.sync.set({ sourceLang: code }),
  });
  const targetPicker = createPicker({
    button: targetEl,
    label: 'Target',
    langs: LANGS,
    onChange: (code) => chrome.storage.sync.set({ targetLang: code }),
  });
  pickers.push(sourcePicker, targetPicker);

  enabledEl.addEventListener('change', () => {
    renderEnabled(enabledEl.checked);
    chrome.storage.sync.set({ enabled: enabledEl.checked });
  });

  chrome.storage.sync.get(
    { sourceLang: DEFAULT_SOURCE, targetLang: DEFAULT_TARGET, enabled: true },
    (res) => {
      renderEnabled(res.enabled !== false);
      const src = (res.sourceLang === AUTO || LANGS.some(l => l.code === res.sourceLang && !l.targetOnly)) ? res.sourceLang : DEFAULT_SOURCE;
      const tgt = LANGS.some(l => l.code === res.targetLang) ? res.targetLang : DEFAULT_TARGET;
      sourcePicker.setValue(src);
      targetPicker.setValue(tgt);
    }
  );
})();
