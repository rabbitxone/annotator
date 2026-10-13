# 📒 Annotator

The Annotator extension is the perfect tool for adding annotations and personal notes to websites. It's invaluable for conducting in-depth research for projects, essays, articles, and other tasks. This extension makes organizing your information significantly easier.

How does it work? Simply highlight the text you want to annotate, right-click, and choose the annotation option from the context menu. Your highlighted text will appear highlighted. Click on it to open a window where you can add your note and change the highlight color.

The popup menu displays all annotations on the current page. You'll find a button that leads to a full page view of all your annotations, where they can be edited. Additionally, there's a feature that opens a new tab and scrolls directly to a selected annotation.

All data is stored locally on your device. It is never sent to the developer or any other person or company.

## Features

- **Side panel on the page** – all highlights in reading order, a note for the whole page, and notes the extension could no longer find (open it from the popup or with a shortcut).
- **Keyboard shortcuts** – `Ctrl+Shift+L` (`⇧⌘L` on a Mac) highlights the selection, `Ctrl+Shift+.` (`⇧⌘.`) highlights and opens the note, `Ctrl+Shift+,` (`⇧⌘,`) toggles the side panel. In the color bar, `1`–`9` pick a category by position, `/` searches all categories and `N` adds a note. Shortcuts can be changed in the browser's extension settings.
- **Your own categories** – in *Settings → Categories* rename the colors after what you mark ("Sample size", "Outcome"…), recolor them, add up to 60 more, reorder them and give each a key. With *Quick keys* on, select text and press a category's key to highlight it at once (never inside text fields). The color bar shows the first six categories and a searchable list for the rest. Exports (CSV *Category* column, Markdown, JSON backup) use your names; deleting a category moves its notes to another one.
- **Formatting in notes** – `**bold**`, `*italics*`, `` `code` ``, lists and links.
- **Notes that lost their text** – when a page changes, select the new wording and click *Pin to selection*. The dashboard can filter notes that were not found.
- **Copy quote with link** – copies the quote, your note and a link that scrolls straight to the text (text fragment), even for people without the extension.
- **Export** – the *Export* button (dashboard header, Settings or the selection bar) opens a dialog where you pick what to export (all notes, the current list or your selection) and the format:
  - **JSON** – a full backup with colors, categories and notes, which you can import on another device (importing merges and never deletes).
  - **Markdown** – a readable document with colors, dates and links, organized by page or by color.
  - **CSV** – one row per highlight (page, URL, color name and code, text, note, dates) that opens in Excel, Google Sheets or LibreOffice. Text starting with `=`, `+`, `-` or `@` gets a leading apostrophe so spreadsheets never run it as a formula.

  Only JSON files can be imported back.
- **Dashboard tools** – sort by text order, group pages by site, recolor, copy or export a selection, and undo deletions.

Annotator stays out of the way in web apps (mail, chat, editors) and turns on for articles. To tell them apart it uses the same check Firefox uses to offer Reader View ([Mozilla Readability](https://github.com/mozilla/readability), Apache-2.0), together with the page's own `og:type`/schema.org article markup.

### Local files

Annotator works on HTML files saved on your computer too (handy for collections of papers or saved articles):

- **Chrome** keeps extensions out of local files until you turn on *Allow access to file URLs* in the extension's details (`chrome://extensions`).
- **Firefox** (153 and later) does the same: in `about:addons`, open Annotator's *Permissions and data* tab and turn on *Access local files on your computer*. Firefox doesn't let extensions open that page, so Annotator copies its address for you.
- Annotator checks for this and shows where to switch it on: in the popup, in Settings, and on the icon when you try to highlight.
- PDFs can't be annotated: both browsers open them in their own viewer, which extensions can't reach. The popup and the icon say so instead of failing silently.
- Local pages are named by their file name and grouped by folder; the CSV export has a *File or site* column with the full path. One *off on this site* rule covers all local files.
- Notes are stored under the file's path. If you move the files (another folder, drive or computer), use *Settings → Moved your files? → Change location* to point the notes at the new place. It also works for websites that changed their address, and can be undone when no notes had to be combined.
- Lists draw in batches, so the dashboard stays fast with tens of thousands of notes (tested with 100,000 highlights across 20,000 files).

## Development

```sh
npm install
npm run build   # dist/chrome and dist/firefox
npm test        # unit tests
```

## Screenshots

<img width="1400" height="875" alt="01-highlight-note-wikipedia" src="https://github.com/user-attachments/assets/730fb439-908c-4d47-a739-e6019f7055a6" />
<img width="1488" height="930" alt="02-highlight-note-forbes" src="https://github.com/user-attachments/assets/bbb7cc32-ee30-480f-938a-cb5eb3c39270" />
<img width="1816" height="1135" alt="03-highlight-in-article" src="https://github.com/user-attachments/assets/297d57bf-f108-4b0d-806e-c0ee0bc43322" />
<img width="1776" height="1110" alt="04-extension-popup" src="https://github.com/user-attachments/assets/dd16b06c-659c-4886-bdec-b0c6812eb702" />
<img width="2784" height="1740" alt="05-all-notes-dashboard" src="https://github.com/user-attachments/assets/8b261b81-68bd-4403-9128-396f10769d3d" />

---

[See privacy policy](https://github.com/RabbitXOne/annotator/blob/main/PRIVACY.md)

![annotator_full](https://github.com/user-attachments/assets/69065029-387d-402b-9aea-83f6b8ebc3a8)
