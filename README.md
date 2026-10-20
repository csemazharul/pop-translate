# PopTranslate

A tiny Chrome extension that shows an instant translation in a floating popup whenever you select text on any webpage.

- **Default source:** Auto-detect
- **Default target:** Bengali (বাংলা)
- **Both source and target are user-configurable** — all 249 languages Google Translate supports, popular ones listed first, or let the source be auto-detected.
- **Engine:** Google Translate, with [MyMemory](https://mymemory.translated.net) as automatic fallback
- **On/off switch:** pause the selection popup everywhere or just on the current site (icon shows an `OFF` badge)
- **Stays out of your way:** never pops up when you select text inside inputs, text areas or rich-text editors
- **Stack:** Pure vanilla JS, Manifest V3, no external libraries

## Install (developer mode)

1. Clone or download this folder so you have a local copy of the files.
2. Open Chrome and go to `chrome://extensions`.
3. Toggle **Developer mode** on (top-right).
4. Click **Load unpacked** and select the `pop-translate` folder.
5. PopTranslate will appear in your extensions list and toolbar.

> **Note on icons:** This build does not ship icon images. Chrome will use a default placeholder icon — the extension still works fully. Drop your own `icon16.png`, `icon48.png`, `icon128.png` into the folder and add an `"icons"` field to `manifest.json` if you want a custom icon.

## Usage

1. Visit any webpage (Wikipedia, Google, YouTube, Twitter — anything).
2. **Highlight a word or short phrase.**
3. A small blue/white popup appears just below the selection with:
   - the original text
   - a language badge showing the detected source and the target (e.g. **English → বাংলা**)
   - the translated result
4. Click anywhere outside the popup, press **Esc**, or click the **×** button to dismiss it.

If translation fails, the popup offers **Retry** and **Open in Google Translate**.

## Changing source / target language

1. Click the **PopTranslate** icon in the Chrome toolbar.
2. Pick a **Source** language and a **Translate to** language from the dropdowns.
3. Each choice is saved to `chrome.storage.sync` and applies immediately to new selections (and syncs across your Chrome profile if sync is enabled).

With **Auto-detect**, text that is already in your target language is translated to English instead (e.g. select Bangla text with target Bengali → you get English).

If source and target are the same, the popup just echoes the selected text without hitting the API.

## Turning the popup on / off

Click the toolbar icon and flip **Translate on selection**. Takes effect immediately on all open tabs. While off, the toolbar icon shows an `OFF` badge.

To turn it off only for the site you're on, flip **On this site** instead. The list of turned-off sites is saved in `chrome.storage.sync`.

## Feedback & contributing

The toolbar popup links to [feature requests](https://github.com/csemazharul/pop-translate/issues/new?labels=enhancement), [feedback / bug reports](https://github.com/csemazharul/pop-translate/issues/new) and the [GitHub repo](https://github.com/csemazharul/pop-translate). Pull requests welcome.

## Supported languages

Every language Google Translate supports: 248 as source, 249 as target (Chinese (Traditional) is target-only). The list lives in `languages.js`, shared by the content script and the settings popup. Each dropdown shows a **Popular** group first (English, Bengali, Hindi, Urdu, Arabic, Chinese, major European and South/Southeast Asian languages), then **All languages** A–Z. Tip: with a dropdown open, type a language name to jump to it.

Notes:
- The speak button uses your system's voices, so rarer languages may stay silent.
- The MyMemory fallback supports fewer languages; if Google is down, rare languages may fail. Use **Retry** or **Open in Google Translate**.

## Permissions

| Permission | Reason |
|------------|--------|
| `storage`        | Persist the selected languages, the on/off switch and the turned-off sites. |
| `clipboard-write`| Write the translation to clipboard via the copy button. |
| `activeTab`      | Read the current tab's site name when you open the toolbar popup, for the **On this site** switch. No install warning. |

No host permissions: both the Google endpoint (`translate-pa.googleapis.com`) and MyMemory (`api.mymemory.translated.net`) allow cross-origin requests, so the service worker can call them without extra permissions.

No analytics, no tracking, no data sent anywhere except your selected text to Google Translate (or MyMemory, if Google fails) for translation.

## Limits

- Google is tried first. If it fails, MyMemory is used; its free tier allows roughly **5,000 characters per IP per day**. If both fail the popup shows "Translation failed."
- Selections longer than 200 characters are ignored (to keep things snappy and avoid quota burn).
- If you pick a source that doesn't match what you actually highlighted, result quality drops.

## File map

| File | Purpose |
|------|---------|
| `manifest.json` | Manifest V3 manifest. |
| `languages.js`  | Supported language list (codes, English and native names, popular set). |
| `content.js`    | Selection detection, popup rendering; asks the service worker to translate. |
| `content.css`   | Popup styles (scoped under `pop-translate-*`). |
| `settings.html` | Toolbar popup UI (on/off switch, language dropdowns, feedback links). |
| `settings.js`   | Loads/saves settings via `chrome.storage.sync`. |
| `background.js` | MV3 service worker — defaults, `OFF` badge, translation (Google → MyMemory fallback). |
| `README.md`     | This file. |

## Troubleshooting

- **Popup never appears:** Make sure the page has finished loading. Some pages (e.g. `chrome://` URLs, the Chrome Web Store) block content scripts entirely — that's a Chrome restriction, not the extension.
- **Popup never appears:** Check **Translate on selection** is on (no `OFF` badge on the icon). After reloading the extension, refresh open tabs.
- **"Translation failed.":** Both Google and MyMemory failed — usually a network blip or restricted network. Retry in a moment.
- **Setting doesn't stick:** Confirm the `storage` permission is granted (it is requested in the manifest by default).
