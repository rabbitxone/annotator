# 📒 Annotator

The Annotator extension is the perfect tool for adding annotations and personal notes to websites. It's invaluable for conducting in-depth research for projects, essays, articles, and other tasks. This extension makes organizing your information significantly easier.

How does it work? Simply highlight the text you want to annotate, right-click, and choose the annotation option from the context menu. Your highlighted text will appear highlighted. Click on it to open a window where you can add your note and change the highlight color.

The popup menu displays all annotations on the current page. You'll find a button that leads to a full page view of all your annotations, where they can be edited. Additionally, there's a feature that opens a new tab and scrolls directly to a selected annotation.

All data is stored locally on your device. It is never sent to the developer or any other person or company.

## Features

- **Side panel on the page** – all highlights in reading order, a note for the whole page, and notes the extension could no longer find (open it from the popup or with a shortcut).
- **Keyboard shortcuts** – `Ctrl+Shift+L` highlights the selection, `Ctrl+Shift+.` highlights and opens the note, `Ctrl+Shift+,` toggles the side panel. In the color bar, `1`–`5` picks a color and `N` adds a note. Shortcuts can be changed in the browser's extension settings.
- **Formatting in notes** – `**bold**`, `*italics*`, `` `code` ``, lists and links.
- **Notes that lost their text** – when a page changes, select the new wording and click *Pin to selection*. The dashboard can filter notes that were not found.
- **Copy quote with link** – copies the quote, your note and a link that scrolls straight to the text (text fragment), even for people without the extension.
- **Backup and Markdown export** – export everything to a JSON file and import it on another device (importing merges and never deletes), or download notes as a Markdown document.
- **Dashboard tools** – sort by text order, group pages by site, recolor, copy or export a selection, and undo deletions.

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
