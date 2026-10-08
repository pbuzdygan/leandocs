# Importing documentation

LeanDocs reads plain Markdown files from its content folder, so there are two ways to bring existing documentation in.

## Option 1: copy the files

Copy your Markdown folder into `data/content/` (see [deployment.md](deployment.md)). LeanDocs picks the files up with their folder structure, even while it runs. Nothing is converted. The first time LeanDocs sees a file without a document id, it adds `id`, `title`, `created` and `updated` lines to the file's front matter and changes nothing else (turn this off with `ASSIGN_MISSING_IDS=false`, see [configuration.md](configuration.md)).

Use this for large libraries and when you can reach the server's files. Pictures and other files stay where they are; links to them keep working as long as they point inside `data/content/`.

## Option 2: Import in the browser

Choose **Import** on the start page (Quick actions) or in an empty library. Pick what to import:

| Source             | What it takes                                                                     |
| ------------------ | --------------------------------------------------------------------------------- |
| Markdown directory | A folder with its subfolders. The folder structure is kept.                       |
| Markdown files     | One or more `.md` files, placed side by side.                                     |
| HTML files         | `.html`/`.htm` pages, converted to Markdown. See [HTML pages](#html-pages) below. |

Choose the folder to **Import into**, then select the files. LeanDocs first shows a **preview**: where each file will go, what will change in it and anything you should check. Nothing is written until you choose **Import**. A single imported document opens afterwards; for more, the navigation shows the first one.

### What happens to your files

- **Content is kept.** Markdown files are copied byte for byte, except for the front matter lines described next and links to attachments.
- **Document ids.** Files without an id get `id`, `title`, `created` and `updated` in their front matter. A file whose id is already used in the library or elsewhere in the import gets a new id. A file with invalid front matter is imported unchanged with a temporary id; fix the front matter to give it a permanent one.
- **Nothing is overwritten.** If a document with the same name exists, the new one is imported as `Name (2).md`. Names that are not safe on every system are adjusted, and the preview says so.
- **Attachments.** Pictures and files that your notes link to come along, as long as they are in the selection. Each one is copied into the attachments folder of the document that uses it, and the link is updated. The [attachment rules](attachments.md) apply: supported types and the size limit. A file that cannot be attached keeps its original link, and the preview warns about it. Files that no document uses are listed but not imported.
- **Links between documents.** `[[Wiki links]]` and relative links between imported files keep working, also when a file was renamed during the import.
- **Left out:** hidden files and folders (such as `.git/` or `.obsidian/`), existing `*.assets` folders, Markdown files larger than 10 MiB and files that are not UTF-8 text. Top-level folders starting with `_` are reserved; import them into a folder instead.

### Obsidian vaults

Import a vault as a **Markdown directory**. Files embedded or linked with Obsidian's syntax (`![[diagram.png]]`, `[[manual.pdf]]`) are found by name, copied as attachments and turned into standard Markdown links, so they also work in other editors. Notes embedded in other notes (`![[Other note]]`) become ordinary links, because LeanDocs does not show one note inside another. Image sizes (`![[photo.png|300]]`) are dropped. Obsidian callouts (`> [!note]`) are left as written and show as quotes.

### HTML pages

HTML pages, for example notes exported from another tool, become Markdown files in the same place. The page title becomes the document title. Links between imported HTML pages point to the converted files. Anything Markdown cannot hold is removed and listed in the preview before you import, such as scripts, embedded videos, forms, colours and fonts, merged table cells and pictures stored inside the HTML. A page too complex to convert is skipped, and the preview says why.

### Limits

One import takes up to 10,000 files and 256 MiB. Import larger libraries folder by folder, or copy the files (option 1). Behind a reverse proxy, its upload limit must allow the request size (Nginx: `client_max_body_size`, see [deployment.md](deployment.md)).

For developers: the import pipeline is described in [architecture.md](architecture.md#import-phase-13-import) and [ADR-0022](adr/0022-import-pipeline.md).
