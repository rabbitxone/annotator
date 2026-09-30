# Annotator

Highlight text and add private notes on any website. Everything stays on your device.

Annotator is handy for research, essays, articles, or just remembering why a page mattered. Select some text, pick a colour from the bar that appears (or right-click → **Highlight and add a note**), and your highlight comes back every time you revisit the page.

## Features

- **Highlights that stick.** Each highlight is stored as a quote plus surrounding context (like the W3C Web Annotation TextQuote selector). It is found again after a reload, when the text spans bold or italic text or links, when the same sentence appears more than once, and on single-page apps that re-render or change URL without reloading.
- **Selection handle.** Select text and a small button appears at the end of the selection; click it for five colours and a note button. It stays out of the way on apps such as video players, editors and canvas-based tools (detected from the page, not from a list of sites), never appears in form fields or menus, and can be forced on or off per site in the popup's Settings. The right-click menu works everywhere.
- **Note editor on the page.** `Ctrl/⌘ + Enter` saves, `Esc` cancels, and a click outside saves. Deleting asks for confirmation in a small dialog inside the note. It lives in a closed Shadow DOM, so websites can't restyle it or read your notes.
- **Popup** with three tabs: this page's notes, the most recent notes across all pages, and settings. A note whose text has disappeared from the page is marked as not found.
- **All notes** page: stats, colour and "has a note" filters, sorting, a per-website view, and multi-select delete.
- **Highlight style**: filled background or underline, with colours that adapt to light and dark pages (detected from the background behind each highlight).
- **English and Polish** interface, chosen from the browser's language.
- **Private by design.** No network requests, no account, no tracking. See [PRIVACY.md](PRIVACY.md).

## Development

Requirements: Node.js 20+.

```sh
npm install
npm run build        # builds dist/chrome and dist/firefox
npm run watch        # rebuilds on change
npm test             # unit tests (URL normalisation, migration, anchoring)
npm run test:e2e     # loads dist/chrome in Chromium via Playwright and walks the main flows
npm run package      # zips both builds + a source archive for AMO into artifacts/
npm run icons        # re-renders src/icons/icon-*.png from src/icons/icon.svg
```

Load the unpacked extension:

- **Chrome/Edge:** `chrome://extensions` → Developer mode → *Load unpacked* → `dist/chrome`
- **Firefox:** `about:debugging#/runtime/this-firefox` → *Load Temporary Add-on* → `dist/firefox/manifest.json`

### Layout

```
src/
  background/     service worker / event page: context menu, badge, "open note in new tab"
  content/        content script: anchoring, highlight marks, selection bar + note editor (Shadow DOM)
  pages/          popup and "All notes" dashboard, shared components and styles
  shared/         storage + migration, i18n, icons, design tokens, URL normalisation
  _locales/       en, pl
  icons/          icon.svg (source) and rendered PNGs
scripts/          build.mjs (esbuild), render-icons.mjs
test/             unit (node:test) and e2e (Playwright)
```

The build bundles with esbuild without minifying, so the installed code stays readable. Firefox and Chrome manifests are generated from one definition in `scripts/build.mjs`.

### Data

Notes are stored in `storage.local`, one key per page (`page:<normalized URL>`). URLs are normalized by dropping in-page `#fragments` (hash routes like `#/inbox` are kept) and tracking parameters (`utm_*`, `fbclid`, `gclid`, …). Data from 1.x is migrated automatically on first run, and the original object is kept under `legacyBackup`.

---

[Privacy policy](PRIVACY.md)
