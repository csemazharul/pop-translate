# PeekTranslate

A tiny Chrome extension that shows an instant translation in a floating popup whenever you select text on any webpage.

- **Source language:** English
- **Default target:** Bangla (বাংলা)
- **Other targets:** Spanish, French, Portuguese, Arabic
- **Engine:** [MyMemory](https://mymemory.translated.net) free translation API
- **Stack:** React 18, Tailwind CSS, Vite, Manifest V3

## Install (developer mode)

1. Clone or download this folder so you have a local copy of the files.
2. Install dependencies and build:
   ```bash
   npm install
   npm run build
   ```
3. Open Chrome and go to `chrome://extensions`.
4. Toggle **Developer mode** on (top-right).
5. Click **Load unpacked** and select the `dist` folder.
6. PeekTranslate will appear in your extensions list and toolbar.

> **Note on icons:** This build does not ship icon images. Chrome will use a default placeholder icon — the extension still works fully. Drop your own `icon16.png`, `icon48.png`, `icon128.png` into the `public` folder and add an `"icons"` field to `public/manifest.json` if you want a custom icon.

## Usage

1. Visit any webpage (Wikipedia, Google, YouTube, Twitter — anything).
2. **Highlight a word or short phrase.**
3. A small blue/white popup appears just below the selection with:
   - the original text
   - a language badge (e.g. **বাংলা**)
   - the translated result
4. Click anywhere outside the popup, press **Esc**, or click the **×** button to dismiss it.

## Changing the target language

1. Click the **PeekTranslate** icon in the Chrome toolbar.
2. Pick a language from the list. A ✓ marks the active one.
3. The choice is saved to `chrome.storage.sync` and applies immediately to new selections (and syncs across your Chrome profile if sync is enabled).

## Supported targets

| Code | Language   | Badge      |
|------|------------|------------|
| `bn` | Bangla     | বাংলা      |
| `es` | Spanish    | Español    |
| `fr` | French     | Français   |
| `pt` | Portuguese | Português  |
| `ar` | Arabic     | العربية    |

## Permissions

| Permission | Reason |
|------------|--------|
| `activeTab` | Read the current selection on the active tab. |
| `storage`   | Persist the selected target language. |
| `scripting` | Future-proof injection support per Manifest V3. |
| `host_permissions: https://api.mymemory.translated.net/*` | Call the MyMemory translation API directly. |

No analytics, no tracking, no data sent anywhere except your selected text to MyMemory for translation.

## Limits

- MyMemory's free tier allows roughly **5,000 characters per IP per day** without an API key. Heavy use may temporarily return errors — the popup will display "Translation failed."
- Selections longer than 200 characters are ignored (to keep things snappy and avoid quota burn).
- Source language is fixed to English (`en`).

## File map

| File | Purpose |
|------|---------|
| `public/manifest.json` | Manifest V3 manifest (copied to `dist`). |
| `public/background.js` | MV3 service worker — sets default language on install. |
| `src/content/index.jsx` | Content script entry — handles text selection and mounts the React popup inside a Shadow DOM. |
| `src/content/App.jsx` | React component for the floating translation popup. |
| `src/popup/main.jsx` | Popup entry point. |
| `src/popup/App.jsx` | React component for the toolbar language selector. |
| `src/lib/constants.js` | Shared language data and config. |
| `README.md` | This file. |

## Troubleshooting

- **Popup never appears:** Make sure the page has finished loading. Some pages (e.g. `chrome://` URLs, the Chrome Web Store) block content scripts entirely — that's a Chrome restriction, not the extension.
- **"Translation failed.":** Likely a MyMemory rate limit, network blip, or restricted network. Retry in a moment.
- **Setting doesn't stick:** Confirm the `storage` permission is granted (it is requested in the manifest by default).
