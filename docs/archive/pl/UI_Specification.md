# LeanDocs
Documentation without the bloat.

## UI Specification

**Status:** Approved UI Direction  
**Wersja dokumentu:** 1.0  
**Wybrany kierunek:** A — Technical Minimal  
**Powiązany dokument:** `PROJECT_SPEC.md`  
**Docelowa wersja aplikacji:** 1.0  

---

# 1. Cel dokumentu

Ten dokument definiuje wygląd, zachowanie i strukturę interfejsu użytkownika aplikacji LeanDocs - Documentation without the bloat.

`PROJECT_SPEC.md` określa:

> co aplikacja robi.

`UI_SPEC.md` określa:

> jak użytkownik z tego korzysta i jak aplikacja wygląda.

Asystent AI implementujący frontend powinien traktować ten dokument jako nadrzędne źródło decyzji dotyczących:

- layoutu;
- spacingu;
- komponentów;
- kolorystyki interfejsu;
- typografii;
- zachowania paneli;
- edytorów;
- formularzy;
- menu;
- dialogów;
- responsive design;
- loading states;
- empty states;
- error states.

Nie należy samodzielnie zmieniać stylu aplikacji na dashboardowy, glassmorphism, neumorphism, material design ani stylistykę podobną do Notion.

---

# 2. Główna zasada UI

Interfejs ma być:

> niewidoczny wtedy, kiedy użytkownik czyta dokumentację, i maksymalnie użyteczny wtedy, kiedy jej potrzebuje.

Treść jest najważniejszym elementem ekranu.

UI nie może konkurować z dokumentem.

---

# 3. Charakter wizualny

Wybrany kierunek:

## Technical Minimal

Charakter:

- techniczny;
- precyzyjny;
- spokojny;
- profesjonalny;
- lekki;
- neutralny;
- uporządkowany;
- funkcjonalny.

Aplikacja powinna kojarzyć się z:

- nowoczesną dokumentacją techniczną;
- GitBook;
- GitHub;
- VS Code Explorer;
- panelami developerskimi;
- dokumentacją API.

Nie powinna wyglądać jak:

- Notion;
- Trello;
- Monday;
- ClickUp;
- dashboard biznesowy;
- panel analityczny;
- aplikacja finansowa;
- aplikacja mobilna przeniesiona na desktop.

---

# 4. Fundamentalne cechy stylu

UI powinno wykorzystywać:

- jasne powierzchnie;
- bardzo subtelne kontrasty;
- cienkie obramowania;
- ograniczoną liczbę kolorów;
- jeden główny kolor interakcji;
- niewielkie promienie zaokrągleń;
- mało cieni;
- stosunkowo wysoką gęstość informacji;
- dużą czytelność;
- dużo przestrzeni wokół samego dokumentu.

Unikać:

- dużych gradientów;
- mocnych cieni;
- przesadnie zaokrąglonych kart;
- wielkich przycisków;
- kolorowych dashboard cards;
- wielkich ikon;
- ilustracji dekoracyjnych;
- animacji bez funkcji.

---

# 5. Design tokens

UI powinno wykorzystywać CSS variables.

Przykład:

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

  --shadow-popover:
    0 8px 24px rgba(15, 23, 42, 0.10);
}
```

Kolory te są **kolorami UI**, nie finalnym brandingiem.

Po stworzeniu `BRAND_SPEC.md` główny accent może zostać zmieniony bez przebudowy komponentów.

---

# 6. Kolor akcentu

Do czasu przygotowania brandingu stosować:

```text
#2563EB
```

czyli stonowany techniczny blue.

Kolor ma być używany wyłącznie do:

- active state;
- links;
- focus;
- primary action;
- selected item;
- progress;
- aktywnej zakładki.

Nie używać go jako dużego tła sekcji.

---

# 7. Typografia

Preferowany font:

```text
Inter
```

Fallback:

```css
font-family:
  Inter,
  ui-sans-serif,
  system-ui,
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI",
  sans-serif;
```

---

# 8. Font monospace

Dla:

- kodu;
- Source Editor;
- path;
- hashes;
- command line;
- technical IDs.

Preferowany:

```text
JetBrains Mono
```

Fallback:

```css
ui-monospace,
SFMono-Regular,
Menlo,
Monaco,
Consolas,
"Liberation Mono",
monospace
```

---

# 9. Font sizes

Bazowy:

```text
14 px
```

Interfejs:

```text
12 px   metadata
13 px   sidebar / secondary UI
14 px   standard UI
15 px   selected UI emphasis
```

Dokument:

```text
16 px   body
```

Nagłówki:

```text
H1  32 px / 700
H2  24 px / 650
H3  20 px / 650
H4  17 px / 650
```

Document body:

```text
line-height: 1.7
```

UI:

```text
line-height: 1.4
```

---

# 10. Spacing system

Podstawowy grid:

```text
4 px
```

Najczęściej:

```text
4
8
12
16
20
24
32
40
48
```

Nie używać przypadkowych wartości typu:

```text
13px
19px
27px
```

---

# 11. Border radius

Technical Minimal nie powinien posiadać dużych zaokrągleń.

Standard:

```text
4–6 px
```

Dialog/popover:

```text
8 px
```

Nigdy:

```text
16–24 px
```

dla zwykłych kart i paneli.

---

# 12. Shadows

Większość komponentów:

```text
bez shadow
```

Separacja za pomocą:

```text
border
background
spacing
```

Shadow stosować wyłącznie dla:

- dropdown;
- command palette;
- dialog;
- tooltip;
- floating menu.

---

# 13. Ikony

Preferowana biblioteka:

```text
Lucide Icons
```

Powody:

- minimalistyczne;
- techniczne;
- spójne;
- lekkie;
- czytelne.

Standardowy rozmiar:

```text
16 px
```

Sidebar:

```text
15–16 px
```

Toolbar:

```text
16–18 px
```

Duże ikony stosować wyłącznie w empty state.

---

# 14. Główny layout desktop

Standardowy ekran:

```text
┌───────────────────────────────────────────────────────────────┐
│ Topbar                                                        │
├────────────────┬─────────────────────────────┬────────────────┤
│                │                             │                │
│ Navigation     │ Document                    │ Context        │
│ Sidebar        │                             │ Sidebar        │
│                │                             │                │
│                │                             │                │
└────────────────┴─────────────────────────────┴────────────────┘
```

---

# 15. Topbar

Wysokość:

```text
52 px
```

Topbar jest zawsze widoczny.

Zawiera:

### lewa część

- placeholder logo/icon;
- placeholder `<PROJECT_NAME>`;
- opcjonalnie breadcrumb.

### środek

Global Search.

### prawa część

- New Document;
- opcjonalne utility actions;
- Settings;
- user menu.

---

# 16. Global Search w topbar

Szerokość desktop:

```text
320–440 px
```

Wygląd:

```text
[ 🔍 Search documentation...          Ctrl K ]
```

Search field jest subtelny.

Tło:

```text
#f1f5f9
```

Border pojawia się mocniej po focus.

Kliknięcie otwiera Command Palette Search.

---

# 17. Main navigation sidebar

Domyślna szerokość:

```text
280 px
```

Minimalna:

```text
220 px
```

Maksymalna:

```text
400 px
```

Sidebar powinien być resizable.

Pozycja resize ma być zapamiętywana lokalnie.

---

# 18. Sidebar structure

Przykład:

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

---

# 19. Sidebar header

Góra sidebara:

```text
Documentation                +
```

`+` otwiera menu:

```text
New document
New folder
```

---

# 20. Tree row

Standardowa wysokość:

```text
30 px
```

Tree item zawiera:

```text
chevron
icon
label
optional actions
```

Folder:

```text
▾ 📁 Infrastructure
```

Document:

```text
  📄 BUZHULK
```

---

# 21. Tree indentation

Każdy poziom:

```text
16 px
```

Nie należy używać widocznych linii tree w stylu klasycznego Windows Explorer.

Hierarchy ma wynikać z:

- indentation;
- chevron;
- icons.

---

# 22. Tree states

Normal:

```text
transparent
```

Hover:

```text
#f1f5f9
```

Selected:

```text
#eff6ff
```

Selected text:

```text
#1d4ed8
```

Selected może mieć subtelny:

```text
border-left: 2px solid accent
```

---

# 23. Sidebar context menu

Right-click lub `...`.

Menu:

```text
Open
Open in new tab

Rename
Move
Duplicate

New document here
New folder here

Copy path

Delete
```

Separator przed destructive action.

Delete:

```text
danger color
```

---

# 24. Document workspace

Centralna część jest głównym elementem aplikacji.

Background aplikacji:

```text
#f8fafc
```

Sam dokument:

```text
#ffffff
```

---

# 25. Document maximum width

Treść dokumentu:

```text
max-width: 900px
```

Preferowane:

```text
760–860 px
```

dla typowego tekstu.

Kod i tabela mogą wykorzystywać większą szerokość.

Document container powinien reagować na dostępne miejsce.

---

# 26. Document top spacing

Góra dokumentu:

```text
32–40 px
```

Lewa/prawa:

```text
40–64 px
```

Na małych desktopach:

```text
24–32 px
```

---

# 27. Document Header

Przykład:

```text
BUZHULK

Main Docker and Incus host

server  docker  incus

Updated 4 minutes ago
```

Po prawej:

```text
View   Source   Edit   ...
```

---

# 28. Document Title

Title:

```text
32 px
font-weight: 700
```

Nie umieszczać w karcie.

Bez dekoracyjnego tła.

---

# 29. Document description

Opcjonalnie z front matter:

```text
Main Docker and Incus host.
```

Styl:

```text
16 px
text-secondary
```

---

# 30. Document metadata

Powinna być subtelna.

Przykład:

```text
Updated 2 Oct 2026 · 4 min read
```

Font:

```text
12–13 px
```

---

# 31. Document actions

Główne:

```text
View
Source
Edit
```

Nie powinny wyglądać jak trzy duże przyciski.

Preferowany segmented/tab style:

```text
View   Source   Edit
────
```

Aktywny stan:

- accent text;
- bottom border.

---

# 32. Edit mode

Po wejściu w Edit:

header zmienia actions na:

```text
Visual
Source

Saved
```

oraz opcjonalnie:

```text
Cancel
```

---

# 33. Save status

Zawsze bardzo subtelny.

Przykłady:

```text
Saved
Saving…
Unsaved
Conflict
Save failed
```

Kolory:

```text
Saved       muted
Saving      muted
Conflict    warning
Error       danger
```

Nie stosować toastów przy każdym autosave.

---

# 34. Visual Editor

Visual Editor powinien wyglądać praktycznie jak View Mode.

To kluczowe.

Przejście:

```text
View → Edit
```

nie powinno powodować całkowitej przebudowy ekranu.

Dokument po prostu staje się edytowalny.

---

# 35. Visual Editor Toolbar

Toolbar pojawia się nad dokumentem.

Przykład:

```text
¶  H1  H2  H3 | B I S | • 1. ☑ | <> | 🔗 🖼 | Table | ...
```

Wysokość:

```text
40 px
```

Toolbar:

- sticky;
- biały;
- bottom border.

---

# 36. Toolbar groups

Grupy rozdzielone separatorami.

### Text

```text
Paragraph
H1
H2
H3
```

### Formatting

```text
Bold
Italic
Strikethrough
Inline code
```

### Structure

```text
Bullet list
Ordered list
Checklist
Quote
```

### Insert

```text
Link
Image
Attachment
Table
Code block
Callout
```

---

# 37. Bubble toolbar

Po zaznaczeniu tekstu może pojawić się niewielki floating toolbar:

```text
B  I  S  <>  Link
```

Nie należy przeciążać go funkcjami.

---

# 38. Slash commands

Visual Editor może obsługiwać:

```text
/
```

Menu:

```text
Heading 1
Heading 2
Heading 3

Bullet list
Numbered list
Checklist

Code block
Table
Callout
Image
Attachment
Divider
```

---

# 39. Source Editor

Source Editor powinien wykorzystywać CodeMirror.

Layout:

```text
pełna szerokość document workspace
```

ale z zachowaniem bocznych paneli.

---

# 40. Source Editor wygląd

Background:

```text
#ffffff
```

Gutter:

```text
#f8fafc
```

Line numbers:

```text
#94a3b8
```

Font:

```text
13–14 px monospace
```

Line height:

```text
1.6
```

---

# 41. Source Editor syntax

Kolorowanie ma być subtelne.

Nie tworzyć wyglądu IDE z dziesięcioma mocnymi kolorami.

Najważniejsze:

- heading;
- links;
- code;
- front matter;
- quote;
- bold;
- syntax.

---

# 42. Source ↔ Visual toggle

Przełączenie:

```text
Visual | Source
```

powinno być zawsze dostępne w Edit Mode.

Po przełączeniu cursor position można zachować, jeśli implementacja pozwala bez komplikacji.

---

# 43. Context Sidebar

Prawy panel.

Domyślna szerokość:

```text
260 px
```

Może być:

```text
show/hide
```

---

# 44. Context Sidebar tabs

Preferowane:

```text
Contents
Info
Links
```

Nie pokazywać wszystkich naraz.

---

# 45. Contents

Automatyczny TOC:

```text
Contents

Overview
Hardware
Network
Docker
Incus
Backup
Troubleshooting
```

Aktywna sekcja podświetlana podczas scroll.

---

# 46. Info

Przykład:

```text
Properties

Path
Infrastructure/Servers/BUZHULK.md

Created
27 Sep 2026

Updated
2 Oct 2026

Tags
server
docker
incus
```

---

# 47. Links

Przykład:

```text
Backlinks

Home Assistant
Network Architecture
Docker Hosts
```

oraz:

```text
Outgoing Links
```

---

# 48. Collapse Context Sidebar

Przycisk:

```text
›
```

Po zamknięciu centralna przestrzeń rozszerza się.

Stan ma być zapamiętywany.

---

# 49. Breadcrumb

Nad title może pojawić się subtelny breadcrumb:

```text
Infrastructure / Servers / BUZHULK
```

Font:

```text
12–13 px
```

Klikalne elementy.

Nie może dominować wizualnie.

---

# 50. Tags

Tag:

```text
server
```

Styl:

```text
background: #f1f5f9
border: #e2e8f0
font-size: 12px
radius: 4px
```

Tag nie powinien wyglądać jak kolorowa duża pill.

---

# 51. Standardowy link

Kolor:

```text
accent
```

Underline:

- domyślnie opcjonalny;
- pojawia się przy hover.

Visited link nie powinien zmieniać się na klasyczny fiolet.

---

# 52. Code block

Przykład:

```text
yaml                                   Copy

services:
  homeassistant:
    image: ...
```

Tło:

```text
#0f172a
```

Tekst:

```text
#e2e8f0
```

Radius:

```text
6 px
```

Toolbar code block:

```text
language            Copy
```

---

# 53. Inline code

```text
docker compose up -d
```

Style:

```text
background: #f1f5f9
border: #e2e8f0
font: monospace
padding: 1px 4px
radius: 4px
```

---

# 54. Tables

Technical tables powinny być lekkie.

Header:

```text
background #f8fafc
font-weight 600
```

Border:

```text
#e2e8f0
```

Cell padding:

```text
8px 12px
```

Bez zebra stripes domyślnie.

---

# 55. Callouts

## Note

```text
border-left: 3px solid #64748b
background: #f8fafc
```

## Info

```text
#0284c7
```

## Tip

```text
#16a34a
```

## Warning

```text
#d97706
```

## Danger

```text
#dc2626
```

Callout nie powinien posiadać mocno kolorowego całego tła.

---

# 56. Mermaid

Diagram ma być osadzony w neutralnym kontenerze.

```text
border
background white
padding 16–24px
```

Opcjonalne actions:

```text
Open source
Fullscreen
```

---

# 57. Images

Obraz:

- max-width 100%;
- zachowanie proporcji;
- niewielki radius;
- subtelny border jeśli potrzebny.

Kliknięcie może otwierać preview/lightbox.

---

# 58. Attachment

Generic attachment:

```text
📎 compose.yaml
   4.2 KB
```

Actions:

```text
Open
Download
```

---

# 59. Global Search / Command Palette

Uruchamiane:

```text
Ctrl/Cmd + K
```

Modal/palette:

```text
┌────────────────────────────────────────────┐
│ 🔍 Search documentation...                │
├────────────────────────────────────────────┤
│ BUZHULK                                   │
│ Infrastructure / Servers                  │
│ ...macvlan interface configuration...     │
│                                            │
│ Home Assistant                             │
│ Applications                              │
│ ...connection through macvlan...          │
└────────────────────────────────────────────┘
```

---

# 60. Command Palette dimensions

Desktop:

```text
width: 640–720 px
max-height: 70vh
```

Position:

```text
top: ~15vh
```

Nie dokładnie pośrodku ekranu.

---

# 61. Search result

Każdy wynik:

```text
Title
Path
Snippet
```

Matching fragment może mieć highlight.

Keyboard:

```text
↑ ↓
Enter
Esc
```

---

# 62. Search filters

Jeżeli użytkownik wpisze:

```text
tag:docker
```

rozpoznany filter można pokazać jako subtelny token.

---

# 63. Quick Open

```text
Ctrl/Cmd + P
```

UI podobny do search, ale wyniki zawierają tylko:

```text
Document
Path
```

bez full-text snippets.

---

# 64. New Document dialog

Dialog:

```text
New document

Name
[ Home Assistant                    ]

Location
[ Applications                 ▾ ]

Template
[ Blank                        ▾ ]

                        Cancel   Create
```

Szerokość:

```text
480–560 px
```

---

# 65. Template selection

Template może być prezentowany jako lista:

```text
Blank
Server
Application
Procedure
Network Device
Incident
```

Nie stosować dużych kafelków z ilustracjami.

---

# 66. Move dialog

Przypomina prosty file picker.

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

---

# 67. Delete confirmation

Dla zwykłego delete:

```text
Move document to trash?

BUZHULK will be moved to Trash and can be restored.

Cancel
Move to Trash
```

Primary destructive action:

```text
danger
```

---

# 68. Permanent delete

Silniejsze potwierdzenie:

```text
Delete permanently?

This action cannot be undone.
```

Dla krytycznych operacji można wymagać wpisania nazwy dokumentu dopiero wtedy, kiedy wartość danych to uzasadnia.

Nie robić tego dla każdego delete.

---

# 69. Conflict dialog

```text
Document changed outside the editor

This document was modified after you opened it.

Modified on disk:
2 Oct 2026 01:54

Your editor:
unsaved changes

[ Review changes ]

Reload from disk
Save as copy
Cancel
```

Nie dawać prostego:

```text
Overwrite
```

jako domyślnego działania.

---

# 70. External Change notification

Jeśli dokument nie jest edytowany:

```text
Document updated externally.
```

Treść odświeżyć automatycznie lub po bezpiecznej synchronizacji.

Jeśli jest edytowany:

pokazać conflict state.

---

# 71. Toasts

Toast stosować do zdarzeń:

```text
Document moved
Link copied
Index rebuilt
Attachment uploaded
```

Nie stosować do:

```text
Document saved
```

jeżeli autosave działa poprawnie.

---

# 72. Toast position

Desktop:

```text
bottom-right
```

Telefon:

```text
bottom-center
```

Auto dismiss:

```text
4–5 seconds
```

Błędy mogą pozostać dłużej.

---

# 73. Empty application state

Jeżeli dokumentacji nie ma:

```text
No documentation yet

Create your first document or import an existing Markdown directory.

[ New document ]

Import Markdown
```

Minimalna ikona dokumentu.

Bez dużych ilustracji.

---

# 74. Empty folder

```text
This folder is empty.

Create document
Create folder
```

---

# 75. No Search Results

```text
No results for "macvlann"

Try another phrase or check your filters.
```

Można zaproponować:

```text
Search for "macvlan"
```

jeżeli istnieje prosty mechanizm fuzzy match.

---

# 76. Broken link

W dokumencie:

```text
[[Old Server]]
```

renderowany jako:

```text
Old Server
```

z subtelnym broken-link style:

```text
text muted
dashed underline
```

Hover:

```text
Document not found
```

---

# 77. Loading

Nie używać spinnera na całym ekranie, jeśli można pokazać skeleton.

Skeleton:

- tree;
- title;
- lines.

Drobne operacje:

small spinner.

---

# 78. App initial loading

```text
<placeholder icon>

Loading documentation…
```

Minimalny ekran.

Bez splash animation.

---

# 79. Error Page

Przykład:

```text
Unable to load document

The file could not be read.

Retry

Details
```

Details zwijane.

Nie pokazywać raw stacktrace zwykłemu użytkownikowi.

---

# 80. 404 Document

```text
Document not found

It may have been moved, renamed or deleted.

Back to documentation
```

---

# 81. Settings

Layout:

```text
Settings

General
Editor
Appearance
Authentication
Storage
Index
About
```

Lewy mini-sidebar i główny panel.

---

# 82. General Settings

Przykładowe opcje:

```text
Open last document on startup

Default new document location

Autosave
```

---

# 83. Editor Settings

```text
Default editor
Visual / Source

Autosave delay

Show line numbers

Word wrap

Tab size
```

---

# 84. Appearance

Dla 1.0:

```text
Theme
System
Light
Dark
```

Light jest głównym kierunkiem referencyjnym.

Dark mode ma zachować **Technical Minimal**, a nie przechodzić w stylistykę mockupu B.

---

# 85. Dark Mode

Dark colors orientacyjnie:

```css
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
```

Dark mode powinien być równie neutralny jak Light.

---

# 86. Storage Settings

Pokazywać:

```text
Data directory
/data

Content directory
/data/content

Documents
482

Attachments
1.7 GB

Database
23 MB
```

Actions:

```text
Rebuild Index
```

---

# 87. Rebuild Index

Po kliknięciu:

```text
Rebuild search index?

Documentation files will not be modified.

Cancel
Rebuild
```

Podczas operacji:

```text
Indexing documents…
182 / 482
```

---

# 88. About

Pokazać:

```text
<PROJECT_NAME>
Version 1.0.0

Server version
Frontend version

Documentation
GitHub
License
```

---

# 89. Login

Bardzo prosty.

```text
<icon>

<PROJECT_NAME>

Sign in

Username
Password

Sign in
```

Max-width:

```text
360 px
```

Centralnie.

Bez ilustracji marketingowych.

---

# 90. First Run

```text
Welcome

Create your administrator account.

Username
Password
Confirm password

Create account
```

Następny krok:

```text
Documentation storage

/data/content
```

następnie:

```text
Ready
```

---

# 91. Dashboard / Home

Home ma być bardzo prosty.

Nie dashboard.

Układ:

```text
Documentation

Quick actions
New document
Search
Import

Recent documents

Pinned
```

---

# 92. Recent Documents

Lista zamiast kart.

```text
BUZHULK
Infrastructure / Servers
Updated 12 min ago

Home Assistant
Applications
Updated yesterday
```

---

# 93. Pinned

Również lista.

Nie używać dużych kafelków.

---

# 94. Navigation history

Topbar może posiadać:

```text
← →
```

jak browser/VS Code.

Pozwala wracać pomiędzy ostatnio otwartymi dokumentami.

---

# 95. Keyboard navigation

Tree:

```text
↑ ↓     move
→       expand/open
←       collapse/parent
Enter   open
F2      rename
Delete  trash
```

Search:

```text
↑ ↓
Enter
Esc
```

---

# 96. Focus states

Każdy interaktywny element musi posiadać widoczny focus.

Preferowany:

```css
outline: 2px solid rgba(37, 99, 235, 0.5);
outline-offset: 2px;
```

Nie usuwać focus ring bez alternatywy.

---

# 97. Accessibility

Minimum:

```text
WCAG AA
```

W szczególności:

- keyboard navigation;
- focus states;
- odpowiedni contrast;
- aria labels;
- semantic HTML;
- odpowiednie heading levels;
- formularze z labels;
- status komunikowany poza samym kolorem.

---

# 98. Responsive Breakpoints

Orientacyjnie:

```text
Mobile      < 768
Tablet      768–1023
Desktop     1024–1439
Wide        >= 1440
```

Nie uzależniać całego layoutu od dokładnie tych wartości.

---

# 99. Desktop

Standard:

```text
Navigation
Document
Context
```

3 kolumny.

---

# 100. Tablet

Domyślnie:

```text
Navigation
Document
```

Context sidebar jako overlay lub hidden panel.

---

# 101. Mobile

Layout:

```text
Topbar
Document
```

Navigation jako drawer.

Context jako oddzielny panel/drawer.

---

# 102. Mobile Topbar

Przykład:

```text
☰   BUZHULK                    ⋮
```

Drugi poziom może zawierać:

```text
View
Edit
```

Search dostępny przez ikonę.

---

# 103. Mobile navigation

Drawer:

```text
Documentation

Search

Infrastructure
Network
Applications
Procedures

Settings
```

Szerokość:

```text
~85vw
max 320px
```

---

# 104. Mobile Document

Padding:

```text
16–20 px
```

Title:

```text
26–28 px
```

Body:

```text
16 px
```

Table może scrollować poziomo.

Code block również.

---

# 105. Mobile Editor Toolbar

Nie próbować wyświetlać wszystkich funkcji naraz.

Toolbar poziomo scrollowany:

```text
B I H • 1. <> Link +
```

`+` otwiera Insert Menu.

---

# 106. Mobile Source Editor

Pełna szerokość.

Line numbers mogą być domyślnie wyłączone, aby zachować przestrzeń.

---

# 107. Animation

Standard:

```text
100–180 ms
```

dla:

- hover;
- dropdown;
- sidebar;
- dialog.

Nie używać bounce/spring animations.

Preferować:

```text
ease-out
```

---

# 108. Resizable Panels

Navigation i Context mogą być resize.

Separator:

```text
1 px border
```

Hover:

subtelne podświetlenie.

Drag area fizycznie może być większa niż widoczna linia.

---

# 109. Fullscreen Document Mode

Opcjonalna funkcja późniejsza:

```text
Focus Mode
```

ukrywa:

- navigation;
- context;
- większość topbar.

Pozostawia dokument.

Nie jest wymogiem MVP.

---

# 110. Document tabs

Nie implementować klasycznych wielu tabów jak IDE w 1.0.

Historia nawigacji i Quick Open powinny wystarczyć.

Można rozważyć później.

---

# 111. Multi-select

Nie wymagane dla MVP.

Tree działa głównie na pojedynczym dokumencie.

---

# 112. Drag & Drop Tree

Podczas drag:

pokazać line indicator.

Przykład:

```text
Applications
────────────
Home Assistant
```

Folder target:

subtelnie podświetlony.

Nie przenosić elementu natychmiast bez jasnego targetu.

---

# 113. Drag Upload

Gdy użytkownik przeciąga plik nad editor:

pokazać overlay:

```text
Drop file to attach
```

Nie zakrywać całej aplikacji agresywnym kolorem.

---

# 114. Image Paste

Po `Ctrl+V` screenshot pojawia się natychmiast w Visual Editor.

Podczas upload:

placeholder:

```text
Uploading image…
```

Po sukcesie:

render image.

---

# 115. Properties Editing

Info panel może pozwalać edytować:

```text
Title
Description
Tags
Aliases
Icon
```

Path nie jest zwykłym text input.

Zmiana path wymaga operacji Move.

---

# 116. Tags editor

Input:

```text
Tags

[server ×] [docker ×] [incus ×]  Add…
```

Autocomplete z istniejących tagów.

---

# 117. Tooltips

Tooltip pojawia się po:

```text
400–600 ms
```

Tekst krótki:

```text
Copy path
Toggle sidebar
Edit document
```

---

# 118. Buttons

## Primary

Stosować oszczędnie.

```text
Create
Save
Sign in
```

Accent background.

## Secondary

Neutral:

```text
Cancel
Move
Import
```

## Ghost

Toolbar/actions.

## Danger

Wyłącznie destructive.

---

# 119. Button sizes

Standard:

```text
height 32–34 px
```

Large:

```text
38 px
```

Nie stosować typowych 44–48 px buttonów desktopowych, jeśli nie ma potrzeby.

---

# 120. Inputs

Standard height:

```text
34–36 px
```

Border:

```text
#cbd5e1
```

Focus:

```text
accent
```

Radius:

```text
6 px
```

---

# 121. Checkbox

Minimalny natywny/techniczny wygląd.

Accent po zaznaczeniu.

Nie zwiększać sztucznie do dużych kart.

---

# 122. Dropdown

Wysokość item:

```text
32 px
```

Menu:

- white;
- border;
- shadow-popover;
- radius 6–8px.

---

# 123. Modal

Overlay:

```text
rgba(15,23,42,0.35)
```

Dialog:

```text
white
border
radius 8px
shadow
```

Nie stosować blur background jako głównego efektu.

---

# 124. Side Panels

Panele mają być rozdzielone:

```text
border-right
border-left
```

Nie przez ogromne kontrastujące powierzchnie.

---

# 125. Status Bar

Aplikacja nie wymaga pełnego status bara jak VS Code.

Można ewentualnie pokazywać w bottom edge editora:

```text
Markdown
UTF-8
Saved
```

ale nie jest to requirement 1.0.

---

# 126. UI route map

Proponowane routes:

```text
/
```

Home.

```text
/doc/:id
```

Document View.

```text
/doc/:id/edit
```

Visual Edit.

Source nie musi być osobnym route; może być stanem editor mode.

```text
/settings/*
```

Settings.

```text
/trash
```

Trash.

```text
/login
```

Login.

```text
/setup
```

First Run.

---

# 127. Browser URL

Otwarcie dokumentu powinno mieć stabilny URL bazujący na:

```text
document UUID
```

a nie samym path.

Dzięki temu rename/move nie zmienia external URL aplikacji.

---

# 128. Browser title

Format:

```text
BUZHULK — <PROJECT_NAME>
```

Home:

```text
<PROJECT_NAME>
```

---

# 129. Context menu document

```text
Open
Edit

Rename
Move
Duplicate

Copy link
Copy path

Pin

Move to trash
```

---

# 130. `...` menu w Document Header

```text
Rename
Move

Copy link
Copy path

Download Markdown

View history      future

Move to trash
```

---

# 131. Copy Link

Kopiuje link aplikacji:

```text
https://docs.example/doc/<uuid>
```

---

# 132. Copy Path

Kopiuje:

```text
Infrastructure/Servers/BUZHULK.md
```

---

# 133. Download Markdown

Pobiera fizyczny plik `.md`.

To jest ważne dla filozofii data ownership.

---

# 134. Import UI

```text
Import documentation

Markdown directory
Markdown files
HTML files

Select files
```

Po wyborze:

```text
Import preview
```

---

# 135. Import Preview

Tabela:

```text
Source                Destination          Status

BUZHULK.md            Infrastructure/...   Ready
old-note.html         Imported/...         Converted
image.png             assets/...           Ready
```

Warnings widoczne przed importem.

---

# 136. Trash

Widok tabeli/listy:

```text
Name
Original Location
Deleted
```

Actions:

```text
Restore
Delete permanently
```

---

# 137. Broken Links view

Może istnieć pod:

```text
Settings / Maintenance
```

lub jako przyszły utility view.

Tabela:

```text
Source Document
Broken Target
```

---

# 138. Main component architecture

Preferowane komponenty:

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

Dialog
Dropdown
ContextMenu
Toast

SettingsLayout
```

---

# 139. Unikać giant component

Nie tworzyć:

```text
DocumentPage.tsx
```

mającego kilka tysięcy linii.

Rozdzielać odpowiedzialności.

---

# 140. UI state management

Globalny state ograniczyć do rzeczy naprawdę globalnych:

- current session;
- sidebar state;
- theme;
- command palette;
- UI preferences.

Document content/cache najlepiej obsługiwać przez dedykowaną warstwę data fetching.

Nie budować ogromnego globalnego store bez potrzeby.

---

# 141. Server state

Preferowany model:

```text
TanStack Query
```

lub równoważna lekka warstwa.

Powinna obsługiwać:

- cache;
- loading;
- refetch;
- mutation;
- invalidation.

---

# 142. Theme implementation

Theme przez CSS variables.

Nie hardkodować kolorów typu:

```css
color: #2563eb;
```

w dziesiątkach komponentów.

Zamiast:

```css
color: var(--accent);
```

---

# 143. Branding readiness

Nie hardkodować:

- finalnej nazwy;
- finalnego logo;
- finalnego brand color.

Stosować centralne:

```text
APP_NAME
APP_LOGO
theme tokens
```

Po wykonaniu `BRAND_SPEC.md` branding ma być możliwy do podmiany w kilku miejscach.

---

# 144. Placeholder branding

Do czasu wyboru nazwy:

```text
<PROJECT_NAME>
```

UI może w development używać:

```text
Docs
```

ale nie powinno to stać się finalną nazwą produktu.

---

# 145. Desktop target

Projektować przede wszystkim dla:

```text
1440 × 900
1920 × 1080
```

ale aplikacja musi pozostawać użyteczna od:

```text
1024 px
```

szerokości.

---

# 146. Reference desktop proportions

Przy 1440 px:

```text
Topbar        52 px

Navigation    270–290 px
Context       240–270 px

Document      remaining
```

---

# 147. Reading geometry

Najważniejsza zasada:

Dokument nie powinien automatycznie rozszerzać linii tekstu na całą wolną szerokość.

Dla tekstu:

```text
~70–90 characters per line
```

jest preferowane.

---

# 148. Wide code/table behavior

Code block/table może przekroczyć standardowy reading width.

Możliwe:

```text
wide content class
```

lub horizontal scrolling.

---

# 149. Minimal chrome

Podczas scrollowania długiego dokumentu użytkownik powinien widzieć głównie:

```text
document
sidebar
TOC
```

a nie kilka warstw toolbarów.

---

# 150. Sticky behavior

Sticky:

```text
Topbar
Editor toolbar
TOC header opcjonalnie
```

Nie sticky:

```text
Document Header
```

chyba że późniejsze testy UX pokażą potrzebę.

---

# 151. View Mode reference

Docelowo użytkownik powinien mieć wrażenie:

```text
I am reading documentation
```

a nie:

```text
I am operating an application.
```

---

# 152. Edit Mode reference

Po kliknięciu Edit:

```text
I can immediately modify this document.
```

Bez:

- osobnego formularza;
- przeładowania layoutu;
- ogromnego edytora w modal window.

---

# 153. Source Mode reference

Powinien dawać wrażenie:

```text
simple technical text editor
```

a nie pełnego IDE.

---

# 154. Search reference

Powinien działać jak:

```text
VS Code Command Palette
```

pod względem szybkości użycia.

Nie kopiować wyglądu 1:1.

---

# 155. Navigation reference

Powinna działać logicznie jak:

```text
file explorer
```

ponieważ tree reprezentuje rzeczywisty filesystem.

---

# 156. Styling anti-patterns

AI nie powinno samodzielnie dodawać:

```text
glassmorphism
gradients
neon glow
huge shadows
oversized rounded cards
marketing illustrations
dashboard KPIs
animated blobs
decorative patterns
```

---

# 157. Content over decoration

Jeżeli istnieje wybór pomiędzy:

```text
ładniejszym UI
```

i:

```text
większą ilością miejsca na dokument
```

preferować dokument.

---

# 158. Density

Interfejs powinien być:

```text
compact-medium
```

Nie ekstremalnie compact jak stary desktop software.

Nie airy jak typowy SaaS marketing/productivity dashboard.

---

# 159. Visual hierarchy

Hierarchia:

```text
Document Title
↓
Document content
↓
Navigation / TOC
↓
Actions
↓
Metadata
```

Nie odwrotnie.

---

# 160. Final UI acceptance criteria

UI można uznać za zgodne ze specyfikacją, jeśli:

### Visual

- wygląda technicznie i minimalistycznie;
- dokument dominuje wizualnie;
- accent używany jest oszczędnie;
- brak zbędnych kart;
- brak marketingowej stylistyki.

### Navigation

- tree jest szybkie;
- hierarchy czytelna;
- sidebar resize działa;
- sidebar można ukryć.

### Document

- dokument dobrze się czyta;
- długość linii jest kontrolowana;
- kod i tabele wyglądają naturalnie.

### Editing

- View → Edit jest płynne;
- Visual Editor wygląda podobnie do dokumentu;
- Source jest łatwo dostępny;
- Save status jest czytelny.

### Search

- Ctrl+K działa;
- wyniki są czytelne;
- keyboard navigation działa.

### Context

- TOC;
- Info;
- Backlinks.

### Responsive

- tablet używalny;
- telefon umożliwia czytanie i edycję.

### Accessibility

- keyboard navigation;
- visible focus;
- odpowiedni contrast.

---

# 161. Zasady implementacji dla AI

Przed pracą nad frontendem przeczytaj:

```text
PROJECT_SPEC.md
UI_SPEC.md
docs/implementation-status.md
```

Nie zmieniaj kierunku UI bez jawnej decyzji użytkownika.

---

# 162. Implementacja etapami

Frontend należy budować w kolejności:

```text
1. Design tokens
2. AppShell
3. Topbar
4. Navigation Sidebar
5. Document View
6. Context Sidebar
7. Search
8. Dialogs
9. Source Editor
10. Visual Editor
11. Settings
12. Responsive
13. Dark Mode
14. Polish
```

---

# 163. Design tokens first

Przed tworzeniem większej liczby komponentów należy zbudować:

```text
colors
spacing
radius
typography
borders
shadows
```

Nie stylować każdego komponentu niezależnie.

---

# 164. UI component consistency

Jeśli istnieje komponent:

```text
Button
Input
Dialog
Dropdown
```

należy go ponownie używać.

Nie implementować lokalnych wariantów bez potrzeby.

---

# 165. Visual regression

Dla kluczowych widoków warto później utrzymywać screenshot tests:

```text
Document View
Visual Editor
Source Editor
Search Palette
Settings
Mobile Document
```

---

# 166. Główny desktop reference screen

Ekran referencyjny dla implementacji:

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Placeholder   ← →           Search documentation... Ctrl K     + New   ⚙  │
├──────────────────┬───────────────────────────────────────┬─────────────────┤
│ Documentation  + │ Infrastructure / Servers / BUZHULK   │ Contents        │
│                  │                                       │                 │
│ ▾ Infrastructure│ BUZHULK                 View Source Edit│ Overview       │
│   ▾ Servers     │                                       │ Hardware        │
│     BUZHULK     │ Main Docker and Incus host            │ Network         │
│     BUZPI00     │                                       │ Docker          │
│   ▸ Storage     │ server  docker  incus                  │ Incus           │
│                  │                                       │ Backup          │
│ ▾ Network       │ Overview                              │                 │
│   UniFi         │                                       │                 │
│   VLAN          │ Main production host for BUZLAB...    │                 │
│   DNS           │                                       │                 │
│                  │ Hardware                              │                 │
│ ▾ Applications  │                                       │                 │
│   Home Assistant│ ┌─────────────┬────────────────────┐  │                 │
│   Vaultwarden   │ │ CPU         │ Intel N100         │  │                 │
│                  │ │ Network     │ Intel I226-V       │  │                 │
│ ▸ Procedures    │ └─────────────┴────────────────────┘  │                 │
│                  │                                       │                 │
│                  │ Docker                                │                 │
│                  │                                       │                 │
│                  │ ```yaml                               │                 │
│                  │ services:                             │                 │
│                  │   ...                                 │                 │
│                  │ ```                                   │                 │
│                  │                                       │                 │
└──────────────────┴───────────────────────────────────────┴─────────────────┘
```

To jest podstawowy visual target aplikacji.

---

# 167. Najważniejsza zasada UI

Aplikacja nie powinna wyglądać efektownie przez pierwsze pięć minut.

Powinna wyglądać dobrze również po:

```text
2 godzinach pisania
4 godzinach czytania
1000 dokumentach
kilku latach użytkowania
```

Dlatego priorytetem są:

```text
clarity
consistency
density
readability
predictability
```

a nie wizualne efekty.

---

# 168. Final design statement

`<PROJECT_NAME>` korzysta z technicznego, minimalistycznego języka wizualnego skoncentrowanego na dokumentacji.

UI jest neutralne.

Dokument jest głównym elementem.

Navigation odzwierciedla filesystem.

Edycja odbywa się bez opuszczania dokumentu.

Search jest natychmiastowy.

Zaawansowane funkcje są dostępne, ale nie dominują ekranu.

Produkt powinien wyglądać jak profesjonalne narzędzie stworzone dla osoby technicznej, a nie jak generyczna aplikacja SaaS.
