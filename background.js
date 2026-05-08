const DEFAULT_SOURCE = 'en';
const DEFAULT_TARGET = 'bn';

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get({ sourceLang: null, targetLang: null }, (res) => {
    const updates = {};
    if (!res.sourceLang) updates.sourceLang = DEFAULT_SOURCE;
    if (!res.targetLang) updates.targetLang = DEFAULT_TARGET;
    if (Object.keys(updates).length) chrome.storage.sync.set(updates);
  });
});
