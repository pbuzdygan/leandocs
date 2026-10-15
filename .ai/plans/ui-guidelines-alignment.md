# Intended outcome

The web UI conforms to UI_SPEC/BRAND_SPEC and, where they are silent, to
`.ai/UI_DESIGN_GUIDELINES.md`. Every finding below is fixed or explicitly recorded as not adopted.
No change of UI direction (Technical Minimal stays); this is conformance, consistency, accessibility
and polish.

Acceptance:

- Every finding in "Work packages" is done, with a test where behaviour changed.
- Required checks pass: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build`,
  plus `pnpm test:e2e` (UI change) in the Playwright container with `--memory 2g --cpus 2`.
- axe scans stay clean in both themes; visual snapshots are updated on purpose and reviewed.
- The owner decisions A–C (end of this plan) are implemented and recorded in `docs/decisions.md`.

## Analysis basis

Precedence (`.ai/PROJECT.md`, UI_SPEC §161): UI_SPEC and BRAND_SPEC win; the guidelines fill gaps.
Reviewed: all of `apps/web/src` (shell, navigation, document, context panel, both editors, search,
settings, auth, trash, dialogs, attachments, primitives, tokens), `docs/accessibility.md`,
`docs/decisions.md`, and the visual snapshots in `e2e/visual.spec.ts-snapshots/`.

Already good and kept: token-only colours (no hex outside `tokens.css`), Tabler-only icons through
`components/icons.tsx`, skeletons, empty/error states with `h1`, focus return in dialogs, WAI-ARIA
tree with roving focus, command palette combobox, save status with icon + text, phone drawer
(`inert`, focus handling), reflow at 320 px, dark tokens.

Not adopted from the guidelines (UI_SPEC decides otherwise or it does not apply):

- §43–52 marketing website rules and §21 dashboards: not applicable.
- 44 px buttons on desktop: UI_SPEC §119 sets 32–34 px. Larger targets only for coarse pointers (WP1.5).
- Uppercase section labels ("DOCUMENTATION", "PINNED"): UI_SPEC §18 shows them; kept for sidebar
  section labels only (see WP2.6 for tabs).
- Generic dialog labels "Create"/"Move"/"Rebuild": UI_SPEC §64, §66, §87 define them; kept.

## Work packages

Order: WP1 first (shared primitives), then WP2–WP5 in any order, WP6 last. One commit per work
package or per coherent item, scope `web` (Conventional Commits).

### WP1 — Primitives and tokens (`components/ui/`, `styles/`)

1. **Typography tokens.** Add `--font-size-h1` 32, `--font-size-h2` 24, `--font-size-h3` 20,
   `--font-size-h4` 17, `--font-size-mobile-title` 26, `--font-size-code` 13 (UI_SPEC §9, §104).
   Replace the 24 hard-coded `font-size: NNpx` in CSS (`grep -rnE "font-size:\s*[0-9]+px"`).
   Guideline §5, §26; UI_SPEC §163.
2. **Hover token.** `--bg-hover` equals `--bg-app` (`#f8fafc`), so hover on the Settings nav is
   invisible and on the pinned list nearly so (`settings.css:31`, `navigation.css:331`). Use
   `--bg-subtle` for hover as the tree does (UI_SPEC §22); keep `--bg-hover` only where it is
   visible or remove its uses. Guideline §9 (hover state).
3. **Button states.** `.btn` has no `:active` and no loading state. Add `:active`, and a `loading`
   prop on `Button` (spinner, `aria-busy`, disabled, width kept). Replace the ad-hoc labels
   ("Signing in…", "Creating account…", "Checking…", "Saving…", "Importing…", "Preparing
   preview…") with it where the label is just a busy state; `ChangePassword` gets one (it has none).
   Guideline §9.
4. **Tabs / segmented control.** Add a `Tabs` primitive on Radix `Tabs` (already in `radix-ui`):
   arrow keys, `aria-controls`/`tabpanel`, one tab stop. Used by WP3.1 and WP3.4. The current
   `role="tablist"` blocks have no arrow keys and no panel linkage (`DocumentPage.tsx:380`,
   `:539`, `ContextSidebar.tsx:530`). Guideline §18; UI_SPEC §97.
5. **Touch and coarse pointers.** No `hover: none` / `pointer: coarse` rules exist. Under
   `(pointer: coarse)`: tree rows, pinned rows, Settings nav, icon buttons, tag remove buttons,
   palette mode buttons and menu items get at least 40 px hit areas (padding or `::after` hit
   area, visual size unchanged where possible). Under `(hover: none)`: row actions are visible
   (see WP2.2). Guideline §17, §54; UI_SPEC is silent on touch sizes.
6. **Toast tone.** Error toasts differ only by a red left border (colour alone). Add an icon
   (`AlertIcon`) and keep the longer duration. Guideline §18; UI_SPEC §97.
7. **TagInput.** When disabled, the `<label htmlFor>` points to an input that is not rendered.
   Render a read-only chip list with a plain heading instead. Guideline §12 (disabled vs
   read-only).
8. **Reduced motion.** The `prefers-reduced-motion` rule covers `*` only; add `::before`/`::after`.
9. **Nav item pattern.** Four "active item" styles exist: tree row (selected bg + accent bar +
   accent text), Trash link (same), pinned link (accent text, no bar, different padding), Settings
   nav (selected bg, primary text, no bar, invisible on `--bg-app`), TOC (bar + accent). Define one
   `.nav-item` pattern (height `--tree-row-height`, hover `--bg-subtle`, active = UI_SPEC §22) and
   use it in pinned, Trash link and Settings nav; the tree rows already match it. Pinned rows align
   with tree rows. The TOC keeps its scroll-spy bar (UI_SPEC §45), which is a position marker,
   not a selection.
   Guideline §11, §25, §37.

### WP2 — Shell and navigation (`app/`, `navigation/`)

1. **Initial loading** (UI_SPEC §78). `SetupGate`/`AuthGate` render `SkeletonLines` inside the
   centred `.setup` flex box, where the skeleton has no width and is likely invisible. Add an
   `AppLoading` screen: small logo + "Loading documentation…". Verify in the browser first.
2. **Row actions on touch.** `.tree-row__actions` is `opacity: 0` until hover/focus, so phones
   never see "…" (only long-press). Show it under `(hover: none)` (WP1.5).
3. **Empty folder** (UI_SPEC §74). An expanded empty folder shows nothing. Add a muted row
   "This folder is empty." with "Create document · Create folder" (`tree-utils.ts`
   `flattenVisible` + `NavigationTree.tsx`).
4. **Breadcrumb does nothing visible** on phones or with the sidebar hidden
   (`DocumentPage.tsx:239` only calls `reveal`). After `reveal`, open the drawer (phone) or show
   the sidebar (hidden on desktop) and focus the folder row.
5. **Sign-out error** renders a `FormError` inside the 52 px topbar (`Login.tsx:250`). Use an error
   toast.
6. **Sidebar labels.** Keep "DOCUMENTATION"/"PINNED" (UI_SPEC §18). The context panel tabs move to
   sentence case with WP3.4 (they are tabs, not labels; guideline §5 "avoid excessive uppercase").
7. **Move dialog folder picker** (`MoveDialog.tsx`): `role="listbox"` with a `<button>` nested in
   each `option` and every row a tab stop. Rebuild as a small tree (`role="tree"`, roving
   tabindex, ↑ ↓ ← → like the navigation tree, Enter selects); padding from `--tree-indent`
   instead of `8 + level * 16`. Guideline §18, §25.

### WP3 — Document page and editors (`documents/`, `editor/`)

1. **Document mode tabs.** View/Source become a `Tabs` (WP1.4); Edit is a separate button (it
   navigates, so it is not a tab). Editing: Visual/Source as `Tabs`. Keep the UI_SPEC §31 look.
2. **Edit mode repeats the title three times** and shifts the layout (snapshot
   `visual-editor-light`: editing-bar title, header `h1`, and the content's own `# ATLAS`, which
   View hides). Breaks UI_SPEC §34/§152 ("practically identical", no layout rebuild). Default fix
   (owner decision A): while editing, hide the header `h1` when the content starts with the H1
   the renderer would drop, so the editable H1 takes its place; the editing-bar title stays.
3. **Split `DocumentPage.tsx`** (641 lines, UI_SPEC §139) into `DocumentLayout.tsx`,
   `ViewDocument.tsx`, `DocumentEditor.tsx`; no behaviour change. Do it before WP3.1–3.2.
4. **Context panel.** Tab order to UI_SPEC §44 (Contents · Info · Links; now Contents · Links ·
   Info); `Tabs` primitive; sentence case. Add the resize handle UI_SPEC §108 requires (extract
   the sidebar's pointer/keyboard resize into a `useResizablePanel` hook; 220–400 px, remembered).
5. **Info panel while editing** shows disabled inputs. Show the properties as read-only facts
   (`dl`) with the existing note; inputs only when editable (WP1.7).
6. **Visual editor toolbar** (`VisualEditor.tsx`, `visual.css`):
   - Radix `Toolbar`: one tab stop, arrow keys (it is `role="toolbar"` with 18+ tab stops now).
   - Explicit groups Text / Formatting / Structure / Insert (UI_SPEC §36) with separators,
     replacing `button:nth-child(4|8|12)`.
   - Active state (`aria-pressed`, accent) for marks and the current block type.
   - Tooltips through the shared tooltip instead of `title` (UI_SPEC §117).
   - Phones (UI_SPEC §105): only B, I, H, bullet, numbered, inline code, Link and `+` (insert
     menu with the rest).
   - Slash and `[[` menus: expose the highlighted item to assistive technology
     (`aria-activedescendant`/`aria-controls` on the editable element, or a polite live region if
     ProseMirror makes that impractical).
7. **Editor states.** "Loading editor…" paragraphs (`DocumentPage.tsx:449`, `:593`,
   `VisualEditor.tsx:575`) become skeletons; the visual editor load error uses `ErrorState` with
   "Edit in Source" instead of a raw `<details>`. Links panel "Loading…" becomes skeleton lines.
8. **Width toggle icon.** `IconViewportNarrow/Wide` reads as a crosshair at 16 px (snapshot).
   Pick clearer Tabler icons (e.g. arrow-autofit width/content) in `icons.tsx`.
9. **Attachments** (UI_SPEC §58): name with size on a meta line (`formatBytes`, not `ceil(KB)`),
   Open/Download aligned right, Delete last; Retry button not nested inside `<p>`.
10. **Conflict review text** says "Red lines … green lines"; mention the `−`/`+` prefixes too
    (colour alone, guideline §18).

### WP4 — Settings, auth, trash, dialogs, menus

1. **Settings feedback.** Replace the static "Changes are saved automatically…" with a subtle
   per-section save status (Saving… / Saved / Not saved + Retry), the same look as the editor's
   `SaveStatus`. Guideline §16.
2. **Two-factor status** as a status label with icon ("Enabled · 7 recovery codes left" /
   "Not enabled"), not a plain note; errors next to the form actions, not below the section.
3. **About** (UI_SPEC §88): add the License link.
4. **Login with MFA:** primary "Verify and sign in" directly after the code field; "Use recovery
   code" and "Start again" as quiet link-style buttons below it, not full-width ghost buttons.
5. **Setup:** password hint uses `MIN_ACCOUNT_PASSWORD_LENGTH` instead of a literal 15
   (`Setup.tsx:167`); show the step ("Step 1 of 3") for the three-step flow (UI_SPEC §90).
6. **Trash rows:** each row has a solid red "Delete permanently" (many equal red buttons; guideline
   §6, §13). Keep Restore as a button; move "Delete permanently" into a row `…` menu
   (`menu__item--danger`), keep "Empty trash" as the one danger button. Owner decision C.
7. **Menu icons:** Rename and Edit both use the pencil; Open uses the external-link icon (suggests
   a new tab). Give Rename and Open their own icons (`menu-entries.tsx`, `icons.tsx`). Guideline §10.
8. **Page headers.** Page titles differ: Home 32 px, Trash 24 px, Settings 20 px, Login 24 px; page
   paddings differ too. Add a `PageHeader` (title, optional description, primary action) and one
   page container for Home, Trash and Settings. Owner decision B: application pages
   24 px/700 (`--font-size-h2`), document titles stay 32 px (UI_SPEC §28). Guideline §36.

### WP5 — States and copy

1. **Home:** an empty "Recently updated" list renders only a border; show "No documents yet" text.
   Handle a tree load error on Home (currently nothing).
2. **Input focus** (UI_SPEC §96 asks for a 2 px accent indicator): `.input`, `.tag-input` and the
   topbar search use a 1 px accent border plus a faint `--accent-soft` ring. Make the indicator
   2 px accent (`box-shadow: 0 0 0 1px var(--accent)` on top of the border).
3. **Spacing sweep:** replace off-grid values where a token fits (`gap: 2px` in topbar history,
   Settings nav, palette modes; `MoveDialog` inline pixels). Keep 1–2 px values that UI_SPEC
   prescribes (inline code `1px 4px`, tag padding).
4. **Error copy:** messages built as `Not saved: ${error ?? 'unknown error'}` and
   `Upload failed: …` say what failed but not what to do; add the next step ("Check the
   connection and press Save again"). Guideline §24.

### WP6 — Docs, tests, snapshots

1. Tests for changed behaviour: tabs arrow keys (unit), toolbar roving focus (unit/e2e),
   breadcrumb opens the phone drawer (e2e `responsive.spec.ts`), "…" visible with `hasTouch`
   (e2e), empty-folder row (unit), context panel resize (e2e), phone editor toolbar (e2e),
   Button loading (unit), Move dialog keyboard (unit), Settings save status (unit).
2. Add `expectAccessible` calls for new UI (Move dialog tree, context resize handle, phone insert
   menu) in `e2e/accessibility.spec.ts`.
3. Update visual snapshots (`e2e/visual.spec.ts-snapshots/`, both themes) once, after WP1–WP5;
   review every diff before accepting.
4. `docs/accessibility.md`: remove the stale "no dark theme is offered yet" limitation (the theme
   setting exists and axe runs in both themes); add rules for tabs, toolbars and coarse-pointer
   targets.
5. `CHANGELOG.md` entry (user-visible: context panel resize, empty folder state, phone toolbar,
   trash row menu, settings save status). UI_SPEC wording only where an owner decision changes
   it; record defaults taken as `D-xx` in `docs/decisions.md`.

## Changes to the approach during implementation

- WP2.2 (row actions on touch) and WP4.7 (menu icons) landed with WP1 and WP3.
- WP5.1: a tree load error needs nothing extra on Home; the navigation already shows it with
  Retry, and Home does not depend on the tree beyond the empty-library check.
- WP5.3: only the off-grid gaps that are not prescribed were changed (topbar history, search
  modes); 1–2 px values in tags, inline code, chips and stacked list meta stay as UI_SPEC shows.
- WP6.3: snapshots were updated per work package after review, so no commit on `dev` carries a red
  visual suite, instead of once at the end.

## Risks and verification

- Visual snapshots will change in almost every WP; update them once at the end, not per commit,
  and review diffs (they are the guard against unintended restyling).
- Toolbar and tabs rewrites touch keyboard handling inside the editors (Ctrl+S, Esc, slash menu
  capture in `VisualEditor.tsx:431`); run `editing`, `visual-editing`, `editor-feedback` e2e
  specs after WP3.
- WP3.2 must not hide a real content heading: only the H1 the renderer already drops from View.
- Coarse-pointer sizes must not change the desktop layout (Playwright desktop runs use a fine
  pointer; add one `hasTouch` project or test).
- Dev machine: 6 GiB RAM, no swap; run e2e only in the Playwright container with limits.
- No new dependencies: Radix Tabs, Toolbar and ToggleGroup ship in the existing `radix-ui`.
- Never touch `data/`, `.env` or shipped migrations (none needed).

## Owner decisions (accepted 2026-10-15)

The owner accepted all three defaults. Record them as `D-xx` in `docs/decisions.md` with the
commit that implements each one.

- **A.** Edit-mode title: hide the header `h1` while editing when the content starts with the
  matching H1 (the one View already drops).
- **B.** Application page titles (Home, Trash, Settings) at 24 px; document titles stay 32 px.
- **C.** Trash: "Delete permanently" moves into a row `…` menu; "Empty trash" stays the one danger
  button.

## References

- `UI_SPEC.md` §5–13, §17–23, §31–38, §43–48, §58, §74, §77–78, §88, §90, §96–97, §105, §108,
  §117–119, §139, §160–165
- `.ai/UI_DESIGN_GUIDELINES.md` §5–6, §9–13, §16–18, §24–26, §36–37, §54
- `docs/accessibility.md` (rules for new UI), `docs/decisions.md` D-38, D-56, D-64, D-66
- Snapshots: `e2e/visual.spec.ts-snapshots/*-light-visual-linux.png`
