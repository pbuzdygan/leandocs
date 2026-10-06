#!/usr/bin/env python3
"""
LeanDocs brand assets (final: mark "C · Folded Stack", wordmark Inter). See BRAND_SPEC.md.

Motif (from the owner's references in branding/examples/, colours excluded): a stack of slanted
document cards rising to the right, the front card carrying three rounded text bars. The marks are
filled, layered shapes. The wordmark is a heavy geometric sans: "Lean" neutral, "Docs" in the
accent. The tagline sits underneath in a lighter weight.

Colours come from the LeanDocs UI tokens (UI_SPEC §5): slate/navy neutrals + the blue accent.

Run from the repository root:
    python3 branding/tools/generate.py      # SVG sources + preview.html
    (then branding/tools/render.mjs fits the lockups and renders PNG previews)
"""

from __future__ import annotations

import base64
import math
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "branding"
FONTS_DIR = OUT / "source/fonts"

NAME_A, NAME_B = "Lean", "Docs"
TAGLINE = "Documentation without the bloat."

# --- Palette (UI tokens) ----------------------------------------------------------------------
SLATE_900 = "#0f172a"
SLATE_800 = "#1e293b"
SLATE_700 = "#334155"
SLATE_600 = "#475569"
SLATE_500 = "#64748b"
SLATE_400 = "#94a3b8"
SLATE_300 = "#cbd5e1"
SLATE_200 = "#e2e8f0"
SLATE_100 = "#f1f5f9"
SLATE_50 = "#f8fafc"
WHITE = "#ffffff"
BLUE_700 = "#1d4ed8"
ACCENT = "#2563eb"  # --accent (light)
BLUE_500 = "#3b82f6"
BLUE_400 = "#60a5fa"  # --accent (dark)
BLUE_200 = "#bfdbfe"


@dataclass
class Palette:
    """Back → front card colours, bar colour, fold colour."""

    layers: list[str]
    bars: str = WHITE
    fold: str = BLUE_200
    highlight: str = "rgba(255,255,255,0.18)"


PALETTES = {
    # navy → accent → bright blue (mirrors the depth of the references)
    "blue": Palette([SLATE_800, BLUE_700, BLUE_500]),
    # for dark backgrounds: the back card is lifted so it does not disappear
    "blue-on-dark": Palette(["#1e3a8a", BLUE_700, BLUE_500], highlight="rgba(255,255,255,0.22)"),
    # one-colour versions for print / monochrome contexts
    "mono-dark": Palette([SLATE_400, SLATE_600, SLATE_900], bars=WHITE, fold=SLATE_300),
    "mono-light": Palette([SLATE_600, SLATE_400, WHITE], bars=SLATE_900, fold=SLATE_300),
}


# --- Mark geometry ---------------------------------------------------------------------------
@dataclass
class Mark:
    id: str
    name: str
    idea: str
    layers: int = 3
    skew: float = -15.0  # degrees; negative = top edge rises to the right
    card_w: float = 200
    card_h: float = 300
    radius: float = 30
    step_x: float = 62  # offset of each card relative to the one behind it
    step_y: float = 34
    bars: list[float] = field(default_factory=lambda: [1.0, 1.0, 0.72])
    bar_thickness: float = 0.105  # of card width
    bar_top: float = 0.34  # of card height
    bar_gap: float = 0.145  # of card height (centre to centre)
    bar_left: float = 0.2  # of card width
    bar_span: float = 0.6  # full bar length, of card width
    fold: float = 0.0  # folded corner size, of card width (front card only)
    soft: bool = False  # gradients + soft shadows


# The chosen mark (owner, 2026-10-02): "C · Folded Stack".
MARK = Mark(
    id="leandocs",
    name="LeanDocs mark",
    idea="Stack of three slanted document cards; the front card has a folded corner and lean, "
    "shortening text bars.",
    bars=[1.0, 0.78, 0.52],
    fold=0.3,
    soft=True,
)


def _card_origins(m: Mark) -> list[tuple[float, float]]:
    return [(i * m.step_x, i * m.step_y) for i in range(m.layers)]


def mark_bbox(m: Mark) -> tuple[float, float, float, float]:
    tan = math.tan(math.radians(m.skew))
    xs, ys = [], []
    for ox, oy in _card_origins(m):
        for cx, cy in ((ox, oy), (ox + m.card_w, oy), (ox, oy + m.card_h), (ox + m.card_w, oy + m.card_h)):
            xs.append(cx)
            ys.append(cy + cx * tan)
    return min(xs), min(ys), max(xs), max(ys)


def _card_path(x: float, y: float, w: float, h: float, r: float, fold: float) -> str:
    """Rounded rectangle; with `fold` > 0 the top-right corner is cut diagonally."""
    if fold <= 0:
        return (
            f"M{x + r} {y}H{x + w - r}A{r} {r} 0 0 1 {x + w} {y + r}V{y + h - r}"
            f"A{r} {r} 0 0 1 {x + w - r} {y + h}H{x + r}A{r} {r} 0 0 1 {x} {y + h - r}"
            f"V{y + r}A{r} {r} 0 0 1 {x + r} {y}Z"
        )
    return (
        f"M{x + r} {y}H{x + w - fold}L{x + w} {y + fold}V{y + h - r}"
        f"A{r} {r} 0 0 1 {x + w - r} {y + h}H{x + r}A{r} {r} 0 0 1 {x} {y + h - r}"
        f"V{y + r}A{r} {r} 0 0 1 {x + r} {y}Z"
    )


def _mix(hex_a: str, hex_b: str, amount: float) -> str:
    a = [int(hex_a[i : i + 2], 16) for i in (1, 3, 5)]
    b = [int(hex_b[i : i + 2], 16) for i in (1, 3, 5)]
    return "#" + "".join(f"{round(x + (y - x) * amount):02x}" for x, y in zip(a, b))


def mark_svg(m: Mark, palette: Palette, uid: str, box: float, x0: float = 0, y0: float = 0) -> str:
    """The mark scaled to fit a `box` x `box` square at (x0, y0)."""
    minx, miny, maxx, maxy = mark_bbox(m)
    w, h = maxx - minx, maxy - miny
    scale = box / max(w, h)
    offset_x = x0 + (box - w * scale) / 2 - minx * scale
    offset_y = y0 + (box - h * scale) / 2 - miny * scale
    defs, body = [], []
    colours = palette.layers[-m.layers :]
    fold_px = m.fold * m.card_w

    for index, (ox, oy) in enumerate(_card_origins(m)):
        front = index == m.layers - 1
        colour = colours[index]
        fill = colour
        if m.soft:
            gid = f"{uid}-g{index}"
            defs.append(
                f'<linearGradient id="{gid}" x1="0" y1="0" x2="1" y2="1">'
                f'<stop offset="0" stop-color="{_mix(colour, WHITE, 0.16)}"/>'
                f'<stop offset="1" stop-color="{_mix(colour, "#000000", 0.08)}"/></linearGradient>'
            )
            fill = f"url(#{gid})"
        path = _card_path(ox, oy, m.card_w, m.card_h, m.radius, fold_px if front else 0)
        shadow = f' filter="url(#{uid}-shadow)"' if m.soft and index > 0 else ""
        body.append(f'<path class="ld-card-{index + 3 - m.layers}" d="{path}" fill="{fill}"{shadow}/>')
        if m.soft:
            body.append(
                f'<path d="{path}" fill="none" stroke="{palette.highlight}" stroke-width="3" stroke-linejoin="round"/>'
            )
        if front:
            if fold_px > 0:
                fx = ox + m.card_w - fold_px
                body.append(
                    f'<path class="ld-fold" d="M{fx} {oy}V{oy + fold_px - 12}a12 12 0 0 0 12 12H{ox + m.card_w}Z" fill="{palette.fold}"/>'
                )
            t = m.bar_thickness * m.card_w
            for bar_index, fraction in enumerate(m.bars):
                bx = ox + m.bar_left * m.card_w
                by = oy + (m.bar_top + bar_index * m.bar_gap) * m.card_h
                length = m.bar_span * m.card_w * fraction
                body.append(
                    f'<rect class="ld-bar" x="{bx:.1f}" y="{by - t / 2:.1f}" width="{length:.1f}" height="{t:.1f}" '
                    f'rx="{t / 2:.1f}" fill="{palette.bars}"/>'
                )
    if m.soft:
        defs.append(
            f'<filter id="{uid}-shadow" x="-30%" y="-30%" width="160%" height="160%">'
            f'<feDropShadow dx="-10" dy="10" stdDeviation="12" flood-color="#020617" flood-opacity="0.28"/></filter>'
        )
    skew = f" skewY({m.skew})" if m.skew else ""
    return (
        f"<defs>{''.join(defs)}</defs>"
        f'<g transform="translate({offset_x:.2f} {offset_y:.2f}) scale({scale:.4f}){skew}">{"".join(body)}</g>'
    )


def favicon_mark(m: Mark) -> Mark:
    """Small sizes (≤ 32 px): two cards and two bars so the shape survives the pixel grid."""
    return Mark(
        id=m.id,
        name=m.name,
        idea=m.idea,
        layers=2,
        skew=m.skew,
        card_w=m.card_w,
        card_h=m.card_h,
        radius=m.radius * 1.2,
        step_x=m.step_x * 1.25,
        step_y=m.step_y,
        bars=[1.0, 0.7],
        bar_thickness=0.16,
        bar_top=0.4,
        bar_gap=0.22,
        fold=m.fold,
        soft=False,
    )


# --- Fonts & wordmark ---------------------------------------------------------------------------
# key: (family, file, heavy weight, tagline weight, tracking em)
FONTS = {
    "inter": ("Inter", "inter-latin-wght-normal.woff2", 800, 500, -0.03),
}
DEFAULT_FONT = "inter"


def font_face(key: str) -> str:
    family, file_name, *_ = FONTS[key]
    data = base64.b64encode((FONTS_DIR / file_name).read_bytes()).decode()
    return (
        f"@font-face{{font-family:'LD {family}';font-weight:100 900;"
        f"src:url(data:font/woff2;base64,{data}) format('woff2');}}"
    )


@dataclass
class Theme:
    background: str | None
    ink: str  # "Lean"
    accent: str  # "Docs"
    tagline: str
    palette: Palette
    dark: bool


LIGHT = Theme(SLATE_50, SLATE_900, ACCENT, SLATE_600, PALETTES["blue"], False)
DARK = Theme(SLATE_900, WHITE, BLUE_400, SLATE_300, PALETTES["blue-on-dark"], True)


def lockup(
    m: Mark, theme: Theme, font_key: str, uid: str, x: float, y: float, mark_size: float, tagline: bool = True
) -> str:
    """Horizontal lockup: mark + 'LeanDocs' (+ tagline)."""
    family, _, heavy, regular, tracking = FONTS[font_key]
    size = mark_size * 0.56
    text_x = x + mark_size * 1.08
    baseline = y + mark_size * (0.57 if tagline else 0.7)
    if not tagline:
        return (
            f'<g class="lockup">{mark_svg(m, theme.palette, uid, mark_size, x, y)}'
            f"<text x=\"{text_x:.1f}\" y=\"{baseline:.1f}\" font-family=\"'LD {family}'\" font-size=\"{size:.1f}\" "
            f'font-weight="{heavy}" letter-spacing="{tracking * size:.2f}" fill="{theme.ink}">{NAME_A}'
            f'<tspan fill="{theme.accent}">{NAME_B}</tspan></text></g>'
        )
    return (
        f'<g class="lockup">{mark_svg(m, theme.palette, uid, mark_size, x, y)}'
        f"<text x=\"{text_x:.1f}\" y=\"{baseline:.1f}\" font-family=\"'LD {family}'\" font-size=\"{size:.1f}\" "
        f'font-weight="{heavy}" letter-spacing="{tracking * size:.2f}" fill="{theme.ink}">{NAME_A}'
        f'<tspan fill="{theme.accent}">{NAME_B}</tspan></text>'
        f"<text x=\"{text_x + size * 0.03:.1f}\" y=\"{baseline + size * 0.62:.1f}\" "
        f"font-family=\"'LD {family}'\" font-size=\"{size * 0.315:.1f}\" font-weight=\"{regular}\" "
        f'fill="{theme.tagline}">{TAGLINE}</text></g>'
    )


def svg_doc(width: float, height: float, body: str, fonts: str = "", title: str = "", fit: bool = False) -> str:
    style = f"<style>{fonts}</style>" if fonts else ""
    head = f"<title>{title}</title>" if title else ""
    attr = ' data-fit="true"' if fit else ""
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width:g}" height="{height:g}" '
        f'viewBox="0 0 {width:g} {height:g}"{attr}>{head}{style}{body}</svg>\n'
    )


# --- Banners -------------------------------------------------------------------------------------
def background_cards(width: float, height: float, theme: Theme, skew: float) -> str:
    """Large, very quiet slanted cards echoing the mark (the references use big soft shapes)."""
    fill = SLATE_800 if theme.dark else SLATE_200
    stroke = BLUE_400 if theme.dark else ACCENT
    fill_opacity = 0.5 if theme.dark else 0.45
    stroke_opacity = 0.25 if theme.dark else 0.12
    tan = math.tan(math.radians(skew))
    cards = [
        (width * 0.80, height * 0.12, width * 0.26, height * 1.05),
        (width * 0.93, height * 0.34, width * 0.26, height * 1.05),
    ]
    out = []
    for x, y, w, h in cards:
        out.append(
            f'<g transform="skewY({skew})"><rect x="{x:.0f}" y="{y - x * tan:.0f}" width="{w:.0f}" '
            f'height="{h:.0f}" rx="{w * 0.12:.0f}" fill="{fill}" fill-opacity="{fill_opacity}" '
            f'stroke="{stroke}" stroke-opacity="{stroke_opacity}" stroke-width="2"/></g>'
        )
    return "".join(out)


def banner(m: Mark, theme: Theme, width: float, height: float, font_key: str, uid: str, mark_size: float, shapes: bool) -> str:
    body = [f'<rect width="{width}" height="{height}" fill="{theme.background}"/>']
    if shapes:
        body.append(background_cards(width, height, theme, m.skew or -15))
    x = width * 0.08
    y = (height - mark_size) / 2
    body.append(lockup(m, theme, font_key, uid, x, y, mark_size))
    return svg_doc(width, height, "".join(body), font_face(font_key), f"LeanDocs - {TAGLINE}")


def app_icon(m: Mark, tile: str, palette: Palette, uid: str, border: str | None = None, radius: float = 112) -> str:
    size = 512
    stroke = f' stroke="{border}" stroke-width="2"' if border else ""
    inset = 1 if border else 0
    body = (
        f'<rect x="{inset}" y="{inset}" width="{size - 2 * inset}" height="{size - 2 * inset}" '
        f'rx="{radius}" fill="{tile}"{stroke}/>'
    )
    body += mark_svg(m, palette, uid, size * 0.64, size * 0.18, size * 0.18)
    return svg_doc(size, size, body, title="LeanDocs")


# --- Output --------------------------------------------------------------------------------------
def main() -> None:
    m = MARK
    small = favicon_mark(m)
    fonts = font_face(DEFAULT_FONT)
    for directory in ("logo", "icons", "banners"):
        (OUT / directory).mkdir(parents=True, exist_ok=True)

    logo = OUT / "logo"
    for key, name in (("blue", "mark"), ("blue-on-dark", "mark-on-dark"), ("mono-dark", "mark-mono-dark"),
                      ("mono-light", "mark-mono-light")):
        (logo / f"{name}.svg").write_text(svg_doc(512, 512, mark_svg(m, PALETTES[key], name, 512), title="LeanDocs"))
    # Small-size mark (≤ 48 px): two cards, two bars. Source for the favicon and the UI logo.
    (logo / "mark-small.svg").write_text(
        svg_doc(64, 64, mark_svg(small, PALETTES["blue"], "small", 64), title="LeanDocs")
    )
    for theme_name, theme in (("light", LIGHT), ("dark", DARK)):
        (logo / f"lockup-{theme_name}.svg").write_text(
            svg_doc(1600, 330, lockup(m, theme, DEFAULT_FONT, f"lockup-{theme_name}", 25, 25, 280),
                    fonts, "LeanDocs - Documentation without the bloat.", fit=True)
        )
        (logo / f"lockup-compact-{theme_name}.svg").write_text(
            svg_doc(1600, 330, lockup(m, theme, DEFAULT_FONT, f"compact-{theme_name}", 25, 25, 280, tagline=False),
                    fonts, "LeanDocs", fit=True)
        )
        (OUT / "banners" / f"social-{theme_name}.svg").write_text(
            banner(m, theme, 1280, 640, DEFAULT_FONT, f"social-{theme_name}", 210, shapes=True)
        )
        (OUT / "banners" / f"readme-{theme_name}.svg").write_text(
            banner(m, theme, 1600, 400, DEFAULT_FONT, f"readme-{theme_name}", 220, shapes=False)
        )

    icons = OUT / "icons"
    # Two blue cards: legible on light and dark browser tabs alike.
    favicon = svg_doc(64, 64, mark_svg(small, PALETTES["blue"], "favicon", 64), title="LeanDocs")
    (icons / "favicon.svg").write_text(favicon)
    (icons / "app-icon-dark.svg").write_text(app_icon(m, SLATE_900, PALETTES["blue-on-dark"], "app-dark"))
    (icons / "app-icon-light.svg").write_text(app_icon(m, WHITE, PALETTES["blue"], "app-light", SLATE_200))
    # Full-bleed square for iOS/Android launchers (they apply their own corner mask).
    (icons / "app-icon-maskable.svg").write_text(app_icon(m, SLATE_900, PALETTES["blue-on-dark"], "app-mask", radius=0))

    write_sheet()
    print("Generated brand assets into branding/")


def write_sheet() -> None:
    """branding/preview.html: one-page brand sheet of the final assets."""
    fonts_css = font_face(DEFAULT_FONT)
    html = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><title>LeanDocs brand sheet</title>
<meta name="viewport" content="width=device-width, initial-scale=1"><style>{fonts_css}
body{{margin:0;background:{SLATE_100};color:{SLATE_900};font:14px/1.5 'LD Inter',system-ui,sans-serif}}
main{{max-width:1360px;margin:0 auto;padding:40px 32px 80px}}
h1{{font:800 34px 'LD Inter';letter-spacing:-1px;margin:0}} h1 span{{color:{ACCENT}}} .lead{{color:{SLATE_600};margin:4px 0 28px}}
.card{{background:{WHITE};border:1px solid {SLATE_200};border-radius:12px;padding:28px;margin-bottom:28px}}
.card h2{{margin:0 0 16px;font:700 18px 'LD Inter'}}
.row{{display:flex;gap:24px;align-items:flex-end;flex-wrap:wrap}}
figure{{margin:0;display:flex;flex-direction:column;gap:8px;align-items:flex-start}}
figcaption{{font:12px ui-monospace,monospace;color:{SLATE_500}}}
.dark{{background:{SLATE_900};border-radius:10px;padding:12px}} .dark figcaption{{color:{SLATE_400}}}
.grid2{{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:center}} .grid2 img{{width:100%;display:block}}
.banner img{{border-radius:8px;border:1px solid {SLATE_200}}}
.swatch{{width:120px;height:64px;border-radius:8px;border:1px solid {SLATE_200}}}
</style></head><body><main>
<h1>Lean<span>Docs</span> — brand sheet</h1>
<p class="lead">Mark: Folded Stack · Wordmark: Inter ExtraBold · Rules: BRAND_SPEC.md</p>
<section class="card"><h2>Mark</h2><div class="row">
<figure><img src="logo/mark.svg" width="180" alt=""><figcaption>logo/mark.svg</figcaption></figure>
<figure class="dark"><img src="logo/mark-on-dark.svg" width="180" alt=""><figcaption>logo/mark-on-dark.svg</figcaption></figure>
<figure><img src="logo/mark-mono-dark.svg" width="120" alt=""><figcaption>mono-dark</figcaption></figure>
<figure class="dark"><img src="logo/mark-mono-light.svg" width="120" alt=""><figcaption>mono-light</figcaption></figure>
<figure><div class="row"><img src="logo/mark-small.svg" width="48" alt=""><img src="logo/mark-small.svg" width="32" alt=""><img src="logo/mark-small.svg" width="16" alt=""></div><figcaption>mark-small 48/32/16</figcaption></figure>
</div></section>
<section class="card"><h2>App icons</h2><div class="row">
<figure><img src="icons/app-icon-dark.svg" width="140" alt=""><figcaption>app-icon-dark</figcaption></figure>
<figure><img src="icons/app-icon-light.svg" width="140" alt=""><figcaption>app-icon-light</figcaption></figure>
<figure><img src="icons/app-icon-maskable.svg" width="140" alt=""><figcaption>app-icon-maskable</figcaption></figure>
<figure><img src="icons/favicon.svg" width="64" alt=""><figcaption>favicon.svg</figcaption></figure>
</div></section>
<section class="card"><h2>Lockups</h2><div class="grid2">
<img src="logo/lockup-light.svg" alt=""><div class="dark"><img src="logo/lockup-dark.svg" alt=""></div>
<img src="logo/lockup-compact-light.svg" alt=""><div class="dark"><img src="logo/lockup-compact-dark.svg" alt=""></div>
</div></section>
<section class="card banner"><h2>Banners</h2><div class="grid2">
<img src="banners/social-dark.svg" alt=""><img src="banners/social-light.svg" alt="">
<img src="banners/readme-light.svg" alt=""><img src="banners/readme-dark.svg" alt="">
</div></section>
<section class="card"><h2>Colours</h2><div class="row">
{''.join(f'<figure><div class="swatch" style="background:{c}"></div><figcaption>{n}<br>{c}</figcaption></figure>' for n, c in (("Card back", SLATE_800), ("Card back on dark", "#1e3a8a"), ("Card middle", BLUE_700), ("Card front / accent+", BLUE_500), ("Accent (UI)", ACCENT), ("Accent dark (UI)", BLUE_400), ("Fold", BLUE_200), ("Ink", SLATE_900)))}
</div></section>
</main></body></html>
"""
    (OUT / "preview.html").write_text(html)


if __name__ == "__main__":
    main()
