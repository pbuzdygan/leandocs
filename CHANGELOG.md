# Changelog

What changes for you in each LeanDocs version. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions use [Semantic Versioning](https://semver.org/). Entries are written for users. Rules for contributors are in `AGENTS.md` §8.

## [Unreleased]

### New features

- Nothing yet.

### Improvements

- Nothing yet.

### Bug fixes

- Nothing yet.

## [0.1.0]

The first stable release of LeanDocs. Earlier `dev` previews led up to it; their changes are included here.

### New features

**Your files stay yours**

- **Works with your existing Markdown folder.** Put `.md` files and folders into the documentation folder and they appear in LeanDocs with the same structure. Nothing has to be imported, and new documents are saved as ordinary Markdown files with readable names (for example `Home Assistant.md`), so you can always open them in any other editor.
- **Permanent document IDs.** Every document gets an ID, so links and bookmarks keep working after you rename or move it. LeanDocs adds the ID only to files that do not have one and changes nothing else in the file.
- **Changes made elsewhere appear by themselves.** When a file is changed in another program, a sync tool or another tab, LeanDocs shows the new version. If you are editing it at that moment, your text is kept so you can compare, reload or save your work as a copy.

**Reading**

- **Fully formatted documents:** headings, tables, lists, checklists, quotes, links and images.
- **Code blocks** show their language, are coloured for easier reading and have a **Copy** button.
- **Callouts** (`:::note`, `:::info`, `:::tip`, `:::warning`, `:::danger`) appear as clear coloured notes.
- **Diagrams:** Mermaid flowcharts and other diagrams written as text are drawn as pictures. A diagram with a mistake shows an error and its source instead of breaking the page.
- **Links between documents:** write `[[BUZHULK]]` or `[[BUZHULK#Hardware]]` to link to a document or one of its sections, also through its aliases. Links to documents that do not exist are greyed out with a dashed underline.
- **Side panel** with three tabs: **Contents** lists the sections, highlights where you are and jumps to a section with one click. **Links** shows which documents refer to this one and where it links to. **Info** shows the location and dates and lets you change the title, description, tags and aliases.
- **Source** shows the original Markdown with subtle colouring.
- **Full-width documents** by default. A button next to the document's `…` menu switches to a narrower reading width, and LeanDocs remembers your choice.
- **Dark mode.** In Settings › Appearance choose Light, Dark or System. System follows your device and switches with it; the choice applies at once, including to diagrams and the sign-in page.

**Writing and editing**

- **Visual editor.** Write and format the way the document will look, with a formatting toolbar and a `/` menu for headings, lists, checklists, tables, code blocks, callouts, links, images, attachments and dividers. Special Markdown and HTML blocks stay intact; change them in Source.
- **Source editor** for editing Markdown directly, with search and replace and keyboard shortcuts. Switch between Visual and Source at any time.
- **Saving.** Changes save automatically, or with Save, Ctrl+S (⌘S) or Done. Unsaved changes are kept in the browser and offered again when you reopen the document. If someone else changed the file in the meantime, LeanDocs stops and lets you compare, reload or save your version as a copy instead of overwriting theirs.
- **Tables** can grow and shrink from the toolbar: add rows and columns, or delete a row, a column or the whole table.
- **Code blocks** have a language (Bash, YAML, JSON, PowerShell, Python, Dockerfile, Nginx and other common formats) and are coloured while you write. Press Enter twice at the end of a block, or the down arrow on its last line, to leave it.
- **Link to another document while you type:** type `[[` in either editor and pick a document from the list.
- **Attachments.** Attach files, paste screenshots or drag files into either editor. Images appear in the document, and the Attachments list lets you open, download or delete files. They are stored as normal files next to the document and move with it.
- **Templates.** Start a new document from Server, Application, Procedure, Network Device or Incident to get the right sections and tags. Templates are ordinary Markdown files in the `_templates` folder, so you can change them or add your own.

**Organising**

- **Navigation tree** with your folders and documents. Create, rename and move documents and folders (with a folder picker or by dragging), from the tree, the right-click menu or the document's `…` menu. The tree works fully with the keyboard: arrow keys, Enter to open, F2 to rename, Delete to move to the trash.
- **Renaming or moving keeps your links working.** LeanDocs updates the links in other documents and in the moved documents, and changes nothing else in those files. Attached images and files move with their document.
- **Trash.** Deleted documents and folders go to the trash first. Click **Undo** in the confirmation message, or open **Trash** at the bottom of the navigation to put an item back where it was, even if its folder was deleted in the meantime. Deleting permanently and emptying the trash always ask first.
- **Tags.** Add and remove tags with suggestions from the tags you already use. Click a tag to see every document with that tag.
- **Pinned documents** appear at the top of the navigation and on the start page. Pinning never changes the file.
- **Start page** with quick actions and your recently updated documents.
- **Copy link**, **Copy path** and **Download Markdown** give you a stable link to a document, its location in the folder, or the original `.md` file.
- **Hide the navigation** on tablets and computers with the menu button at the top left, to give the document more room.

**Finding**

- **Search everything** with Ctrl+K (⌘K) or the search field at the top. Results show where the words appear, highlighted. Titles come first, then aliases, tags, headings and text. Narrow a search with `tag:docker`, `path:Infrastructure` or `title:BUZHULK`, and use quotes for an exact phrase. Accents are ignored: "zrodlo" finds "Źródło".
- **Open any document by name** with Ctrl+P (⌘P). A few letters are enough: `bzh` finds "BUZHULK".
- **Back and Forward** buttons in the top bar move between the pages you opened, together with the browser's own Back and Forward.
- **Broken links overview.** Settings › Broken links lists every link that points to a document that does not exist.

**Importing**

- **Import Markdown** folders or single files from the start page. A preview shows where each file will go and what to check. Existing documents are never overwritten. Pictures and files your notes use come along as attachments and their links are updated. Obsidian vaults work too, including images embedded with `![[…]]`.
- **Import HTML pages.** Notes saved as HTML are converted to Markdown; the preview lists anything that cannot be carried over, such as scripts, embedded videos or coloured text.

**Settings**

- **General and Editor:** choose which editor opens first (Visual or Source), turn autosave off or change its delay, set line numbers, word wrap and tab size for the source editor, pick the folder new documents go to, and have LeanDocs reopen the document you viewed last. Settings are stored with your data, so they apply in every browser and are part of your backups.
- **Storage and Index** show where your documentation is stored, how much space it uses and any problems found in your files, such as two files with the same ID. Both let you rebuild the search index, which never changes your files.
- **About** shows the LeanDocs version you are running, with links to the documentation and source code, and tells you when a browser tab still runs an older version after an update.

**Sign-in and security**

- **First run** guides you through creating the administrator account and shows where your documentation is stored.
- **Sign in and out** with your administrator account. Change your password in Settings › Security: you confirm it with the current one, other browsers and devices are signed out, and you stay signed in.
- **Two-factor sign-in** with an authenticator app and single-use recovery codes, from Settings › Security.
- **Sign-in gateway.** Let an existing authentication gateway in front of LeanDocs grant access instead of the built-in sign-in.
- **No sign-in** for a private installation, if you choose to. Settings warns clearly that anyone who can reach LeanDocs can then read, edit and delete documents.

**Phones and tablets**

- On phones the navigation opens as a slide-in panel, and you can read and edit documents.
- On tablets and smaller laptop screens, a button in the document header opens the Contents, Links and Info panel.

**Running LeanDocs**

- **One Docker container** with a built-in health check. No database server or other services are needed.
- **Ready-made images** for regular PCs and servers as well as ARM machines such as the Raspberry Pi. Use `latest` or a version such as `0.1.0` for stable releases; `dev_latest` gives you a preview of the next version and never replaces a stable release.
- **Restricted by default.** The Docker Compose setup runs LeanDocs with the least access it needs: the container cannot change its own files or gain extra rights and only writes to your data folder. You can choose the address and port it listens on.

### Improvements

- **Fast with large libraries.** Tested with 10,000 documents: starting again only reads files that changed, saving stays quick, changes made outside the app are picked up without rescanning everything, and renaming a document that many others link to stays fast. Searching is instant even when one long document contains the search word thousands of times.
- **The app opens quickly.** The parts needed for documents and diagrams load only when you open one, and the Docker image is small (about 250 MB) and contains only what LeanDocs needs.
- **Large or unusual documents stay safe and fast.** Very long documents and documents with many nested quotes or lists open, save and import quickly. A document too complex to display safely is shown as plain text with an explanation; it can still be searched and edited as Markdown source.
- **Your files are protected.** A save can never leave a half-written document behind. LeanDocs changes only what you edited, keeping your formatting, comments and extra header fields. Moving, renaming or restoring never replaces an existing document with the same name. Documents with a broken header or a duplicated ID are shown and never modified, and file names that would not work on Windows or could reach outside the documentation folder are cleaned up or rejected.
- **Safe to view anything.** Scripts and other unsafe content inside documents are never run, so HTML pasted from the internet is safe to view. Browser protections block injected scripts and embedding LeanDocs in other websites, and changes can only come from LeanDocs itself, even with sign-in turned off.
- **Stronger sign-in protection.** Passwords are stored with a modern, slow-to-guess method, and repeated sign-in attempts are limited even when they come from different addresses, with a clear wait time. The sign-in form clears your password after each attempt.
- **Accessible.** LeanDocs works with the keyboard, screen readers and low vision, in light and dark mode: readable contrast, a clearly visible keyboard focus, dialogs that return you to where you were, checkboxes and form errors that are read aloud, and a tab title for every page.
- **Clear messages when something is wrong.** If LeanDocs cannot write its own data files, for example after restoring a backup with the wrong owner, it says which files are affected and how to fix it. Damaged account data stops startup instead of reopening account setup. A large first start is not reported as unhealthy by Docker while LeanDocs reads all documents.
- **Comfortable editing.** Save, Done and the Visual/Source switch stay visible while you scroll, and so does the formatting toolbar. The visual editor looks like the finished document. A document's title is not shown twice when the file starts with the same heading.
- **Remembers your layout:** expanded folders, the width of the navigation and whether it is hidden.

### Bug fixes

These were fixed after the `dev` previews.

- Links like `[[Server]]` typed in the visual editor are saved as links, and paragraphs that contain a link can be edited visually.
- Callouts can be written and edited in the visual editor, and their type can be changed. Before, typing into a selected callout deleted it.
- The `/` menu and the formatting bubble open where you are typing. In long documents they used to appear at the top of the editor, partly cut off.
- Opening the visual editor no longer interrupts a menu or dialog opened while it was loading.
- Escape closes the editor's search before it leaves editing, and reloading after a conflict shows the version on disk straight away.
- Renaming a document keeps its own image and attachment links working.
- Attachments copied into a document's folder outside LeanDocs can be opened and deleted, also when their names use capital letters in the extension (`Photo.PNG`), accents written by a Mac or characters such as `:`.
- Documents with very deeply nested quotes or lists, or with a header that repeats references a very large number of times, no longer disappear from the library.
- Documents saved in an older text encoding (for example by old Windows editors) are no longer damaged. They are shown read-only with an explanation, and Settings › Index lists them so you can convert them.
- A folder LeanDocs may not read no longer empties the whole library, and names with unreadable characters no longer vanish without a trace. Settings › Index lists both.
- Importing an HTML page that is too complex to convert no longer makes the whole import fail. That page is skipped and the preview says why.
- Templates, document reads and restores from the trash refuse links in the file system that point outside the documentation folder.
