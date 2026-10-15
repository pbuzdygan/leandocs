# Project README guideline

Use this guideline when creating or restructuring a project's root `README.md`. Keep the README as the project's front page and documentation entry point, with detailed information available through links. Apply it in the project's documentation language and preserve established conventions.

This file guides documentation work; it is not the project's README and should not be linked as end-user documentation. Installing the instruction kit does not replace or restructure an existing README automatically.

## Recommended structure

Keep the following order across projects. Omit sections that do not apply.

1. **Project name and identity** — title, optional logo or banner, and one or two sentences explaining what the project does and who it serves.
2. **Key features** — one concise list, preferably 4–8 points describing user benefits. Avoid repeating the same list elsewhere.
3. **Preview** — one representative screenshot or a compact pair, optionally a demo link. Link to a separate gallery for additional views.
4. **Quick start** — the simplest supported way to get a working instance, with prerequisites, essential configuration, commands, and the expected access URL or result. Link to full installation instructions for alternatives.
5. **Documentation** — a compact index of topic-specific files, with one short description per link.
6. **Project links** — license, contribution guide, issue reporting, and optional support or donation links, where available.

The README should let a new reader answer: What is this? What can I do with it? What does it look like? How do I start? Where do I find details?

## What stays in README and what moves out

| Topic              | Keep in README                                  | Move to linked documentation                                               |
| ------------------ | ----------------------------------------------- | -------------------------------------------------------------------------- |
| Product overview   | Purpose and main capabilities                   | Detailed workflows, feature descriptions, keyboard shortcuts               |
| Screenshots        | One image or a compact pair                     | Full gallery, themes, screen-by-screen examples                            |
| Installation       | One minimal, supported quick start              | Alternative installation methods, upgrades, troubleshooting                |
| Configuration      | Settings required for the quick start           | Full variable reference, defaults, optional settings, examples             |
| Data import/export | A feature bullet and documentation link         | Templates, supported fields, limits, validation and overwrite behavior     |
| Deployment         | Prerequisites and critical startup requirements | Proxy setup, permissions, storage, backups and operational troubleshooting |
| Security           | Essential precautions needed to start safely    | Security model, hardening, reporting process, assessment details           |
| Testing            | Link to the testing guide                       | Commands, fixtures, test scope and failure diagnosis                       |
| Architecture       | A short description only if useful to readers   | Components, contracts, data model and design decisions                     |
| Release history    | Link to the changelog or releases               | Version-by-version changes and technical release notes                     |

Do not remove information merely to shorten the README. Move it to the appropriate document and replace it with a descriptive link. Keep warnings about data loss, required secrets, or unsafe defaults beside the quick-start step they affect; they must not become discoverable only after following a link.

## Documentation layout

Use existing documentation names and conventions when available. For a project without an established layout, the following is a starting point, not a requirement to create every file:

```text
README.md
docs/
  INSTALLATION.md
  CONFIGURATION.md
  USER_GUIDE.md
  SCREENSHOTS.md
  TESTING.md
  SECURITY.md
  ARCHITECTURE.md
  CONTRIBUTING.md
CHANGELOG.md
LICENSE
```

Create only documents that have useful content. Small related topics can share one file; large independent topics can have their own files. Preserve established root-level files such as `CONTRIBUTING.md` or `SECURITY.md` when the project already uses them.

## Rules for consistent simplification

- Prefer short paragraphs, concise lists, and descriptive relative links.
- Keep one source of truth for each detailed topic. Link to it instead of copying its content into multiple places.
- Keep only the primary installation path in the README. Its example must remain complete enough to use safely.
- Choose screenshots that explain the product; put the full gallery in a separate document.
- Group documentation links in one index instead of adding many sections that contain only a link.
- Avoid implementation details, test results, audit findings, and long troubleshooting lists on the front page.
- Link directly to a relevant heading when it helps the reader. Update anchors when headings change.
- Follow the project's documentation language and naming conventions.
- Aim for a few minutes of reading. Treat length as a guideline, not a reason to remove essential information.

## Copyable request for another project

> Simplify the root README.md so it serves as a concise project overview and documentation entry point. Use this order where applicable: project name and short description, one key-feature list, a compact preview, one safe and complete quick start, a documentation index, and optional project/support links. Move detailed configuration, installation alternatives, workflows, screenshots, testing, security, architecture, deployment notes, troubleshooting, and release history into appropriate linked documents. Reuse existing documents and conventions before creating new files. Preserve all useful information, keep critical startup and data-safety warnings beside the relevant quick-start steps, and remove duplicated descriptions. Use descriptive relative links and verify their targets and anchors after moving content. Do not change application behavior or invent unsupported installation steps. The result should let readers understand the project and start using it quickly, with details available when needed.

## README skeleton

The following is an outline, not a ready-to-run installation guide. Replace bracketed text with verified project information and include links only to documents that actually exist.

```markdown
# [Project name]

[Optional logo or banner]

[One or two sentences: purpose and intended users.]

## Features

- [Main capability]
- [Main capability]
- [Main capability]

## Preview

[Representative screenshot and optional demo/gallery link]

## Quick start

[Prerequisites and essential safety or data-persistence notes]

[Minimal verified configuration and commands]

[Expected result or access URL; link to full installation guide]

## Documentation

- [Configuration](docs/CONFIGURATION.md) — settings and defaults.
- [User guide](docs/USER_GUIDE.md) — workflows and detailed usage.
- [Testing](docs/TESTING.md) — verification commands and test scope.
- [Security](docs/SECURITY.md) — security guidance and requirements.
- [Architecture](docs/ARCHITECTURE.md) — components and design.

## Project links

[Existing license, contribution, issue-reporting and optional support links]
```

## Completion check

- A new reader can understand the purpose, see the product, and find the primary startup path without reading detailed documentation.
- Moved information remains available, with no accidental omissions or conflicting copies.
- Documentation links point to existing files and valid headings.
- Quick-start commands, requirements, and essential warnings are preserved and accurate.
- Example placeholders are replaced in the actual project README; in this guideline they are intentional.
- Review the final Markdown and run `git diff --check`; check newly created files separately when they are still untracked.
