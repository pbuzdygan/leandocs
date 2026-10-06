# LeanDocs — Brand Specification

|             |                                                                                                           |
| ----------- | --------------------------------------------------------------------------------------------------------- |
| **Status**  | Approved (owner, 2026-10-02)                                                                              |
| **Version** | 1.0                                                                                                       |
| **Related** | [`UI_SPEC.md`](UI_SPEC.md) (UI tokens), [`branding/`](branding/) (sources and exports), PROJECT_SPEC §110 |

## 1. Name and tagline

- **Name:** LeanDocs. Always one word: capital **L**, capital **D**, no space (not "Lean Docs", "Leandocs" or "LEANDOCS" in running text).
- **Tagline:** _Documentation without the bloat._ (sentence case, with the full stop).
- In code, both come only from `APP_NAME` / `APP_TAGLINE` in `packages/shared/src/branding.ts`.

## 2. Mark: "Folded Stack"

A stack of three slanted document cards rising to the right. The front card has a folded top-right corner and three "lean", shortening text bars (100 / 78 / 52 %). It stands for documents, a stack of plain files, and the lean idea.

| Variant           | File                                | Use                                                                                                         |
| ----------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Full colour       | `branding/logo/mark.svg`            | Default on light backgrounds                                                                                |
| On dark           | `branding/logo/mark-on-dark.svg`    | Dark backgrounds (back card lifted to blue-900)                                                             |
| One colour, dark  | `branding/logo/mark-mono-dark.svg`  | Monochrome on light (print, stamps)                                                                         |
| One colour, light | `branding/logo/mark-mono-light.svg` | Monochrome on dark                                                                                          |
| **Small**         | `branding/logo/mark-small.svg`      | **Below 48 px**: two cards, two thicker bars, no shading. Used for the favicon and the UI logo (`AppLogo`). |

Rules:

- Do not rotate, recolour, outline, add effects to, or change the slant of the mark.
- Use the small variant below 48 px, and the full mark from 48 px up.
- **Clear space** around the mark is at least the width of the folded corner.
- **Minimum size:** 16 px (small variant), 48 px (full mark).

## 3. Wordmark

- Typeface: **Inter ExtraBold (800)**, letter-spacing −0.02 to −0.03 em. This is the UI typeface, so app and brand match.
- Two colours: **Lean** in the ink colour, **Docs** in the accent. In code the split comes from `APP_WORDMARK` (shared) and the UI uses the `Wordmark` component.
- The tagline is set in Inter Medium (500) in a secondary text colour, under the wordmark.

Lockups (mark + wordmark), transparent background:

| File                                                   | Content                   |
| ------------------------------------------------------ | ------------------------- |
| `branding/logo/lockup-light.svg` / `-dark.svg`         | Mark + LeanDocs + tagline |
| `branding/logo/lockup-compact-light.svg` / `-dark.svg` | Mark + LeanDocs           |

The mark sits left of the wordmark, vertically centred, with a gap of about 8 % of the mark height. Never stack the wordmark on top of the mark.

## 4. Colours

The brand uses the UI palette (`UI_SPEC.md` §5, §85).

| Role            | Light                 | Dark      | Token                 |
| --------------- | --------------------- | --------- | --------------------- |
| Card back       | `#1E293B`             | `#1E3A8A` | `--brand-card-back`   |
| Card middle     | `#1D4ED8`             | `#1D4ED8` | `--brand-card-middle` |
| Card front      | `#3B82F6`             | `#3B82F6` | `--brand-card-front`  |
| Fold            | `#BFDBFE`             | `#BFDBFE` | `--brand-fold`        |
| Text bars       | `#FFFFFF`             | `#FFFFFF` | `--brand-bar`         |
| Wordmark "Lean" | `#0F172A`             | `#FFFFFF` | `--text-primary`      |
| Wordmark "Docs" | `#2563EB`             | `#60A5FA` | `--accent`            |
| Tagline         | `#475569`             | `#CBD5E1` | —                     |
| Backgrounds     | `#F8FAFC` / `#FFFFFF` | `#0F172A` | `--bg-app`            |

The full-colour mark uses a gentle light-to-dark shading per card plus a soft shadow between cards. The small variant is flat.

## 5. Banners

| File                                                                         | Size       | Use                                                              |
| ---------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------- |
| `branding/export/social-dark.png` (recommended) / `social-light.png`         | 1280 × 640 | GitHub social preview, Docker Hub, link previews                 |
| `branding/banners/readme-light.svg` / `readme-dark.svg` (+ PNG in `export/`) | 1600 × 400 | Top of `README.md` (picks light or dark with the reader's theme) |

Layout: lockup on the left, large quiet slanted cards in the background (social only). No other decoration.

## 6. Application icons

| File                           | Size     | Where                                          |
| ------------------------------ | -------- | ---------------------------------------------- |
| `favicon.svg`                  | vector   | Browsers (`apps/web/public/`)                  |
| `favicon.ico`                  | 16/32/48 | Legacy browsers, bookmarks                     |
| `apple-touch-icon.png`         | 180      | iOS home screen (full bleed, the OS rounds it) |
| `icon-192.png`, `icon-512.png` | 192, 512 | Web app manifest                               |
| `icon-maskable-512.png`        | 512      | Android adaptive icon (full bleed)             |
| `icon-light-512.png`           | 512      | Light tile for documentation and stores        |

The web copies live in `apps/web/public/` and are referenced by `apps/web/index.html` and `manifest.webmanifest`.

## 7. Regenerating

Every asset is generated from `branding/tools/generate.py` (mark geometry, palette, layouts). Do not edit exported files by hand.

```bash
python3 branding/tools/generate.py
docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp -v "$PWD:$PWD" -w "$PWD" \
  mcr.microsoft.com/playwright:v1.63.0-noble node branding/tools/render.mjs
```

`render.mjs` fits the lockups, exports PNG/ICO to `branding/export/` and copies the web icons to `apps/web/public/`. If the small mark changes, also update the path data in `apps/web/src/components/AppLogo.tsx`.

## 8. Don'ts

- No gradients or effects beyond the defined card shading, no glow, no 3-D extrusion.
- No other colours for the mark (only the one-colour variants).
- No other typeface for the wordmark.
- Do not place the full-colour mark on busy images or on mid-blue backgrounds, where the cards disappear. Use the one-colour variants there.
