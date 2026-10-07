# Attachments

While editing, choose **Attach files**, paste a screenshot, or drop files onto the editor. Both Visual and Source insert normal Markdown links. Files live beside the document in its `<name>.assets/` directory. The navigation tree hides these directories.

Supported files: PNG, JPEG, WebP, SVG, PDF, TXT, YAML, JSON and ZIP. The default limit is 50 MiB per file. Set `MAX_UPLOAD_SIZE` to a positive integer number of bytes (up to 1 GiB) and restart the server to change it. Names are normalized safely, and an existing file is never overwritten. Invalid names, unsupported file types, executable signatures, content/type mismatches and oversized uploads show an error without changing the document.

Uploads keep their insertion point while you continue typing. Visual mode shows an upload placeholder. Wait for uploads before choosing Done or switching editor modes. If you leave through another navigation link during upload, a saved file may have no document link; it remains visible in **Attachments**. Failed files are skipped, and successful files in the same selection are still inserted.

Expand **Attachments** below a document to open, download or delete files. Delete requires confirmation and is permanent; links are not removed from Markdown. Moving, renaming, trashing and restoring a document carries its assets with it. Rename updates the document's own ordinary Markdown asset links. Rewriting links from other documents and raw HTML is scheduled for Phase 9.

SVG is delivered with sandbox restrictions. Scripts and external resources do not execute, including when opening an SVG directly. Generic files download instead of running in the application.

Importing Markdown or HTML brings along the pictures and files that the imported notes link to. Each one is copied into the attachments folder of the document that uses it, and its links are updated. The same type and size rules apply as for uploads.

The API and security choices are described in [ADR-0008](adr/0008-attachment-upload-and-serving.md). Content remains in files; no attachment bytes are stored in SQLite.
