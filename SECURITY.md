# Security policy

## Reporting a vulnerability

Please report security issues privately through GitHub's
[private vulnerability reporting](https://github.com/rabbitxone/annotator/security/advisories/new)
or by e-mail to browsers@rabbitone.com. Please don't open a public issue for a vulnerability.

You can expect a reply within a few days. Fixes ship in the next release of the extension, and credit is given
in the release notes if you want it.

## Supported versions

Only the latest published version of the extension is supported.

## Scope notes

Annotator makes no network requests of its own and stores everything locally in the browser's extension storage. The only
fetch is the optional *Page icons* feature in Firefox, which downloads a tab's icon solely from the page's own HTTPS host
(never in private windows). The
most relevant reports are about page access (content script), the handling of imported files, and the
handling of untrusted page content.

## Known limitations

- **Page overlays.** A page can cover Annotator's interface with its own top-layer element (a dialog or popover) and
  imitate a toolbar. Annotator cannot prevent this from a content script.
- **Highlights are visible to the page.** Highlighted text is wrapped in elements that a page's `MutationObserver` can
  see, including the category; this also lets a page detect that the extension is installed.
- **Clipboard fallback.** When the asynchronous Clipboard API is unavailable, copying falls back to `execCommand('copy')`,
  whose `copy` event is visible to page listeners.
- **Focus.** A page can see the window lose focus when someone enters the note editor and may move focus to its own
  invisible field. This is the same class of attack as overlays and cannot be prevented from a content script.
- **Note editor.** The note editor runs in an extension-origin iframe so that scripts of the page cannot observe
  typing. `editor.html` is web-accessible, so a page can tell that the extension is present.
