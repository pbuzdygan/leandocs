# LeanDocs brand assets

The brand is **final** (owner, 2026-10-02): mark **Folded Stack** + wordmark **Inter ExtraBold**. The rules are in [`BRAND_SPEC.md`](../BRAND_SPEC.md). For an overview, open `preview.html` or look at `export/brand-sheet.png`.

```text
branding/
├── preview.html        brand sheet (open in a browser)
├── logo/               mark (colour, on-dark, mono, small) and lockups (with/without tagline, light/dark)
├── icons/              favicon.svg, app icons (dark, light, maskable) — SVG sources
├── banners/            social 1280×640 and README header 1600×400, light/dark — SVG sources
├── export/             PNG/ICO exports (favicon.ico, apple-touch-icon, PWA icons, banners, brand sheet)
├── examples/           the owner's reference images that inspired the form
├── source/fonts/       Inter (embedded in the SVGs), SIL OFL 1.1
└── tools/              generate.py (SVG sources) + render.mjs (fit lockups, PNG/ICO export, copy to apps/web/public)
```

All files are generated. Regenerate with the commands in BRAND_SPEC §7 instead of editing them by hand.
