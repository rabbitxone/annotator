# Notatki dla reviewera: poprawki z raportu bezpieczeństwa

Gałąź: `ccr-84bdf327-i3sbmn` (4 commity na `ce8720e`). Testy: `npm test` → 98/98. `npm run build` i `web-ext lint` bez błędów i ostrzeżeń.

## Jak czytać

Commity są ułożone tematycznie, można je przeglądać osobno.

| Commit | Zakres | Pozycje z raportu |
|---|---|---|
| `b83a1ce` | import, parser Markdown, eksporty, URL-e | M-5, M-6, M-7, L-1, L-2, L-4, L-5, L-9 |
| `a73eca4` | background, favicon, zdarzenia, CSP | M-1, M-4, L-3, L-6, hardening |
| `70e46ad` | edytor notatek w iframe | H-1 |
| `69e23b6` | drobny hardening, dokumentacja, testy | hardening, testy |

## Na co zwrócić uwagę najbardziej

1. **H-1: `src/content/frame-editor.js`, `src/pages/editor/index.js`**
   - Zabezpieczenie opiera się na tokenie w hashu URL iframe. Iframe przyjmuje `init` tylko z `window.parent` i z właściwym tokenem. Czy to wystarczy? Strona nie zna tokenu, bo iframe jest w zamkniętym shadow root.
   - `editor.html` jest web-accessible dla `<all_urls>`. Nie użyłem `use_dynamic_url`: w Chrome `runtime.getURL` zwraca wtedy adres, którego iframe nie może załadować (sprawdziłem w prawdziwym Chromium). Skutek: strona może wykryć rozszerzenie po zasobie `editor.html`.
   - Zachowanie zmieniło się nieznacznie: tooltip przy linkach w edytorze zniknął (przycinałby go iframe). Ctrl+klik działa.
   - **Nie sprawdzałem Firefoxa w przeglądarce**, tylko `web-ext lint`.
   - Test ręczny: `test/e2e/note-isolation.cjs` (Playwright, Chromium z rozszerzeniem). Nie jest podpięty do `npm test` ani do CI.

2. **Import (`src/shared/exchange.js`)** to zmiana zachowania dla istniejących plików kopii:
   - rekordy z id dłuższym niż 200 znaków lub nie-stringowym (poza liczbą) są odrzucane;
   - pozycje z `start > end`, ujemne lub nieskończone są pomijane (adnotacja zostaje, bez `position`);
   - daty z przyszłości (więcej niż doba) są przycinane do „teraz", ujemne zastępowane „teraz";
   - strony `file://host/...` z hostem innym niż `localhost` są odrzucane. Użytkownicy z udziałami sieciowymi stracą te notatki przy imporcie. Za to `normalizeUrl` nadal je akceptuje na żywych stronach, więc istniejące dane się nie psują.
   - limity w `IMPORT_LIMITS` (50 MB, 20 000 stron, 200 000 adnotacji). Są wybrane „na oko", warto je przejrzeć.

3. **Router wiadomości (`src/background/messages.js`)**: logika wyciągnięta z `index.js` bez zmiany protokołu, ale z nowymi ograniczeniami: `count`, `enabled` i `save-favicon` tylko z głównej ramki; `tab-command` tylko z białej listy typów. Warto sprawdzić, czy żaden istniejący przepływ nie wysyła innego typu.

4. **Favicon (`src/shared/favicon.js`, `src/background/favicon.js`)**: w Firefoxie ikony z innego hosta niż strona już się nie pobierają, więc część stron będzie bez ikony. To zamierzone (zgodność z `PRIVACY.md`). Usunąłem też fallback surowego SVG.

## Zmiany widoczne dla użytkownika

- Import ustawień pyta o potwierdzenie (nowe teksty `importSettings*` w PL i EN).
- Eksport Markdown: `<` w notatkach jest escapowany, linki poza `https`, `mailto`, `#` i adresami względnymi są wyłączone.
- CSV: komórki z wiodącą spacją, NBSP lub pełnoszerokim `＝` dostają apostrof.
- Linki w renderowanym Markdownie mają `title` z prawdziwym adresem.
- Id kategorii `constructor` i `prototype` nie są już dozwolone. Istniejące kategorie o takich id zostaną odrzucone przy odczycie.

## Czego celowo nie zrobiłem

- **M-2** (magazyn tylko w background): duże przepisanie warstwy danych, do osobnego PR.
- **M-3** (zaznaczenia widoczne dla strony): wymaga CSS Custom Highlight API i zmiany kotwiczenia.
- **L-7** (schowek): fallback `execCommand('copy')` zostaje, opisany w `SECURITY.md`.
- **L-8** (incognito): decyzja produktowa. Klucz `incognito: "not_allowed"` wyłączyłby rozszerzenie w oknach prywatnych w Chrome.
- **CSP:** nie dodałem `img-src` ani `connect-src`, bo nie sprawdzałem w przeglądarce, czy panele nie używają innych źródeł.
- **Hardening:** pominąłem `optional_host_permissions`, bo zmienia model uprawnień.
- **Supply chain:** `scripts/render-icons.mjs` bez zmian (narzędzie deweloperskie).
- **Testy DOM:** `content-events` wymaga `happy-dom` albo e2e w CI.

## Zmiany poza kodem

- `.DS_Store` usunięty z indeksu git.
- `ci.yml`: dodany krok `npm audit signatures`. Może zawieść, jeśli któryś pakiet nie ma podpisu. Sprawdź pierwszy bieg CI.
- `scripts/publish/lib.mjs`: `::` w wypisywanych błędach jest neutralizowane, żeby odpowiedź API nie wstrzyknęła komendy workflow.
- `PRIVACY.md` i `SECURITY.md` poprawione zgodnie z faktycznym zachowaniem favicona. `SECURITY.md` ma nową sekcję „Known limitations".

## Testy

Nowe pliki: `test/unit/security.test.js` i `test/unit/security-extra.test.js` (27 przypadków: import, wydajność, CSV, Markdown, URL-e, wiadomości, favicon, kategorie, migracja). Zmieniłem dwie asercje w `url.test.js`, które wymagały starego zachowania UNC.

Testy wydajnościowe używają progów czasowych (do 1,5 s). Na wolnym CI mogą być niestabilne. Progi są hojne względem pomiarów, ale warto to mieć na uwadze.
