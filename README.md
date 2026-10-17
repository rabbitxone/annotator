# 📒 Annotator

The Annotator extension is the perfect tool for adding annotations and personal notes to websites. It's invaluable for conducting in-depth research for projects, essays, articles, and other tasks. This extension makes organizing your information significantly easier.

How does it work? Simply highlight the text you want to annotate, right-click, and choose the annotation option from the context menu. Your highlighted text will appear highlighted. Click on it to open a window where you can add your note and change the highlight color.

The popup menu displays all annotations on the current page. You'll find a button that leads to a full page view of all your annotations, where they can be edited. Additionally, there's a feature that opens a new tab and scrolls directly to a selected annotation.

All data is stored locally on your device. It is never sent to the developer or any other person or company.

## Features

- **Guide** – opens after installing (and from *How it works* in the dashboard or popup settings) with a practice paragraph. Nothing done there is saved.
- **Side panel** – all highlights in reading order, a note for the whole page, and notes that lost their text.
- **Keyboard shortcuts** – `Alt+Q` (`⌃Q` on a Mac) highlights, `Alt+W` (`⌃W`) highlights with a note, `Alt+X` (`⌃X`) toggles the side panel. In the color bar, `1`–`9` pick a category, `/` searches categories and `N` adds a note. Change them in the browser's extension shortcut settings.
- **Categories** – rename, recolor, reorder and add colors (up to 60) in *Settings → Categories*, each with an optional key. With *Quick keys* on, select text and press a category's key (never inside text fields). Deleting a category moves its notes to another one.
- **Formatting in notes** – `**bold**`, `*italics*`, `` `code` ``, lists and links.
- **Lost notes** – when a page changes, select the new wording and click *Pin to selection*.
- **Copy quote with link** – the quote, your note and a link that scrolls to the text, even without the extension.
- **Export** – all notes, the current list or a selection:
  - **JSON** – a full backup (notes, categories, settings) that can be imported on another device. Importing merges and never deletes.
  - **Markdown** – grouped by page or by color.
  - **CSV** – one row per highlight, for Excel, Google Sheets or LibreOffice. Cells starting with `=`, `+`, `-` or `@` get a leading apostrophe so they never run as formulas.
- **Dashboard** – sort by position in the text, group pages by site, recolor, copy, export and undo deletions.

Annotator stays out of the way in web apps (mail, chat, editors) and turns on for articles, using the same check as Firefox's Reader View ([Mozilla Readability](https://github.com/mozilla/readability), Apache-2.0) and the page's `og:type`/schema.org markup.

### Local files

- **Chrome**: turn on *Allow access to file URLs* in the extension's details (`chrome://extensions`).
- **Firefox** (153+): in `about:addons`, open Annotator's *Permissions and data* tab and turn on *Access local files on your computer*. Firefox doesn't let extensions open that page, so Annotator copies its address.
- The popup, Settings and the toolbar icon show when access is off.
- PDFs open in the browser's own viewer, which extensions can't reach; the popup and icon say so.
- Local pages are named by file and grouped by folder. One *off on this site* rule covers all local files.
- Moved your files? *Settings → Moved your files? → Change location* points the notes at the new place (also for websites that changed address).
- The dashboard draws lists in batches and stays fast with 100,000 highlights.

## Development

```sh
npm install
npm run build   # dist/chrome and dist/firefox
npm test        # unit tests
```

## Screenshots

<img width="2784" height="1740" alt="01-note" src="https://github.com/user-attachments/assets/21553593-0332-42c7-a7d3-d797a8579775" />
<img width="2784" height="1740" alt="02-panel" src="https://github.com/user-attachments/assets/ed83d8c1-82c0-4f04-a425-e5b5d77524c7" />
<img width="2784" height="1740" alt="03-toolbar" src="https://github.com/user-attachments/assets/752a13bf-f2a7-4884-9be9-25533cad76cf" />
<img width="2784" height="1740" alt="04-dashboard" src="https://github.com/user-attachments/assets/c682e7a5-b25b-4902-9804-71f695d78eae" />
<img width="2784" height="1740" alt="05-export" src="https://github.com/user-attachments/assets/a85fa7f5-9142-41b5-9e1c-ba0c6fb00b17" />
<img width="2784" height="1740" alt="06-categories" src="https://github.com/user-attachments/assets/71b3961e-6f75-4c8f-aa7a-7ef03b35682d" />

## License

Copyright 2025-2026 Filip Polak. Licensed under the [Apache License 2.0](LICENSE). Third-party components are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). To cite this software, see [CITATION.cff](CITATION.cff).

---

[See privacy policy](https://github.com/RabbitXOne/annotator/blob/main/PRIVACY.md)

![annotator_full](https://github.com/user-attachments/assets/69065029-387d-402b-9aea-83f6b8ebc3a8)
