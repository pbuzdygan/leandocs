# LeanDocs — UI Specification

> **LeanDocs** — _Documentation without the bloat._

|                                |                                                                                                                                  |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| **Status**                     | Approved UI direction                                                                                                            |
| **Document version**           | 1.8                                                                                                                              |
| **Chosen direction**           | A — Technical Minimal                                                                                                            |
| **Related documents**          | [`PROJECT_SPEC.md`](PROJECT_SPEC.md), [`AGENTS.md`](AGENTS.md), [`docs/implementation-status.md`](docs/implementation-status.md) |
| **Target application release** | 1.0                                                                                                                              |

### Revision history

| Version | Date       | Change                                                                                                                                                                                                                                              |
| ------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.0     | 2026-10-01 | Approved UI direction (Polish draft, archived in `docs/archive/pl/`).                                                                                                                                                                               |
| 1.8     | 2026-10-04 | Owner-authorized optional local MFA: Settings › Security enrollment/confirmation/recovery/disablement (§81) and two-stage login (§89).                                                                                                              |
| 1.7     | 2026-10-02 | Phase 10: Info tab details (§46, read-only while editing), tags editor chips and tag filter from header tags (§116), Pinned section above the tree (§93).                                                                                           |
| 1.6     | 2026-10-02 | Icons: final decision for Tabler Icons (§13); the Lucide and Hugeicons trials are removed.                                                                                                                                                          |
| 1.5     | 2026-10-02 | Icons: Hugeicons free stroke-rounded set replaces Lucide (§13), through one icon module.                                                                                                                                                            |
| 1.4     | 2026-10-02 | Phase 9: Links tab content (§47), `[[` document picker in both editors (§38), broken links overview under Settings › Broken links (§137).                                                                                                           |
| 1.3     | 2026-10-02 | From owner testing: full-width document by default with a reading-width toggle (§25); TOC includes H1 with outline nesting (§45); slash menu at the caret and block tools for tables, code languages and callouts (§38); sticky editing bar (§150). |
| 1.2     | 2026-10-02 | Branding applied: §15 topbar shows the logo and the wordmark; §143–144 refer to BRAND_SPEC.md. Icons: Lucide only.                                                                                                                                  |
| 1.1     | 2026-10-02 | Translated to English. `<PROJECT_NAME>` replaced by **LeanDocs** via the central `APP_NAME` constant. Logo/icon remain placeholders until `BRAND_SPEC.md`.                                                                                          |

---

## 1. Purpose

This document defines the look, behaviour and structure of the LeanDocs user interface.

- `PROJECT_SPEC.md` defines **what the application does**.
- `UI_SPEC.md` defines **how the user uses it and how it looks**.

An AI assistant implementing the frontend must treat this document as authoritative for: layout, spacing, components, UI colours, typography, panel behaviour, editors, forms, menus, dialogs, responsive design, loading states, empty states and error states.

Do not restyle the application on your own into a dashboard, glassmorphism, neumorphism, Material Design or a Notion-like look.

---

## 2. Core UI principle

> The interface is invisible while the user reads documentation and maximally useful when they need it.

Content is the most important element on screen. The UI must never compete with the document.

## 3. Visual character — Technical Minimal

Technical, precise, calm, professional, light, neutral, orderly, functional.

It should evoke: modern technical documentation, GitBook, GitHub, VS Code Explorer, developer panels, API documentation.

It must not look like: Notion, Trello, Monday, ClickUp, a business dashboard, an analytics panel, a finance app, or a mobile app stretched to desktop.

## 4. Fundamental style traits

**Use:** light surfaces; very subtle contrast; thin borders; a limited palette; one primary interaction colour; small corner radii; few shadows; fairly high information density; high readability; generous space around the document itself.

**Avoid:** large gradients; strong shadows; over-rounded cards; huge buttons; colourful dashboard cards; huge icons; decorative illustrations; animation without a function.

---

## 5. Design tokens

All styling uses CSS custom properties (`apps/web/src/styles/tokens.css`).

```css
:root {
  --bg-app: #f8fafc;
  --bg-surface: #ffffff;
  --bg-subtle: #f1f5f9;
  --bg-hover: #f8fafc;
  --bg-selected: #eff6ff;

  --border-default: #e2e8f0;
  --border-strong: #cbd5e1;

  --text-primary: #0f172a;
  --text-secondary: #475569;
  --text-muted: #64748b;
  --text-disabled: #94a3b8;

  --accent: #2563eb;
  --accent-hover: #1d4ed8;
  --accent-soft: #dbeafe;

  --success: #16a34a;
  --warning: #d97706;
  --danger: #dc2626;
  --info: #0284c7;

  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;

  --shadow-popover: 0 8px 24px rgba(15, 23, 42, 0.1);
}
```

These are **UI colours**, not final branding. Once `BRAND_SPEC.md` exists the accent may change without rebuilding components.

## 6. Accent colour

Until branding is done use `#2563EB` (a restrained technical blue). Use it **only** for: active state, links, focus, primary action, selected item, progress, active tab. Never as a large section background.

## 7. Typography

Preferred UI font: **Inter**.

```css
font-family:
  Inter,
  ui-sans-serif,
  system-ui,
  -apple-system,
  BlinkMacSystemFont,
  'Segoe UI',
  sans-serif;
```

Fonts are self-hosted/bundled (no runtime CDN — see PROJECT_SPEC §53).

## 8. Monospace font

For code, the source editor, paths, hashes, command lines and technical IDs. Preferred: **JetBrains Mono**.

```css
font-family:
  'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
  monospace;
```

## 9. Font sizes

| Use                    | Size / weight |
| ---------------------- | ------------- |
| UI base                | 14 px         |
| Metadata               | 12 px         |
| Sidebar / secondary UI | 13 px         |
| Standard UI            | 14 px         |
| Selected UI emphasis   | 15 px         |
| Document body          | 16 px         |
| H1                     | 32 px / 700   |
| H2                     | 24 px / 650   |
| H3                     | 20 px / 650   |
| H4                     | 17 px / 650   |

Line height: document body **1.7**, UI **1.4**.

## 10. Spacing system

4 px grid. Common values: 4, 8, 12, 16, 20, 24, 32, 40, 48. Never use arbitrary values such as 13, 19 or 27 px.

## 11. Border radius

Standard 4–6 px; dialogs/popovers 8 px. Never 16–24 px for regular cards or panels.

## 12. Shadows

Most components have **no shadow**; separation comes from border, background and spacing. Shadows only for: dropdown, command palette, dialog, tooltip, floating menu.

## 13. Icons

**Tabler Icons** (final owner decision, 1.6): outline style, default stroke width 2; minimal, technical, consistent, legible. Tabler is the **only** icon set in the app. Icons are bundled from npm (`@tabler/icons-react`, MIT; no CDN) and used only through the named components in `apps/web/src/components/icons.tsx`; add a new icon there first. Standard 16 px; sidebar 15–16 px; toolbar 16–18 px. Large icons only in empty states.

---

## 14. Main desktop layout

```text
┌───────────────────────────────────────────────────────────────┐
│ Topbar                                                        │
├────────────────┬─────────────────────────────┬────────────────┤
│ Navigation     │ Document                    │ Context        │
│ Sidebar        │                             │ Sidebar        │
└────────────────┴─────────────────────────────┴────────────────┘
```

## 15. Topbar

Height **52 px**, always visible.

- **Left:** logo/icon placeholder (`APP_LOGO`), product name (`APP_NAME` = LeanDocs), optional breadcrumb.
- **Centre:** global search.
- **Right:** New Document, optional utility actions, Settings, user menu.

## 16. Global search field

Desktop width 320–440 px.

```text
[ 🔍 Search documentation...          Ctrl K ]
```

Subtle; background `#f1f5f9` (`--bg-subtle`); border strengthens on focus. Clicking opens the command-palette search.

## 17. Navigation sidebar

Default width **280 px**, min 220 px, max 400 px. Resizable; the width is remembered locally.

## 18. Sidebar structure

```text
DOCUMENTATION

▾ Infrastructure
    ▾ Servers
        BUZHULK
        BUZPI00
    ▸ Storage
▾ Network
    UniFi
    VLAN
    DNS
▾ Applications
    Home Assistant
    Vaultwarden
    Nginx Proxy Manager
▸ Procedures
▸ Troubleshooting
```

## 19. Sidebar header

```text
Documentation                +
```

`+` opens a menu: _New document_, _New folder_.

## 20. Tree row

Height **30 px**. Contains: chevron, icon, label, optional actions.

```text
▾ 📁 Infrastructure
    📄 BUZHULK
```

## 21. Tree indentation

16 px per level. No classic Windows-Explorer guide lines; hierarchy comes from indentation, chevrons and icons.

## 22. Tree states

| State    | Style                                                                                 |
| -------- | ------------------------------------------------------------------------------------- |
| Normal   | transparent                                                                           |
| Hover    | `#f1f5f9`                                                                             |
| Selected | background `#eff6ff`, text `#1d4ed8`, optional `border-left: 2px solid var(--accent)` |

## 23. Sidebar context menu

Right-click or `…`:

```text
Open
Open in new tab
─────
Rename
Move
Duplicate
─────
New document here
New folder here
─────
Copy path
─────
Delete            (danger colour)
```

Always a separator before destructive actions.

---

## 24. Document workspace

The centre is the main element of the app. App background `#f8fafc`; the document itself `#ffffff`.

## 25. Document maximum width

**Full width by default** (owner decision, 1.3): the document uses the workspace between the side panels. A header toggle switches to **reading width** (`max-width: 900px`; 760–860 px preferred for typical text), remembered per browser. Code and tables may always use more width.

## 26. Document spacing

Top 32–40 px; left/right 40–64 px; on small desktops 24–32 px.

## 27. Document header

```text
Infrastructure / Servers / BUZHULK          (breadcrumb)

BUZHULK                                   View   Source   Edit   …
Main Docker and Incus host
server  docker  incus
Updated 4 minutes ago
```

## 28. Document title

32 px, weight 700. Not inside a card; no decorative background.

## 29. Document description

Optional, from front matter `description`. 16 px, `--text-secondary`.

## 30. Document metadata

Subtle, 12–13 px:

```text
Updated 2 Oct 2026 · 4 min read
```

## 31. Document actions

`View`, `Source`, `Edit` — not three big buttons. Segmented/tab style; active state = accent text + bottom border.

```text
View   Source   Edit
────
```

(_Source_ in View mode is a read-only view of the raw Markdown.)

## 32. Edit mode

In Edit mode the header actions become:

```text
Visual   Source        Saved        [Done]
```

plus optionally _Cancel_.

## 33. Save status

Always very subtle: `Saved`, `Saving…`, `Unsaved`, `Conflict`, `Save failed`.

| State          | Colour  |
| -------------- | ------- |
| Saved / Saving | muted   |
| Conflict       | warning |
| Error          | danger  |

No toast on every autosave. Status is also conveyed with text/icon, never colour alone.

## 34. Visual editor

The visual editor must look practically identical to View mode — this is key. `View → Edit` must not rebuild the screen; the document simply becomes editable.

## 35. Visual editor toolbar

Appears above the document:

```text
¶  H1  H2  H3 | B I S | • 1. ☑ | <> | 🔗 🖼 | Table | …
```

Height 40 px; sticky; white; bottom border.

## 36. Toolbar groups

Separated by dividers:

- **Text:** Paragraph, H1, H2, H3
- **Formatting:** Bold, Italic, Strikethrough, Inline code
- **Structure:** Bullet list, Ordered list, Checklist, Quote
- **Insert:** Link, Image, Attachment, Table, Code block, Callout

## 37. Bubble toolbar

On text selection a small floating toolbar may appear: `B  I  S  <>  Link`. Do not overload it.

## 38. Slash commands

`/` opens: Heading 1, Heading 2, Heading 3 · Bullet list, Numbered list, Checklist · Code block, Table, Callout, Image, Attachment, Divider. The menu opens **at the caret** (below it, or above it when there is no room), never at a fixed place in the editor; the bubble toolbar sits just above the selection.

**Document links (1.4).** Typing `[[` opens a document picker at the caret (title, path, aliases; ↑ ↓, Enter or Tab, Esc). Visual shows the link as an inline link chip; Source shows CodeMirror suggestions.

**Block tools (1.3).** When the caret is in a block, a second toolbar row shows its tools: table — Row above, Row below, Column left, Column right, Delete row, Delete column, Delete table (header row cannot be deleted); code block — language (Plain text, Bash/Shell, PowerShell, YAML, JSON, INI/TOML, HTML/XML, CSS, JavaScript, TypeScript, Python, Go, SQL, Dockerfile, Nginx, Diff, Markdown, Mermaid), highlighted like View; callout — type (Note, Info, Tip, Warning, Danger). New tables are 3 × 3 (header + 2 rows). Leave a code block with Enter on an empty last line (Enter twice), ArrowDown at its end, or Mod-Enter.

## 39. Source editor

CodeMirror. Uses the full width of the document workspace while keeping the side panels.

## 40. Source editor look

Background `#ffffff`; gutter `#f8fafc`; line numbers `#94a3b8`; font 13–14 px monospace; line height 1.6.

## 41. Source editor syntax colours

Subtle — not an IDE with ten strong colours. Highlight mainly: headings, links, code, front matter, quotes, bold, Markdown syntax marks.

## 42. Visual ↔ Source toggle

`Visual | Source` is always available in Edit mode. Preserve cursor position on switch if it can be done without complications.

---

## 43. Context sidebar

Right panel; default width **260 px**; can be shown/hidden.

## 44. Context sidebar tabs

`Contents` · `Info` · `Links`. Show one at a time.

## 45. Contents

Automatic TOC (Overview, Hardware, Network, …) from H1–H4 (1.3: H1 included; the H1 that repeats the document title is not listed). Indentation follows the outline: a heading nests under the closest previous heading of a higher level. The active section is highlighted while scrolling.

## 46. Info

```text
Properties
Path      Infrastructure/Servers/BUZHULK.md
Created   27 Sep 2026
Updated   2 Oct 2026
Tags      server  docker  incus
```

## 47. Links

_Referenced by_ (backlinks, with a count when a document links more than once) and _Links to_ (outgoing links; broken ones in the broken-link style with "Not found"). The context sidebar remembers the chosen tab.

## 48. Collapsing the context sidebar

Button `›`. When closed, the centre expands. State is remembered.

## 49. Breadcrumb

Above the title, subtle, 12–13 px, clickable segments (`Infrastructure / Servers / BUZHULK`). Must not dominate.

## 50. Tags

Background `#f1f5f9`, border `#e2e8f0`, 12 px, radius 4 px. Never a big colourful pill.

## 51. Links (in documents)

Accent colour. Underline optional by default, shown on hover. Visited links do not turn purple.

## 52. Code block

```text
yaml                                   Copy
services:
  homeassistant:
    image: ...
```

Background `#0f172a`; text `#e2e8f0`; radius 6 px. Header bar: language label left, Copy right.

## 53. Inline code

Background `#f1f5f9`; border `#e2e8f0`; monospace; padding `1px 4px`; radius 4 px.

## 54. Tables

Light: header background `#f8fafc`, weight 600; borders `#e2e8f0`; cell padding `8px 12px`; no zebra stripes by default.

## 55. Callouts

`border-left: 3px solid <colour>` and a very light/neutral background — never a strongly coloured full background.

| Type    | Colour                           |
| ------- | -------------------------------- |
| Note    | `#64748b` (background `#f8fafc`) |
| Info    | `#0284c7`                        |
| Tip     | `#16a34a`                        |
| Warning | `#d97706`                        |
| Danger  | `#dc2626`                        |

## 56. Mermaid

Neutral container: border, white background, 16–24 px padding. Optional actions: _Open source_, _Fullscreen_.

## 57. Images

`max-width: 100%`, aspect ratio preserved, small radius, subtle border if needed. Click may open a preview/lightbox.

## 58. Attachments

```text
📎 compose.yaml
   4.2 KB                       Open   Download
```

---

## 59. Global search / command palette

Opened with `Ctrl/Cmd + K`.

```text
┌────────────────────────────────────────────┐
│ 🔍 Search documentation...                 │
├────────────────────────────────────────────┤
│ BUZHULK                                    │
│ Infrastructure / Servers                   │
│ …macvlan interface configuration…          │
│                                            │
│ Home Assistant                             │
│ Applications                               │
│ …connection through macvlan…               │
└────────────────────────────────────────────┘
```

## 60. Command palette dimensions

Width 640–720 px; max-height 70vh; positioned at ~15vh from the top (not dead centre).

## 61. Search result

Each result: title, path, snippet (with optional match highlight). Keyboard: `↑ ↓`, `Enter`, `Esc`.

## 62. Search filters

Recognised filters (e.g. `tag:docker`) may be shown as a subtle token.

## 63. Quick open

`Ctrl/Cmd + P`. Same UI as search, but results show only document + path, no full-text snippets.

---

## 64. New document dialog

```text
New document

Name
[ Home Assistant                    ]
Location
[ Applications                    ▾ ]
Template
[ Blank                           ▾ ]

                        Cancel   Create
```

Width 480–560 px.

## 65. Template selection

A plain list: Blank, Server, Application, Procedure, Network Device, Incident. No big illustrated tiles.

## 66. Move dialog

A simple folder picker:

```text
Move "BUZHULK"

Documentation
▾ Infrastructure
    ▾ Servers
    ▸ Storage
▸ Network
▸ Applications

                Cancel   Move
```

## 67. Delete confirmation

```text
Move document to trash?
BUZHULK will be moved to Trash and can be restored.

                Cancel   Move to Trash
```

Primary destructive action uses the danger style.

## 68. Permanent delete

```text
Delete permanently?
This action cannot be undone.
```

Requiring the user to type the name is reserved for genuinely critical operations — not every delete.

## 69. Conflict dialog

```text
Document changed outside the editor

This document was modified after you opened it.

Modified on disk:  2 Oct 2026 01:54
Your editor:       unsaved changes

[ Review changes ]

Reload from disk
Save as copy
Cancel
```

Never offer a plain _Overwrite_ as the default action.

## 70. External change notification

If the document is not being edited: show `Document updated externally.` and refresh the content (automatically or after safe sync). If it is being edited: show the conflict state.

## 71. Toasts

Use for: Document moved, Link copied, Index rebuilt, Attachment uploaded. **Not** for _Document saved_ when autosave works.

## 72. Toast position

Desktop bottom-right; phone bottom-centre. Auto-dismiss 4–5 s; errors may stay longer.

---

## 73. Empty application state

```text
No documentation yet
Create your first document or import an existing Markdown directory.

[ New document ]
Import Markdown
```

A minimal document icon; no large illustrations.

## 74. Empty folder

```text
This folder is empty.
Create document · Create folder
```

## 75. No search results

```text
No results for "macvlann"
Try another phrase or check your filters.
```

May suggest `Search for "macvlan"` if a simple fuzzy-match mechanism exists.

## 76. Broken link

`[[Old Server]]` renders as `Old Server` in muted text with a dashed underline; hover shows `Document not found`.

## 77. Loading

Prefer skeletons (tree, title, lines) over a full-screen spinner. Small spinner for minor operations.

## 78. Initial app loading

```text
<placeholder icon>
Loading documentation…
```

Minimal screen, no splash animation.

## 79. Error page

```text
Unable to load document
The file could not be read.

Retry
▸ Details
```

Details are collapsible. Never show raw stack traces to regular users.

## 80. 404 document

```text
Document not found
It may have been moved, renamed or deleted.

Back to documentation
```

---

## 81. Settings

Left mini-sidebar + main panel. Sections: General, Editor, Appearance, Security (local Authentication), Storage, Index, About.

Security offers optional local two-factor authentication: current-password reauthentication,
locally generated authenticator QR code and manual key, six-digit confirmation, then ten recovery
codes shown once with an explicit acknowledgment. Cancel enrollment clears the pending secret.
When enabled, show the remaining recovery-code count and require the current password plus an
unused authenticator or recovery code to disable it. Clear entered credentials after each attempt.
Enabling/disabling rotates the current session and signs out others. Proxy/none modes show mode
instructions instead of local controls. Temporary secrets and recovery codes never enter caches or
browser storage.

## 82. General settings

Open last document on startup · Default location for new documents · Autosave.

## 83. Editor settings

Default editor (Visual / Source) · Autosave delay · Show line numbers · Word wrap · Tab size.

## 84. Appearance

Theme: System / Light / Dark. Light is the reference direction. Dark mode stays Technical Minimal (it must not drift towards the rejected mockup B style).

## 85. Dark mode

Indicative tokens:

```css
[data-theme='dark'] {
  --bg-app: #0f172a;
  --bg-surface: #111827;
  --bg-subtle: #1e293b;
  --bg-hover: #1e293b;
  --bg-selected: #172554;

  --border-default: #334155;
  --border-strong: #475569;

  --text-primary: #f1f5f9;
  --text-secondary: #cbd5e1;
  --text-muted: #94a3b8;

  --accent: #60a5fa;
}
```

Dark mode is as neutral as light mode.

## 86. Storage settings

Show: data directory (`/data`), content directory (`/data/content`), document count, attachments size, database size. Action: _Rebuild Index_.

## 87. Rebuild index

```text
Rebuild search index?
Documentation files will not be modified.

                Cancel   Rebuild
```

During the operation: `Indexing documents… 182 / 482`.

## 88. About

```text
LeanDocs
Documentation without the bloat.
Version 1.0.0

Server version
Frontend version

Documentation · GitHub · License
```

## 89. Login

Very simple, centred, max-width 360 px, no marketing illustrations.

For MFA-enabled local accounts, password success replaces the credential fields with an
Authenticator code field, a Use recovery code toggle, Verify and sign in, and Start again.
Access remains unauthenticated until factor verification succeeds. Clear codes/passwords after
submission; expired challenges return to password entry. Enrollment/challenges expire after five
minutes, and failed submissions show the server error without automatic retries.

```text
<APP_LOGO>
LeanDocs

Sign in
Username
Password
[ Sign in ]
```

## 90. First run

1. `Welcome — Create your administrator account.` (Username, Password, Confirm password, _Create account_)
2. `Documentation storage — /data/content`
3. `Ready`

## 91. Home

Very simple; not a dashboard.

```text
Documentation

Quick actions:  New document · Search · Import
Recent documents
Pinned
```

## 92. Recent documents

A list, not cards:

```text
BUZHULK
Infrastructure / Servers · Updated 12 min ago

Home Assistant
Applications · Updated yesterday
```

## 93. Pinned

Also a list; no big tiles. Pinned documents also appear in a _Pinned_ section above the navigation tree; Pin/Unpin is in the document menus.

## 94. Navigation history

Topbar may have `← →` (like a browser / VS Code) to move between recently opened documents.

## 95. Keyboard navigation

| Context | Keys                                                                                             |
| ------- | ------------------------------------------------------------------------------------------------ |
| Tree    | `↑ ↓` move · `→` expand/open · `←` collapse/parent · `Enter` open · `F2` rename · `Delete` trash |
| Search  | `↑ ↓` · `Enter` · `Esc`                                                                          |

## 96. Focus states

Every interactive element has a visible focus state:

```css
outline: 2px solid rgba(37, 99, 235, 0.5);
outline-offset: 2px;
```

Never remove the focus ring without an alternative.

## 97. Accessibility

Minimum **WCAG AA**: keyboard navigation, focus states, sufficient contrast, ARIA labels, semantic HTML, correct heading levels, labelled form fields, status communicated by more than colour.

---

## 98. Responsive breakpoints

| Name    | Width     |
| ------- | --------- |
| Mobile  | < 768     |
| Tablet  | 768–1023  |
| Desktop | 1024–1439 |
| Wide    | ≥ 1440    |

Indicative — do not make the whole layout depend on exactly these values.

## 99. Desktop

Three columns: Navigation · Document · Context.

## 100. Tablet

Navigation · Document. Context sidebar as an overlay or hidden panel.

## 101. Mobile

Topbar · Document. Navigation as a drawer; context as a separate panel/drawer.

## 102. Mobile topbar

```text
☰   BUZHULK                    ⋮
```

A second row may hold `View | Edit`. Search via an icon.

## 103. Mobile navigation drawer

Documentation · Search · tree (Infrastructure, Network, Applications, Procedures) · Settings. Width ~85vw, max 320 px.

## 104. Mobile document

Padding 16–20 px; title 26–28 px; body 16 px. Tables and code blocks scroll horizontally.

## 105. Mobile editor toolbar

Do not try to show everything. Horizontally scrollable: `B I H • 1. <> Link +`; `+` opens the insert menu.

## 106. Mobile source editor

Full width. Line numbers may be off by default to save space.

---

## 107. Animation

100–180 ms, `ease-out`, for hover, dropdown, sidebar and dialog. No bounce/spring animations. Respect `prefers-reduced-motion`.

## 108. Resizable panels

Navigation and context can be resized. Separator is a 1 px border with a subtle hover highlight; the drag hit area may be wider than the visible line.

## 109. Focus mode (later)

Optional later feature that hides navigation, context and most of the topbar, leaving only the document. Not an MVP requirement.

## 110. Document tabs

No IDE-style multi-tab UI in 1.0. Navigation history and Quick Open are enough. May be reconsidered later.

## 111. Multi-select

Not required for MVP. The tree works on single items.

## 112. Tree drag & drop

While dragging show a line indicator:

```text
Applications
────────────
Home Assistant
```

Folder targets are subtly highlighted. Never move an item without a clear target.

## 113. Drag upload

When a file is dragged over the editor show an overlay `Drop file to attach`. Do not cover the whole app in an aggressive colour.

## 114. Image paste

After `Ctrl+V` the screenshot appears immediately in the visual editor with an `Uploading image…` placeholder, then renders the image on success.

## 115. Properties editing

The Info panel allows editing Title, Description, Tags and Aliases (Icon later), saved with **Save properties**. Path is not a plain text input — changing it requires a Move operation (`Move…` next to the path). While the document is open in the editor the panel is read-only.

## 116. Tags editor

```text
Tags
[server ×] [docker ×] [incus ×]  Add…
```

Autocomplete from existing tags. Enter or comma adds a tag, Backspace in the empty input removes the last one. Clicking a tag in the document header opens search filtered by `tag:<name>`.

## 117. Tooltips

Appear after 400–600 ms; short text (`Copy path`, `Toggle sidebar`, `Edit document`).

## 118. Buttons

- **Primary** — sparingly (Create, Save, Sign in); accent background.
- **Secondary** — neutral (Cancel, Move, Import).
- **Ghost** — toolbars/actions.
- **Danger** — destructive actions only.

## 119. Button sizes

Standard height 32–34 px; large 38 px. Avoid the typical 44–48 px desktop buttons unless needed.

## 120. Inputs

Height 34–36 px; border `#cbd5e1`; focus accent; radius 6 px.

## 121. Checkbox

Minimal native/technical look with accent when checked. Never inflated into big cards.

## 122. Dropdown

Item height 32 px. Menu: white, border, `--shadow-popover`, radius 6–8 px.

## 123. Modal

Overlay `rgba(15, 23, 42, 0.35)`. Dialog: white, border, radius 8 px, shadow. No background blur as the main effect.

## 124. Side panels

Separated with `border-right` / `border-left`, not with large contrasting surfaces.

## 125. Status bar

No full VS Code-style status bar required. Optionally the editor bottom edge may show `Markdown · UTF-8 · Saved`. Not a 1.0 requirement.

---

## 126. UI route map

| Route           | Screen                                                                |
| --------------- | --------------------------------------------------------------------- |
| `/`             | Home                                                                  |
| `/doc/:id`      | Document view                                                         |
| `/doc/:id/edit` | Edit (Visual by default; Source is an editor-mode state, not a route) |
| `/settings/*`   | Settings                                                              |
| `/trash`        | Trash                                                                 |
| `/login`        | Login                                                                 |
| `/setup`        | First run                                                             |

## 127. Browser URL

Document URLs are stable and based on the document **UUID**, not the path, so rename/move never changes the external URL.

## 128. Browser title

`BUZHULK — LeanDocs`; on Home just `LeanDocs` (always via `APP_NAME`).

## 129. Document context menu (tree)

```text
Open
Edit
─────
Rename
Move
Duplicate
─────
Copy link
Copy path
─────
Pin
─────
Move to trash
```

## 130. `…` menu in the document header

```text
Rename
Move
─────
Copy link
Copy path
─────
Download Markdown
─────
View history      (future)
─────
Move to trash
```

## 131. Copy link

Copies the application link: `https://docs.example/doc/<uuid>`.

## 132. Copy path

Copies `Infrastructure/Servers/BUZHULK.md`.

## 133. Download Markdown

Downloads the physical `.md` file. Important for the data-ownership philosophy.

## 134. Import UI

```text
Import documentation
○ Markdown directory
○ Markdown files
○ HTML files
[ Select files ]
```

Then _Import preview_.

## 135. Import preview

```text
Source           Destination          Status
BUZHULK.md       Infrastructure/...   Ready
old-note.html    Imported/...         Converted
image.png        assets/...           Ready
```

Warnings are visible before the import runs.

## 136. Trash

List/table: Name · Original location · Deleted. Actions: Restore · Delete permanently.

## 137. Broken links view

Under _Settings › Broken links_. Table: Source document (link) · Broken target (`[[Target]]` or the relative path as written).

---

## 138. Main component architecture

```text
AppShell
  Topbar
  NavigationSidebar
    NavigationTree
      TreeItem
  DocumentLayout
    DocumentHeader
    DocumentRenderer
  EditorShell
    VisualEditor
    SourceEditor
    EditorToolbar
  ContextSidebar
    TableOfContents
    DocumentProperties
    BacklinksPanel
  CommandPalette
  QuickOpen
  Dialog · Dropdown · ContextMenu · Toast
  SettingsLayout
```

## 139. Avoid giant components

No `DocumentPage.tsx` with thousands of lines. Split responsibilities.

## 140. UI state management

Global state only for truly global things: current session, sidebar state, theme, command palette, UI preferences. Document content/cache belongs in a dedicated data-fetching layer. No giant global store.

## 141. Server state

**TanStack Query** (or an equivalent light layer) for cache, loading, refetch, mutations and invalidation.

## 142. Theme implementation

Theme via CSS variables. Never hard-code colours like `color: #2563eb;` across components — use `color: var(--accent);`.

## 143. Branding readiness

Never hard-code the final name, logo or brand colour in components. Use central:

```text
APP_NAME      = "LeanDocs"                         (packages/shared)
APP_TAGLINE   = "Documentation without the bloat." (packages/shared)
APP_LOGO      = AppLogo + Wordmark components         (apps/web/src/components/AppLogo.tsx)
theme tokens  = apps/web/src/styles/tokens.css
```

After `BRAND_SPEC.md` is done, branding must be replaceable in a few places.

## 144. Branding (final)

Branding is defined in [`BRAND_SPEC.md`](BRAND_SPEC.md): the mark "Folded Stack" (small variant in the topbar via `AppLogo`, 22 px), the wordmark Lean**Docs** (Inter 800, "Docs" in `--accent`, via `Wordmark`), the favicon and the app icons. Brand colours are tokens (`--brand-*`). This is the only place in the UI where the accent colours text decoratively.

## 145. Desktop target

Design primarily for 1440 × 900 and 1920 × 1080; the app must remain usable from 1024 px wide.

## 146. Reference desktop proportions (1440 px)

Topbar 52 px · Navigation 270–290 px · Context 240–270 px · Document = remaining width.

## 147. Reading geometry

The document must not stretch text lines across all available width. Target **~70–90 characters per line**.

## 148. Wide code/table behaviour

Code blocks and tables may exceed the reading width (a `wide` content class) or scroll horizontally.

## 149. Minimal chrome

While scrolling a long document the user should mainly see the document, the sidebar and the TOC — not several layers of toolbars.

## 150. Sticky behaviour

Sticky: topbar, **editing bar** (1.3, from owner testing: title, Visual/Source, save status, Save, Done, `…`, width toggle), editor toolbar below it, optionally the TOC header. Not sticky: the document header in View mode. On phones the editing bar stays sticky and the formatting toolbar scrolls.

---

## 151. View mode reference

The user should feel: _"I am reading documentation"_ — not _"I am operating an application"_.

## 152. Edit mode reference

After clicking Edit: _"I can immediately modify this document."_ No separate form, no layout reload, no giant editor in a modal.

## 153. Source mode reference

Should feel like a _simple technical text editor_, not a full IDE.

## 154. Search reference

As fast to use as the VS Code command palette — without copying its look 1:1.

## 155. Navigation reference

Behaves logically like a _file explorer_, because the tree represents a real filesystem.

## 156. Styling anti-patterns

AI agents must not add on their own: glassmorphism, gradients, neon glow, huge shadows, oversized rounded cards, marketing illustrations, dashboard KPIs, animated blobs, decorative patterns.

## 157. Content over decoration

When choosing between a prettier UI and more space for the document, choose the document.

## 158. Density

**Compact-medium.** Not ultra-compact like old desktop software; not airy like a typical SaaS marketing/productivity dashboard.

## 159. Visual hierarchy

```text
Document title
↓
Document content
↓
Navigation / TOC
↓
Actions
↓
Metadata
```

Never the other way round.

---

## 160. Final UI acceptance criteria

- **Visual:** technical and minimal; the document dominates; accent used sparingly; no unnecessary cards; no marketing style.
- **Navigation:** fast tree; readable hierarchy; sidebar resize works; sidebar can be hidden.
- **Document:** reads well; line length controlled; code and tables look natural.
- **Editing:** View → Edit is smooth; visual editor looks like the document; Source is easy to reach; save status is clear.
- **Search:** `Ctrl+K` works; results are readable; keyboard navigation works.
- **Context:** TOC, Info, Backlinks.
- **Responsive:** tablet usable; phone allows reading and editing.
- **Accessibility:** keyboard navigation; visible focus; sufficient contrast.

## 161. Implementation rules for AI

Before any frontend work read: `AGENTS.md`, `PROJECT_SPEC.md`, `UI_SPEC.md`, `docs/implementation-status.md`. Never change the UI direction without an explicit decision by the owner.

## 162. Implementation order

1. Design tokens
2. AppShell
3. Topbar
4. Navigation sidebar
5. Document view
6. Context sidebar
7. Search
8. Dialogs
9. Source editor
10. Visual editor
11. Settings
12. Responsive
13. Dark mode
14. Polish

(These steps are distributed across the PROJECT_SPEC phases — see `docs/implementation-status.md`.)

## 163. Design tokens first

Before building more components establish: colours, spacing, radius, typography, borders, shadows. Never style each component independently.

## 164. Component consistency

If a `Button`, `Input`, `Dialog` or `Dropdown` component exists, reuse it. No local variants without need.

## 165. Visual regression

Later, maintain screenshot tests for key views: Document view, Visual editor, Source editor, Search palette, Settings, Mobile document.

## 166. Main desktop reference screen

````text
┌────────────────────────────────────────────────────────────────────────────┐
│ [logo] LeanDocs  ← →      Search documentation...  Ctrl K     + New   ⚙   │
├──────────────────┬───────────────────────────────────────┬─────────────────┤
│ Documentation  + │ Infrastructure / Servers / BUZHULK    │ Contents        │
│                  │                                       │                 │
│ ▾ Infrastructure │ BUZHULK              View Source Edit │ Overview        │
│   ▾ Servers      │                                       │ Hardware        │
│     BUZHULK      │ Main Docker and Incus host            │ Network         │
│     BUZPI00      │                                       │ Docker          │
│   ▸ Storage      │ server  docker  incus                 │ Incus           │
│                  │                                       │ Backup          │
│ ▾ Network        │ Overview                              │                 │
│   UniFi          │                                       │                 │
│   VLAN           │ Main production host for BUZLAB...    │                 │
│   DNS            │                                       │                 │
│                  │ Hardware                              │                 │
│ ▾ Applications   │ ┌─────────────┬────────────────────┐  │                 │
│   Home Assistant │ │ CPU         │ Intel N100         │  │                 │
│   Vaultwarden    │ │ Network     │ Intel I226-V       │  │                 │
│                  │ └─────────────┴────────────────────┘  │                 │
│ ▸ Procedures     │                                       │                 │
│                  │ Docker                                │                 │
│                  │ ```yaml                               │                 │
│                  │ services:                             │                 │
│                  │   ...                                 │                 │
│                  │ ```                                   │                 │
└──────────────────┴───────────────────────────────────────┴─────────────────┘
````

This is the primary visual target of the application.

## 167. The most important UI rule

The app should not look impressive for the first five minutes. It must still look right after two hours of writing, four hours of reading, 1,000 documents and several years of use. Priorities: **clarity, consistency, density, readability, predictability** — not visual effects.

## 168. Final design statement

LeanDocs uses a technical, minimalist visual language focused on documentation. The UI is neutral. The document is the main element. Navigation mirrors the filesystem. Editing happens without leaving the document. Search is instant. Advanced features are available but never dominate the screen.

The product should look like a professional tool built for a technical person, not like a generic SaaS app.
