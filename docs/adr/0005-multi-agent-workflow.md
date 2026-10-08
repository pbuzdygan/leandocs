# ADR-0005: Multi-agent workflow and status tracking

- **Status:** Accepted
- **Date:** 2026-10-02
- **Author:** @claude-code
- **Related:** PROJECT_SPEC §96, §105–107, AGENTS.md

## Context

Several AI agents (Codex, Claude Code, …) will work on the project in turns, often without shared memory. Without a single shared record they will duplicate work, contradict each other or report unfinished work as done.

## Decision

- `AGENTS.md` is the single instruction file for all agents. `CLAUDE.md` only imports it.
- `docs/implementation-status.md` is the single source of truth for progress. It holds stable task IDs (`P<phase>-<nn>`), status markers with agent handle and date (`[ ] [~] [x] [!] [-]`), open questions (`OQ-n`), technical decisions, known issues, a "Next up" handoff block and a reverse-chronological work log.
- Commits use Conventional Commits with the task ID in the subject and an `Agent: <handle>` trailer.
- Everything written to the repository is in English.

## Alternatives considered

- **GitHub Issues / Projects.** Not reachable by every agent offline, and they split context away from the code.
- **One file per task.** Too much ceremony for a single-owner project.

## Consequences

- Every session starts by reading the status file and ends by updating it.
- The status file can conflict when agents run in parallel. Agents keep their edits small and line-local to reduce this.
