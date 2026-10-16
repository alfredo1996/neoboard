# Bundled Fonts

All three families are licensed under the SIL Open Font License 1.1 (OFL-1.1)
and self-hosted here so the component library, Storybook and the app render
identically everywhere without network font fetches (#830, #1683, #2215).

The woff2 files are Fontsource subsets (latin and latin-ext), served locally.
Fontsource packages the upstream releases unchanged: https://fontsource.org

| Family                             | Copyright holder                            | Upstream                                    | Files                                                                                                                                      |
| ---------------------------------- | ------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Source Serif 4 (variable, weight)  | © Adobe, with Reserved Font Name "Source"   | https://github.com/adobe-fonts/source-serif | `source-serif-4-latin-wght.woff2`, `source-serif-4-latin-ext-wght.woff2`                                                                   |
| IBM Plex Sans (variable, weight)   | © IBM Corp., with Reserved Font Name "Plex" | https://github.com/IBM/plex                 | `ibm-plex-sans-latin-wght.woff2`, `ibm-plex-sans-latin-ext-wght.woff2`                                                                     |
| IBM Plex Mono (static 400 and 500) | © IBM Corp., with Reserved Font Name "Plex" | https://github.com/IBM/plex                 | `ibm-plex-mono-latin-400.woff2`, `ibm-plex-mono-latin-ext-400.woff2`, `ibm-plex-mono-latin-500.woff2`, `ibm-plex-mono-latin-ext-500.woff2` |

Fontsource releases used: Source Serif 4 v5.3.1, IBM Plex Sans v5.3.0.

License text: https://openfontlicense.org (OFL-1.1). The fonts may be bundled
and redistributed with this software; they may not be sold on their own.
