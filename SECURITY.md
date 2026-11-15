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
