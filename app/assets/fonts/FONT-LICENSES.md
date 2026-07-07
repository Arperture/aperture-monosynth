# Font licenses

This app self-hosts three typefaces. They are **not** covered by the
repository's MIT license — each ships under its own font license:

| Font | Files | License | Source |
|------|-------|---------|--------|
| Hanken Grotesk | `hankengrotesk-400/600.woff2` | [SIL Open Font License 1.1](https://openfontlicense.org) | [Google Fonts](https://fonts.google.com/specimen/Hanken+Grotesk) |
| Space Mono | `spacemono-400/700.woff2` | [SIL Open Font License 1.1](https://openfontlicense.org) | [Google Fonts](https://fonts.google.com/specimen/Space+Mono) |
| Clash Display | `clash-display-500/600.woff2` (not committed) | [Fontshare Free Font License](https://www.fontshare.com/licenses/itf-ffl) | [Fontshare](https://www.fontshare.com/fonts/clash-display) |

The OFL fonts are included unmodified. Clash Display's license does not permit
redistribution of the font files, so they are excluded from the repository —
run `./scripts/fetch-fonts.sh` after cloning to download them from Fontshare.
The UI falls back to Hanken Grotesk when Clash Display is absent.
