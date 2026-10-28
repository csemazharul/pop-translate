// Shared language data and helpers (isSingleWord).
importScripts('languages.js');

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

// retryOn5xx: one quick retry for services that sometimes answer 5xx.
// Errors carry the HTTP status (err.status) so callers can handle e.g. 404.
async function fetchJson(url, { retryOn5xx = false } = {}) {
  const get = () => fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  let res = await get();
  if (retryOn5xx && res.status >= 500) {
    await new Promise((r) => setTimeout(r, 400));
    res = await get();
  }
  if (!res.ok) {
    const err = new Error('HTTP ' + res.status);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// One selected word (letters, apostrophes, hyphens) gets dictionary details.
const isSingleWord = self.popTranslateIsSingleWord;

// Google's bilingual dictionary: word types with meanings in the target language.
function parseDictionary(data) {
  const groups = Array.isArray(data && data.bilingualDictionary) ? data.bilingualDictionary : [];
  return groups
    .filter((g) => g && g.pos && Array.isArray(g.entry) && g.entry.length)
    .slice(0, 4)
    .map((g) => ({ pos: g.pos, words: g.entry.slice(0, 4).map((e) => e.word).filter(Boolean) }))
    .filter((g) => g.words.length);
}

async function translateGoogle(text, src, tgt, withDictionary = false) {
  const url = 'https://translate-pa.googleapis.com/v1/translate?params.client=gtx' +
    '&query.source_language=' + encodeURIComponent(src) +
    '&query.target_language=' + encodeURIComponent(tgt) +
    '&query.text=' + encodeURIComponent(text) +
    '&key=' + GOOGLE_PA_KEY + '&data_types=TRANSLATION' +
    (withDictionary ? '&data_types=BILINGUAL_DICTIONARY_FULL' : '');
  const data = await fetchJson(url);
  if (!data || typeof data.translation !== 'string' || !data.translation) {
    throw new Error('Google: unexpected response');
  }
  const detected = typeof data.sourceLanguage === 'string' && data.sourceLanguage ? data.sourceLanguage : src;
  return { translation: data.translation, src: detected, dictionary: withDictionary ? parseDictionary(data) : [] };
}

// English definitions and examples from dictionaryapi.dev (Wiktionary data, CC BY-SA).
async function defineEnglish(word) {
  const url = 'https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(word.trim().toLowerCase());
  let entries;
  try {
    entries = await fetchJson(url, { retryOn5xx: true });
  } catch (err) {
    if (err.status === 404) return { found: false };
    throw err;
  }
  if (!Array.isArray(entries) || !entries.length) return { found: false };

  const phonetic = entries.map((e) => e.phonetic).find(Boolean) ||
    entries.flatMap((e) => e.phonetics || []).map((p) => p.text).find(Boolean) || '';
  const meanings = [];
  const seen = new Set();
  entries.forEach((entry) => {
    (entry.meanings || []).forEach((m) => {
      // One meaning per word type keeps the popup short.
      if (!m.partOfSpeech || seen.has(m.partOfSpeech) || meanings.length >= 3) return;
      const defs = Array.isArray(m.definitions) ? m.definitions : [];
      // Skip one-line stubs like "To run." that explain nothing.
      const useful = defs.filter((d) => d.definition && d.definition.trim().split(/\s+/).length >= 4);
      const def = useful.find((d) => d.example) || useful[0];
      if (!def) return;
      seen.add(m.partOfSpeech);
      meanings.push({ pos: m.partOfSpeech, definition: def.definition, example: def.example || '' });
    });
  });
  return { found: meanings.length > 0, word: entries[0].word || word, phonetic, meanings };
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

// Loaded on demand from the popup's word details button. src/tgt are the
// languages the translation actually used. Fails only if both sources fail.
async function getWordDetails(word, src, tgt) {
  if (!isSingleWord(word)) return { dictionary: [], definition: null };
  const [dict, def] = await Promise.allSettled([
    translateGoogle(word, src, tgt, true),
    sameLang(src, 'en') ? defineEnglish(word) : Promise.resolve(null),
  ]);
  if (dict.status === 'rejected' && def.status === 'rejected') throw dict.reason;
  return {
    dictionary: dict.status === 'fulfilled' ? dict.value.dictionary : [],
    definition: def.status === 'fulfilled' ? def.value : null,
  };
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

  if (msg.type === 'wordDetails') {
    getWordDetails(String(msg.text || ''), msg.src, msg.tgt)
      .then((result) => sendResponse(Object.assign({ ok: true }, result)))
      .catch((err) => sendResponse({ ok: false, error: String((err && err.message) || err) }));
    return true;
  }

  if (msg.type === 'translate') {
    translate(msg.text, msg.src, msg.tgt)
      .then((result) => sendResponse(Object.assign({ ok: true }, result)))
      .catch((err) => sendResponse({ ok: false, error: String((err && err.message) || err) }));
    return true;
  }

  return false;
});
