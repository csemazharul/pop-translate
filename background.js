const DEFAULT_SOURCE = 'auto';
const DEFAULT_TARGET = 'bn';
const REQUEST_TIMEOUT_MS = 8000;

// Public browser key shipped in Google's own Translate extension. The endpoint
// reflects the chrome-extension origin in CORS headers, so no host permission
// is needed. Far fewer 429s than the anonymous endpoints.
const GOOGLE_PA_KEY = 'AIzaSyDLEeFI5OtFBwYBIoK_jj5m32rZK5CkCXA';

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get({ sourceLang: null, targetLang: null, enabled: null }, (res) => {
    const updates = {};
    if (!res.sourceLang) updates.sourceLang = DEFAULT_SOURCE;
    if (!res.targetLang) updates.targetLang = DEFAULT_TARGET;
    if (res.enabled === null) updates.enabled = true;
    if (Object.keys(updates).length) chrome.storage.sync.set(updates);
  });
});

chrome.action.setBadgeBackgroundColor({ color: '#64748b' });

function updateGlobalBadge(enabled) {
  chrome.action.setBadgeText({ text: enabled ? '' : 'OFF' });
}

chrome.storage.sync.get({ enabled: true }, (res) => updateGlobalBadge(res.enabled !== false));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.enabled) updateGlobalBadge(changes.enabled.newValue !== false);
});

function baseLang(code) {
  return String(code || '').toLowerCase().split('-')[0];
}

// "zh-CN" vs "zh-TW" differ; "zh" vs "zh-CN" or "en" vs "en-US" match.
// A script subtag ("pa-Arab", "ms-Arab") marks a different writing system, so never matches.
function sameLang(a, b) {
  const x = String(a || '').toLowerCase();
  const y = String(b || '').toLowerCase();
  if (x === y) return true;
  if (baseLang(x) !== baseLang(y)) return false;
  if (x.includes('-') && y.includes('-')) return false;
  const sub = (x.split('-')[1] || y.split('-')[1] || '');
  return !/^[a-z]{4}$/.test(sub);
}

// Google uses a few legacy codes MyMemory doesn't accept.
const MYMEMORY_LANG = { iw: 'he', jw: 'jv' };

// Rough script-based guess, used only when Google (which detects properly) is down.
function guessLang(text) {
  if (/[ঀ-৿]/.test(text)) return 'bn';
  if (/[ऀ-ॿ]/.test(text)) return 'hi';
  if (/[؀-ۿ]/.test(text)) return 'ar';
  if (/[Ѐ-ӿ]/.test(text)) return 'ru';
  if (/[぀-ヿ]/.test(text)) return 'ja';
  if (/[가-힯]/.test(text)) return 'ko';
  if (/[一-鿿]/.test(text)) return 'zh-CN';
  if (/[฀-๿]/.test(text)) return 'th';
  return 'en';
}

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

async function translateGoogle(text, src, tgt) {
  const url = 'https://translate-pa.googleapis.com/v1/translate?params.client=gtx' +
    '&query.source_language=' + encodeURIComponent(src) +
    '&query.target_language=' + encodeURIComponent(tgt) +
    '&query.text=' + encodeURIComponent(text) +
    '&key=' + GOOGLE_PA_KEY + '&data_types=TRANSLATION';
  const data = await fetchJson(url);
  if (!data || typeof data.translation !== 'string' || !data.translation) {
    throw new Error('Google: unexpected response');
  }
  const detected = typeof data.sourceLanguage === 'string' && data.sourceLanguage ? data.sourceLanguage : src;
  return { translation: data.translation, src: detected };
}

async function translateMyMemory(text, src, tgt) {
  const url = 'https://api.mymemory.translated.net/get?q=' +
    encodeURIComponent(text) +
    '&langpair=' + encodeURIComponent(MYMEMORY_LANG[src] || src) + '|' + encodeURIComponent(MYMEMORY_LANG[tgt] || tgt);
  const data = await fetchJson(url);
  // MyMemory reports quota/errors with HTTP 200 and the message as "translation".
  if (!data || Number(data.responseStatus) !== 200 || data.quotaFinished) {
    throw new Error('MyMemory: ' + ((data && data.responseDetails) || 'failed'));
  }
  const out = data.responseData && data.responseData.translatedText;
  if (!out) throw new Error('MyMemory: no translation');
  return out;
}

// Returns { translation, src, tgt } where src/tgt are the languages actually used.
// With auto-detect, text that is already in the target language goes to English.
async function translate(text, src, tgt) {
  try {
    const first = await translateGoogle(text, src, tgt);
    if (src === 'auto' && sameLang(first.src, tgt) && !sameLang(tgt, 'en')) {
      const second = await translateGoogle(text, first.src, 'en');
      return { translation: second.translation, src: first.src, tgt: 'en' };
    }
    return { translation: first.translation, src: first.src, tgt };
  } catch (_) {
    const from = src === 'auto' ? guessLang(text) : src;
    let to = tgt;
    if (sameLang(from, to)) {
      if (sameLang(to, 'en')) return { translation: text, src: from, tgt: to };
      to = 'en';
    }
    const translation = await translateMyMemory(text, from, to);
    return { translation, src: from, tgt: to };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return false;

  if (msg.type === 'siteState') {
    // Per-tab badge so "off on this site" is visible; overrides the global badge.
    if (sender.tab && sender.tab.id !== undefined) {
      chrome.action.setBadgeText({ tabId: sender.tab.id, text: msg.off ? 'OFF' : '' });
    }
    return false;
  }

  if (msg.type === 'translate') {
    translate(msg.text, msg.src, msg.tgt)
      .then((result) => sendResponse(Object.assign({ ok: true }, result)))
      .catch((err) => sendResponse({ ok: false, error: String((err && err.message) || err) }));
    return true;
  }

  return false;
});
