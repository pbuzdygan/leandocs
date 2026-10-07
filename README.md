<picture>
  <source media="(prefers-color-scheme: dark)" srcset="branding/banners/readme-dark.svg">
  <img alt="LeanDocs — Documentation without the bloat." src="branding/banners/readme-light.svg">
</picture>

# LeanDocs

**Documentation without the bloat.**

LeanDocs is a lightweight, self-hosted documentation manager for technical people: homelabs, servers, networks, applications, runbooks.

- **Your files stay yours.** Every document is a plain Markdown file in a plain folder. Delete the app and your documentation is still there.
- **WYSIWYG when you want it, Markdown when you need it.** View → Edit → Visual / Source, all on the same `.md` file.
- **Fast search.** SQLite FTS5 index, rebuildable from the files at any time.
- **One container.** No Postgres, no Redis, no telemetry.

> **Status:** development previews (`dev0.1.x`) are published; the first stable release (1.0) is being prepared. See [`CHANGELOG.md`](CHANGELOG.md) for what is new.

## Features

- Folders and documents with a trash, drag and drop, pins, tags and templates.
- Rendered Markdown with tables, code highlighting, callouts, Mermaid diagrams and a table of contents.
- `[[Wiki links]]` and relative links with backlinks and a broken-link report. Links are updated when documents move.
- Attachments: upload, paste or drop screenshots and files; stored next to the document.
- Full-text search with filters (`tag:`, `path:`, `title:`) and quick open.
- Changes made in other editors, `git pull` or scripts appear within about a second; editing conflicts are detected.
- Import of Markdown folders, Obsidian vaults and HTML pages.
- One administrator account with an optional authenticator app, or sign-in through an authentication gateway.

## Documentation

| Document                                                         | Purpose                                                     |
| ---------------------------------------------------------------- | ----------------------------------------------------------- |
| [`docs/deployment.md`](docs/deployment.md)                       | Install, HTTPS reverse proxies, updates, backup and restore |
| [`docs/configuration.md`](docs/configuration.md)                 | Every setting, storage layout, HTTPS and sign-in modes      |
| [`docs/import.md`](docs/import.md)                               | Bringing existing Markdown, Obsidian or HTML notes in       |
| [`docs/markdown.md`](docs/markdown.md)                           | Supported Markdown syntax                                   |
| [`docs/attachments.md`](docs/attachments.md)                     | Pictures and files in documents                             |
| [`CHANGELOG.md`](CHANGELOG.md)                                   | What changed in each version                                |
| [`SECURITY.md`](SECURITY.md)                                     | Reporting vulnerabilities, security reviews                 |
| [`PROJECT_SPEC.md`](PROJECT_SPEC.md)                             | Product and architecture specification (what LeanDocs does) |
| [`UI_SPEC.md`](UI_SPEC.md)                                       | UI specification (how it looks and behaves)                 |
| [`AGENTS.md`](AGENTS.md), [`CONTRIBUTING.md`](CONTRIBUTING.md)   | Rules and workflow for AI coding agents and contributors    |
| [`docs/implementation-status.md`](docs/implementation-status.md) | Current phase, task board, work log                         |
| [`docs/development.md`](docs/development.md)                     | Local development, tests and releases                       |
| [`docs/architecture.md`](docs/architecture.md)                   | How the code is organised                                   |
| [`docs/adr/`](docs/adr/)                                         | Architecture decision records                               |

## Try it

```bash
mkdir -p data/content && cp -r examples/demo-content/. data/content/   # optional demo docs
docker compose -f compose_local_build.yaml up --build -d               # http://localhost:8080
```

`compose_local_build.yaml` builds the image from this repository. `compose.yaml` runs the published image (`ghcr.io/pbuzdygan/leandocs`); for a server installation follow [`docs/deployment.md`](docs/deployment.md).

For development with hot reload: `corepack enable && pnpm install && pnpm dev` (http://localhost:5173). Details are in [`docs/development.md`](docs/development.md).

## License

To be decided (see open questions in the status file).
