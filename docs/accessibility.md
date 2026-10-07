# Accessibility

LeanDocs targets **WCAG 2.2 level AA** (UI_SPEC §97). This page records how that is checked and
what the review in P15-08 (2026-10-07) found.

## How it is checked

- **Automated scans** — `e2e/accessibility.spec.ts` runs [axe-core](https://github.com/dequelabs/axe-core)
  (`@axe-core/playwright`, WCAG 2.0/2.1/2.2 A and AA rules) in the browser tests against every
  screen: Home, a document with tables, task lists, callouts, code, Mermaid and wiki links (view,
  source, Info and Links panels), the visual and source editors with the slash menu, every menu
  and dialog, the search palette, every Settings section, Not found, sign-in (with an error), the
  mobile layout with the navigation drawer, and — in `e2e/setup.spec.ts` — the first-run setup
  screens and the empty library. `expectAccessible(page, screen, include?)` in `e2e/axe.ts`
  lists every violation per screen.
- **Keyboard checks** (same file): every Tab stop on a document page must show a focus
  indicator (an outline or a box shadow); dialogs move focus inside, keep it there, and return
  it to the button that opened them (or to the menu's button when opened from a menu); search
  works without a mouse.
- **Reflow** (WCAG 1.4.10): at 320 CSS px the document, editor and Settings pages must not scroll
  sideways; only tables and code blocks scroll inside their own box.
- **Unit tests** cover the tree's keyboard model (UI_SPEC §95), task-list checkbox names and page
  headings/titles.

Run them with the rest of the browser tests (`pnpm build && pnpm test:e2e`, see
[development.md](development.md)). A new screen, menu or dialog should get an
`expectAccessible` call there.

## Rules for new UI

- Colours come from tokens. Text uses `--text-primary`, `--text-secondary` or `--text-muted`
  (all at least 4.5:1 on every surface, including `--bg-subtle`). `--text-disabled` is only for
  disabled controls and decoration. Status colours as **text** use `--success-text`,
  `--warning-text`, `--danger-text` and `--info-text`; the base `--success`/`--warning`/
  `--danger`/`--info` are for borders and icons (3:1).
- Focus: keep the global `:focus-visible` ring (`--focus-ring`, solid accent). A component that
  replaces it needs another indicator with at least 3:1 contrast — an accent border, inset
  shadow or outline, not a faint background.
- A screen that replaces the whole page (empty, not found, error) has an `h1`: use
  `EmptyState`/`ErrorState` with `level={1}`. Set the tab title with `usePageTitle`.
- Icon-only buttons need `aria-label`; when a button shows text, the label must contain it
  (WCAG 2.5.3).
- Dialogs use the shared `Dialog`, which handles focus return. Editors restore their own caret.

## Findings of the P15-08 review (all fixed)

| #   | Finding                                                                                                                           | WCAG   | Fix                                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------- |
| 1   | Muted text (`#64748b`) on the subtle grey (`#f1f5f9`, e.g. the topbar search) was 4.34:1                                          | 1.4.3  | `--text-muted` is now `#5f6f86` (4.67:1 on `--bg-subtle`)               |
| 2   | Callout titles, import results, save warnings, code strings/numbers and danger menu items used status colours as text (3.2–4.4:1) | 1.4.3  | New `--*-text` tokens (4.6:1 or more)                                   |
| 3   | Source editor line numbers and placeholder used `--text-disabled` (2.5:1)                                                         | 1.4.3  | `--text-muted`                                                          |
| 4   | The focus ring was a 50% tint of the accent (2.2:1)                                                                               | 1.4.11 | Solid accent (5.2:1); UI_SPEC §96 updated                               |
| 5   | Search mode buttons had no focus ring at all (invalid `outline` value)                                                            | 2.4.7  | Uses `--focus-ring`                                                     |
| 6   | Menu items, the selected search result and the sidebar resizer showed focus/selection only with a faint background                | 1.4.11 | Focus ring on menu items; accent bar on the selected result and resizer |
| 7   | Task-list checkboxes in documents had no accessible name                                                                          | 4.1.2  | Named after the item text                                               |
| 8   | Not found, document not found/error, setup/sign-in errors and the empty library had no `h1`                                       | 1.3.1  | `level={1}` on those states                                             |
| 9   | Sign-in, setup, Not found and Settings sections had a generic or stale tab title                                                  | 2.4.2  | `usePageTitle`: "Sign in — LeanDocs", "Storage · Settings — LeanDocs"…  |
| 10  | Closing a dialog left focus on the page body                                                                                      | 2.4.3  | `Dialog` returns focus to the opener                                    |
| 11  | The user menu button was labelled "User menu" while showing the user name                                                         | 2.5.3  | Label "User menu (name)"                                                |
| 12  | At 320 px the topbar pushed the user menu off screen (page 385 px wide)                                                           | 1.4.10 | Wordmark hidden and long names shortened below 480 px                   |
| 13  | The filters row in search had `aria-label` without a role                                                                         | 4.1.2  | `role="group"`                                                          |
| 14  | Field error messages were not linked to their input, so screen readers did not read them on focus                                 | 1.3.1  | Hint and error in `aria-describedby`; `aria-invalid` on selects too     |

Already in place and confirmed: semantic landmarks (`header`, `nav`, `main`), the WAI-ARIA tree
with roving focus, keyboard resizing of the sidebar (arrow keys), Move as a keyboard alternative
to drag and drop (2.5.7), `prefers-reduced-motion`, labelled form fields, form errors in alert regions,
save status and toasts in live regions, broken links shown with a dashed underline (not colour
alone), `lang="en"`.

## Known limitations

- **No screen-reader session yet.** The checks above are automated; NVDA/JAWS and VoiceOver have
  not been tried by a person. Worth doing before 1.0.
- **Text resize to 200% and text spacing** (1.4.4, 1.4.12) were not tested systematically; the
  layout uses relative flex sizing and passed the 320 px reflow check, which covers most of it.
- **Mermaid diagrams** are SVG with no text alternative beyond the diagram source, which is in
  the Source tab.
- **Document content** is the author's: heading order, link text and image alternative text in
  Markdown files are not corrected by LeanDocs.
- **Dark theme** tokens exist but no dark theme is offered yet; they were not reviewed.
