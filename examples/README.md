# Examples

`demo-content/` is a small sample documentation folder (a homelab like the one LeanDocs was designed for). It is used for previews and screenshots, and it shows the supported Markdown features: tables, code, Mermaid, callouts, wiki links and task lists.

To try it, copy it into an **empty** data directory:

```bash
mkdir -p data/content && cp -r examples/demo-content/. data/content/
```

On first start LeanDocs adds an `id` (and missing `title`/`created`/`updated`) to the front matter of each copied file. Nothing else in the files changes.
