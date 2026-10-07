# Changelog

What changes for you in each LeanDocs version. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions use [Semantic Versioning](https://semver.org/). Entries are written for users. Rules for contributors are in `AGENTS.md` §8.

## [Unreleased]

### New features

- **Ready-made Docker images.** Each release is published as an image you can pull, for regular PCs and servers as well as ARM machines like the Raspberry Pi. Use `latest` or a version number such as `1.0.0` for stable releases; `dev_latest` gives you a preview of the next version and never replaces a stable release.
- **About page.** Settings › About shows which LeanDocs version you are running, with links to the documentation and source code. After an update it tells you when a browser tab still has the old version and needs a reload.
- **Import HTML pages.** Old notes saved as HTML can be imported too. They are converted to Markdown, and the preview lists anything that could not be carried over, such as scripts, embedded videos or coloured text, before you import.
- **Import Markdown.** Bring an existing folder of Markdown notes, or individual Markdown files, into your documentation from the start page. A preview shows where each file will go and lists anything to check before you import. Folders and file contents are kept, and existing documents are never overwritten. Pictures and files your notes link to come along as attachments of the documents that use them, and the links are updated. Files no document uses are listed but left out. Obsidian vaults work the same way: pictures and files embedded with Obsidian's `![[…]]` syntax are imported too and turned into standard Markdown.

- Documents refresh automatically when their files change elsewhere. While editing, your text is preserved so you can review the other version, reload it or save your work as a copy.

- Protect local sign-in with an authenticator app and single-use recovery codes from Settings › Security.

- You can deliberately disable login for a private installation; Settings clearly warns that anyone with access can read, edit and delete documents.

- You can use an external authentication gateway to grant access to your single authorized account without a separate application login.

- Sign in with your administrator account to access documentation, and sign out through the user menu.

- First run now guides you through creating an administrator account and shows where your Markdown documentation is stored.
- **Templates.** Choose Server, Application, Procedure, Network Device or Incident when you create a document, and it starts with the right sections and tags. Templates are ordinary Markdown files in the `_templates` folder, so you can change them or add your own.
- **Info panel.** The new Info tab shows a document's location and dates and lets you change its title, description, tags and aliases.
- **Tags.** Add and remove tags with suggestions from tags you already use. Click a tag on a document to see every document with that tag.
- **Pinned documents.** Pin the documents you use most. They appear at the top of the navigation and on the start page, and pinning never changes the file.

- **Backlinks.** The new Links tab next to Contents shows which documents refer to the one you are reading, and where it links to. Links to missing documents are marked.
- **Link to another document while you type.** Type `[[` in either editor and pick a document from the list. Links also work through a document's aliases.
- **Broken links overview.** Settings › Broken links lists every link that points to a document that does not exist.

- **Tables can grow and shrink.** With the cursor in a table, add rows above or below, add columns left or right, or delete a row, a column or the whole table. New tables start with three columns.
- **Code blocks have a language.** Pick Bash, YAML, JSON, PowerShell, Python, Dockerfile, Nginx and other common formats, and the code is coloured while you write.
- **Full-width documents.** Documents now use all the space between the side panels. The button next to the document's `…` menu switches back to a narrower reading width, and LeanDocs remembers your choice.

- **Search your whole documentation** with Ctrl+K (⌘K on a Mac) or the search field at the top. Results show where the words appear, with the matching words highlighted. Titles come first, then aliases, tags, headings and text. Narrow a search with `tag:docker`, `path:Infrastructure` or `title:BUZHULK`, and put words in quotes to find an exact phrase.
- **Open any document by name** with Ctrl+P (⌘P). A few letters are enough, for example `bzh` finds "BUZHULK".
- Searching ignores Polish and other accents: "zrodlo" finds "Źródło".
- **Settings › Storage** shows where your documentation is stored and how much space it uses. **Settings › Index** lists problems found in your files, for example two files with the same ID. Both pages let you rebuild the search index, and that never changes your files.

- You can attach files, paste screenshots and drag files into either editor. Images appear in your document, and the Attachments list lets you open, download or delete files.

- You can write and format documents visually, then switch to Markdown whenever you need it. The formatting toolbar and “/” menu help you add headings, lists, checklists, tables, links and images.
- Special Markdown and HTML blocks stay intact when you edit surrounding text visually; switch to Source to change those blocks.

- You can edit Markdown directly in LeanDocs, with automatic saving, a Save button, search and replace, and keyboard shortcuts. New documents open ready to write.
- Unsaved changes can be restored from a local draft when you reopen a document. If another editor changes the file, you can review the differences, reload it, or save your version as a copy.

- **LeanDocs has its own logo.** The new logo appears in the app header, as the browser tab icon and as the icon when you add LeanDocs to your phone's or computer's home screen.
- **Documents are now displayed fully formatted:** headings, tables, lists, checklists, quotes, links and images.
- **Code blocks** show the language and have a **Copy** button. Code is coloured for easier reading.
- **Callouts** (`:::note`, `:::info`, `:::tip`, `:::warning`, `:::danger`) appear as clear coloured notes.
- **Diagrams:** Mermaid flowcharts and other diagrams written as text are drawn as pictures. A diagram with a mistake shows an error and its source instead of breaking the page.
- **Links between documents:** write `[[BUZHULK]]` or `[[BUZHULK#Hardware]]` to link to another document or one of its sections. Links to documents that do not exist are shown greyed out with a dashed underline.
- **Contents panel:** the list of sections on the right highlights where you are and jumps to a section with one click.
- **Source** shows the original Markdown of the document with subtle colouring.
- **LeanDocs now runs in your browser.** You get a clean, technical layout with your documentation tree on the left and the document in the middle. Documents open by clicking, or with the keyboard.
- You can create documents and folders, rename them, move them (through a folder picker or by dragging them onto a folder) and move them to the trash, all from the tree or from the document's `…` menu. Right-clicking an item shows the same actions.
- If you move something to the trash by mistake, click **Undo** in the confirmation message.
- The start page shows quick actions and your recently updated documents.
- **Copy link**, **Copy path** and **Download Markdown** give you a stable link to a document, its location in the folder, or the original `.md` file.
- The navigation tree works fully with the keyboard: arrow keys, Enter to open, F2 to rename, Delete to move to the trash.
- On phones the navigation opens as a slide-in panel.
- LeanDocs works with your existing Markdown folder. Put `.md` files and folders into the documentation folder and they appear in LeanDocs with the same structure. Nothing has to be imported.
- New documents are saved as ordinary Markdown files with readable names (e.g. `Home Assistant.md`), so you can always open them in any editor.
- Every document gets a permanent ID. Later, links and bookmarks will keep working even after you rename or move the document. LeanDocs adds the ID only to files that do not have one, and it changes nothing else in the file.
- You can rename and move documents and folders. Attached images and files move with their document automatically.
- Deleted documents and folders go to a trash first, so you can restore them. They come back to their original place even if that folder was deleted in the meantime. Only emptying the trash deletes for good.
- LeanDocs runs as a single Docker container with a built-in health check. No database server or other services are needed.

### Improvements

- The Docker Compose setup runs LeanDocs with the least access it needs: the container cannot change its own files or gain extra rights, and it only writes to your data folder. You can also choose which host address and port it listens on.

- The Docker image is much smaller (about 250 MB instead of 425 MB), so it downloads and updates faster. It also contains only what LeanDocs needs to run, with no shell or package manager, which leaves less to attack. Existing data folders keep working without changes.

- Changes made outside the app are indexed without rescanning every documentation folder, keeping browsing responsive in large collections.

- Repeated sign-in attempts are now limited even when they come from different addresses, with a clear wait time before retrying. The form clears your password after each submission.

- Browser protections now block injected scripts and embedding the app in other pages, while keeping diagrams, editing and attachments working.

- Document changes and uploads now reject requests triggered by other websites, including when login is disabled.

- Administrator passwords now use Argon2id; existing accounts keep working and upgrade their password protection when they sign in.

- LeanDocs uses a new, clearer icon set throughout the app.
- Renaming or moving a document or a folder keeps your links working. LeanDocs updates the links in other documents and in the moved documents themselves, and changes nothing else in those files.
- Save, Done and the Visual/Source switch stay visible at the top while you scroll through a long document, and so does the formatting toolbar.
- To leave a code block, press Enter twice at its end, or press the down arrow on its last line.
- The Contents panel now lists top-level headings too, and indents each heading under the one it belongs to.
- LeanDocs starts faster with large documentation folders: after a restart it only reads files that changed.
- The first page of LeanDocs loads faster: the parts needed to display documents and diagrams are loaded only when you open one.
- A document's title is no longer shown twice when the file starts with the same heading.
- LeanDocs remembers which folders you expanded and how wide you made the navigation panel.
- Links to documents keep working after you rename or move them, because they use the document's permanent ID.
- Saving can never leave a half-written document behind, even if the server stops in the middle of a save.
- When LeanDocs saves a document, it changes only what you edited. Your formatting, comments and extra fields in the document header stay exactly as they were.
- Your changes are never lost to another editor. If a document was changed elsewhere since you opened it (another tab, VS Code, a sync), LeanDocs stops and tells you instead of overwriting the other version.
- Moving, renaming or restoring never replaces an existing document or folder with the same name. You get a clear message instead.
- Scripts and other unsafe content inside documents are never executed, so pasting HTML from the internet into a document is safe to view.
- Documents with a broken header or a duplicated ID are still shown and are never modified. LeanDocs reports the problem instead of failing.
- File and folder names that could reach outside your documentation folder, or that would not work on Windows, are rejected or cleaned up automatically.

### Bug fixes

- Damaged application data now stops startup instead of reopening account setup and removing sign-in protection.
- Templates, document reads and trash restores reject symbolic links that could reach outside the documentation folder.

- Links like `[[Server]]` typed in the visual editor are now saved as links. Before, they were saved as plain text, and paragraphs that contained a link could not be edited visually.
- Callouts (Note, Info, Tip, Warning, Danger) can now be written and edited in the visual editor. Before, typing into a selected callout deleted it. You can also change a callout's type.
- The “/” menu and the formatting bubble now open where you are typing. In long documents they used to appear at the top of the editor, partly cut off.
- Opening the visual editor no longer interrupts a menu or dialog you opened while it was loading.

- Renaming a document keeps its own Markdown image and attachment links working.

- Escape closes the editor’s search before leaving editing, and reloading a conflict immediately shows the disk version when you return to reading.
