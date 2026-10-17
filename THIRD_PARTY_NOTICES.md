# Third-party notices

Annotator is licensed under the Apache License 2.0 (see `LICENSE`).
It bundles or builds with the following third-party components.

| Component | Version | License | Used for |
|---|---|---|---|
| [@mozilla/readability](https://github.com/mozilla/readability) | 0.6.0 | Apache-2.0 | Article detection (bundled) |
| [@fontsource/dm-sans](https://fontsource.org/fonts/dm-sans) | 5.3.0 | OFL-1.1 | Font files (bundled) |
| [@fontsource/fraunces](https://fontsource.org/fonts/fraunces) | 5.3.0 | OFL-1.1 | Font files (bundled) |
| [@hugeicons/core-free-icons](https://github.com/hugeicons/hugeicons) | 4.3.5 | MIT | Icons (bundled) |
| [esbuild](https://github.com/evanw/esbuild) | 0.28.2 | MIT | Build tool only, not shipped |

Versions follow `package-lock.json`. Full license texts are in each package under
`node_modules/<package>/` and, for Mozilla Readability, in the built extension under
`licenses/readability-LICENSE.md`.

The fonts DM Sans and Fraunces are licensed under the SIL Open Font License 1.1
(https://openfontlicense.org). They are distributed unmodified apart from format
conversion by the Fontsource packages and are not sold on their own.
