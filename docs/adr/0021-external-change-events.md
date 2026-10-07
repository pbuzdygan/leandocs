# ADR-0021: Authenticated external-change event stream

- **Status:** Accepted
- **Date:** 2026-10-07
- **Author:** @codex
- **Related:** PROJECT_SPEC §27, §28, §60, §62, §80; P12-03/P12-04; ADR-0012, ADR-0013, ADR-0020

## Context

The watcher already reports indexed external changes through `ContentSync.onChange`. The frontend
needs invalidations without polling the full content tree. Notifications must retain ordinary API
authentication, survive reverse proxies, avoid unbounded buffering and release resources on shutdown.

## Decision

- Add `GET /api/v1/events`, using a Node stream sent through Fastify's normal reply lifecycle.
  Existing authentication and security headers apply. SSE additionally validates Origin, Referer
  and Fetch Metadata against the application origin. HEAD is not exposed.
- Every connection starts with `retry: 3000` and a named `ready` event containing `{ "resync": true }`.
  Clients must refetch their current data after ready. There is no replay journal, event id or
  `Last-Event-ID` handling: notifications are hints, and the filesystem/index remain authoritative.
- Emit one `content-changed` event per nonempty external `ContentChanges` batch, with shared types
  for document additions/changes/removals (`id`, `path`, optional `previousPath`) and folder
  additions/removals. JSON escaping preserves filenames without allowing SSE frame injection.
  No document bodies, credentials or absolute paths are included. Saves still compare real revisions.
- Send a comment heartbeat every 15 seconds. Revalidate the captured local session before each
  event and heartbeat; logout, expiry and MFA session rotation prevent further disclosure. Proxy
  identity remains governed by the gateway and is validated on each new request. Force reconnection
  after five minutes so the gateway can reconsider access; it may close connections sooner.
- Use `Cache-Control: no-store, no-transform` and `X-Accel-Buffering: no`. Reverse proxies must
  permit streamed responses and keep idle timeouts above the heartbeat interval. No hostname is fixed.
- Limit the process to 32 connections and each stream's queued bytes to 64 KiB. Reject extra
  connections with 503. A slow client or oversized batch is disconnected and resyncs on reconnect.
  Heartbeats never scan disk. Disabled/failed watching emits changes found by fallback read scans.
- Clean up client timers on disconnect and unsubscribe/close streams in `preClose`, before request
  draining and SQLite shutdown.

### Frontend consumer (P12-04)

- Mount one same-origin EventSource inside the authenticated app shell; navigation retains it,
  while logout/unmount closes it and cancels retries. Native reconnection handles interrupted
  streams. A closed source is reopened after three seconds; session checks on errors return
  revoked local sessions to sign-in. A failed session check also permits retrying the transport.
- Treat events as invalidation hints for TanStack Query. Refetch navigation/index views and
  affected documents/attachments on changes, and all current content queries after every `ready`.
  A changed viewed revision shows `Document updated externally.` after refresh.
- Notify editor sessions synchronously before refetching. Pause autosave, retain the content and
  draft, and enter the existing conflict flow even in a clean editor (UI_SPEC §70). Refetched
  revisions resolve the conflict target without replacing text. A late save response cannot clear
  an external conflict or undo an explicit reload; explicit overwrite uses the reviewed revision.
- Successful in-app document rename/move/property responses advance the editor's base revision
  only when their body matches its saved base and no conflict/save is pending. Local text and
  draft revisions are preserved. A changed body or an existing external conflict remains blocked.
- Keep an existing editor mounted when its file disappears. Reload/review require a disk version;
  saving a copy remains possible and uses the content root if the original document is missing,
  so deletion of its parent does not prevent recovery. Clear the old draft only after recovery.

## Alternatives considered

- **WebSockets:** bidirectional transport is unnecessary for invalidations.
- **Durable replay log:** adds state and retention rules when reconnecting clients can refetch.
- **A new SSE plugin:** Node streams and the existing Fastify lifecycle cover this small protocol.
- **Authenticate only at connection time:** would continue exposing changes to revoked local sessions.

## Consequences

Clients reconnect and refresh after any gap, including large batches and server restarts. Individual
missed notifications are not delivered later. Index-read consistency still follows ADR-0020, and app
mutations are not external changes. Gateway revocation during an existing response requires gateway
connection termination or the next forced reconnect. P12-03 implements the transport and P12-04
implements automatic viewing refresh and editing conflicts. No dependency or schema changes are needed.

References checked on 2026-10-07:

- [Fastify streaming replies](https://fastify.dev/docs/v5.12.x/Reference/Reply/#streams)
- [Fastify shutdown lifecycle](https://fastify.dev/docs/latest/Reference/Lifecycle/#shutdown-lifecycle)
- [TanStack Query invalidation](https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation)
