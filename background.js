const DEFAULT_LANG = 'bn';

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get({ targetLang: null }, (res) => {
    if (!res || !res.targetLang) {
      chrome.storage.sync.set({ targetLang: DEFAULT_LANG });
    }
  });
});
