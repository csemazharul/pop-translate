# PopTranslate

A tiny Chrome extension that shows an instant translation in a floating popup whenever you select text on any webpage.

- **Default source:** English
- **Default target:** Bengali (বাংলা)
- **Both source and target are user-configurable** — pick from 20 languages.
- **Engine:** [MyMemory](https://mymemory.translated.net) free translation API
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
   - a language badge (e.g. **বাংলা**)
   - the translated result
4. Click anywhere outside the popup, press **Esc**, or click the **×** button to dismiss it.

## Changing source / target language

1. Click the **PopTranslate** icon in the Chrome toolbar.
2. Pick a **Source** language and a **Translate to** language from the dropdowns.
3. Each choice is saved to `chrome.storage.sync` and applies immediately to new selections (and syncs across your Chrome profile if sync is enabled).

If source and target are the same, the popup just echoes the selected text without hitting the API.

## Supported languages

Available for both source and target:

| Code    | Language   | Native       |
|---------|------------|--------------|
| `en`    | English    | English      |
| `zh-CN` | Chinese    | 中文          |
| `hi`    | Hindi      | हिन्दी        |
| `es`    | Spanish    | Español      |
| `fr`    | French     | Français     |
| `ar`    | Arabic     | العربية      |
| `bn`    | Bengali    | বাংলা        |
| `ru`    | Russian    | Русский      |
| `pt`    | Portuguese | Português    |
| `id`    | Indonesian | Indonesia    |
| `de`    | German     | Deutsch      |
| `ja`    | Japanese   | 日本語        |
| `ur`    | Urdu       | اردو         |
| `ko`    | Korean     | 한국어        |
| `it`    | Italian    | Italiano     |
| `tr`    | Turkish    | Türkçe       |
| `vi`    | Vietnamese | Tiếng Việt   |
| `th`    | Thai       | ไทย           |
| `nl`    | Dutch      | Nederlands   |
| `pl`    | Polish     | Polski       |

## Permissions

| Permission | Reason |
|------------|--------|
| `storage`        | Persist the selected source and target language. |
| `clipboard-write`| Write source text to clipboard via the copy button. |
| `host_permissions: https://api.mymemory.translated.net/*` | Call the MyMemory translation API directly. |

No analytics, no tracking, no data sent anywhere except your selected text to MyMemory for translation.

## Limits

- MyMemory's free tier allows roughly **5,000 characters per IP per day** without an API key. Heavy use may temporarily return errors — the popup will display "Translation failed."
- Selections longer than 200 characters are ignored (to keep things snappy and avoid quota burn).
- If you pick a source that doesn't match what you actually highlighted, MyMemory will still try, but the result quality drops.

## File map

| File | Purpose |
|------|---------|
| `manifest.json` | Manifest V3 manifest. |
| `content.js`    | Selection detection, popup rendering, translation fetch. |
| `content.css`   | Popup styles (scoped under `pop-translate-*`). |
| `settings.html` | Toolbar popup UI (source + target dropdowns). |
| `settings.js`   | Loads/saves source and target language via `chrome.storage.sync`. |
| `background.js` | MV3 service worker — sets default languages on install. |
| `README.md`     | This file. |

## Troubleshooting

- **Popup never appears:** Make sure the page has finished loading. Some pages (e.g. `chrome://` URLs, the Chrome Web Store) block content scripts entirely — that's a Chrome restriction, not the extension.
- **"Translation failed.":** Likely a MyMemory rate limit, network blip, or restricted network. Retry in a moment.
- **Setting doesn't stick:** Confirm the `storage` permission is granted (it is requested in the manifest by default).
