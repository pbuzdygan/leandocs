# Performance

LeanDocs is meant to stay comfortable up to **10,000 documents** (PROJECT_SPEC §84). `pnpm test:performance` (`scripts/performance-check.mjs`, P15-07) checks this against the built server; how to run it is in [development.md](development.md#performance-check).

## What the check does

It generates a library in a temporary folder: 10,000 documents of about 3 KB in 10 areas × 10 topics (about 100 per folder), each with front matter, headings, prose, two wiki links and one relative link to random documents, a table, a task list and a code block. Every 100th document has no `id` (LeanDocs adds one on the first start). Every 20th document links to one "hub" document, so 500 documents link to it. The library is the same on every run.

The server runs from `apps/server/dist` with `AUTH_MODE=none` and the default native file watching, as the Docker image does. Timings are measured from a client on the same machine, so they include HTTP but no network.

## Budgets and results

Measured on 2026-10-07 on the development machine (3 cores, 6 GB RAM, local SSD, Node.js 24). "Before" is the code before P15-07.

| Measurement                                  | Before   | After   | Budget |
| -------------------------------------------- | -------- | ------- | ------ |
| First start (index everything)               | 40.8 s   | 40.9 s  | 120 s  |
| Restart                                      | 3.3 s    | 2.8 s   | 15 s   |
| Tree (p95)                                   | 52 ms    | 60 ms   | 500 ms |
| Search (p95, six queries)                    | 27 ms    | 27 ms   | 150 ms |
| Open document (p95)                          | 3 ms     | 4 ms    | 100 ms |
| Backlinks (p95)                              | 20 ms    | 20 ms   | 100 ms |
| Open and save (p95)                          | 384 ms   | 54 ms   | 400 ms |
| Create (p95)                                 | 361 ms   | 36 ms   | 300 ms |
| Rename a document linked from 504 others     | 3.7 s    | 1.8 s   | 3 s    |
| External edit found by search                | 316 ms   | 307 ms  | 5 s    |
| Save while six 40 MiB downloads run (max)    | 1,286 ms | 125 ms  | 1 s    |
| Import of 1,000 documents                    | 18.8 s   | 16.5 s  | 60 s   |
| Memory after first start (server + analysis) | —        | 486 MiB | 1 GiB  |
| Memory peak (server + analysis)              | 975 MiB  | 773 MiB | 1 GiB  |

Budgets for the first start and the import scale with `--documents`; the others do not.

## What P15-07 changed

- **Saves and new documents** re-read only the written file while file watching is healthy (`ContentSync.refreshWritten`). Before, every save stat'ed all 10,000 files under the mutation lock. Without healthy watching (`WATCH_MODE=off`, or the watcher failed) the full reconciliation remains, so external changes are still found.
- **The scanner** stats up to 32 files of a folder at a time instead of one after another: a full reconciliation takes ~120 ms instead of ~270 ms. Restart, rename, move, trash and the fallback without watching profit from it.
- **Attachment downloads and listings** no longer hold the mutation lock (KI-8). They wait for a running mutation and then read on their own, so saves do not wait for large downloads. Text attachments are validated on their bytes instead of being decoded into a string, which saved twice the file size in memory per download.
- **Link rewriting and import** parse a document only once in the common case. The code ranges that protect `[[…]]` in code are computed only when a wiki link would actually change (renames) or an Obsidian file reference was found (import).
- **Docker healthcheck** start period is 120 s (was 10 s), so a first start with a large library is not reported as unhealthy.

## Known costs

- **First start.** The server listens only after it has indexed every document. Analysing Markdown in the separate analysis process (ADR-0025) costs ~4 ms per document, so 10,000 documents take ~40 s, more on slower machines. Later starts read only changed files. One analysis process is used; parallel analysis would need more memory and is not needed for the target.
- **Rename and move** re-read every document that links to the moved one: in the worst case measured (504 linking documents) 1.8 s, during which other changes wait.
- **Import** writes and syncs every file to disk and analyses it: ~16 ms per document. A 1,000-file import takes ~16 s in one request.
- **Downloads** still read the whole attachment (up to `MAX_UPLOAD_SIZE`) into memory to validate it before sending, so several concurrent downloads of very large files need that much memory each.
- **Memory.** ~490 MiB after indexing 10,000 documents (server ~370 MiB, analysis process ~110 MiB); peaks of ~770 MiB came from the concurrent 40 MiB downloads and the import.
