(() => {
  const LANGS = self.POP_TRANSLATE_LANGS || [];
  const POPULAR = self.POP_TRANSLATE_POPULAR || [];
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

  function addGroup(selectEl, label, langs) {
    const group = document.createElement('optgroup');
    group.label = label;
    langs.forEach((lang) => {
      const opt = document.createElement('option');
      opt.value = lang.code;
      opt.textContent = optionText(lang);
      group.appendChild(opt);
    });
    selectEl.appendChild(group);
  }

  // Popular first, then everything A–Z. A popular code appears in both groups;
  // setting .value selects the first match.
  function populate(selectEl, isSource) {
    const usable = LANGS.filter((l) => !(isSource && l.targetOnly));
    const byCode = new Map(usable.map((l) => [l.code, l]));
    addGroup(selectEl, 'Popular', POPULAR.map((c) => byCode.get(c)).filter(Boolean));
    addGroup(selectEl, 'All languages', usable);
  }

  const autoOpt = document.createElement('option');
  autoOpt.value = AUTO;
  autoOpt.textContent = 'Auto-detect';
  sourceEl.appendChild(autoOpt);
  populate(sourceEl, true);
  populate(targetEl, false);

  sourceEl.addEventListener('change', () => {
    chrome.storage.sync.set({ sourceLang: sourceEl.value });
  });
  targetEl.addEventListener('change', () => {
    chrome.storage.sync.set({ targetLang: targetEl.value });
  });
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
      sourceEl.value = src;
      targetEl.value = tgt;
    }
  );
})();
