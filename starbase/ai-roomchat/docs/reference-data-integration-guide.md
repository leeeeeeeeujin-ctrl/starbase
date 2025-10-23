# Reference Data Integration Guide

This document summarizes the three reference codebases stored under `docs/reference_data/` and outlines how their concepts or
modules can accelerate development of the current Supabase-backed game platform.

## Tinode Chat Server (`chat-master`)

### What it Provides

- Full-stack instant messaging platform written in Go with web, Android, and iOS clients, plus gRPC bindings for many other
  languages. It supports WebSocket and long polling transports with JSON or protobuf payloads.
- Extensive feature set including user/group messaging, voice and video calls, read receipts, typing indicators, access control,
  bot hooks, and pluggable storage adapters for PostgreSQL, MySQL, MongoDB, and more.
- Operational tooling such as Docker images, sandbox demo scripts, CLI administration utilities (`tn-cli`), and monitoring
  helpers for production deployments.

### How We Can Reuse It

- **Realtime messaging contract:** Reuse the Tinode topic & subscription schema as inspiration for Supabase Realtime channels.
  Their distinction between personal topics (`usr`) and group topics (`grp`) maps well to our room sessions. The Tinode access
  control list (ACL) matrix can translate into Postgres policies plus RPC helpers for managing read/write permissions.
- **Server extensibility patterns:** Tinode’s plugin hooks (chatbots, moderation) illustrate how to wrap Supabase Edge Functions
  around RPC calls for background automation such as matchmaking notifications or GM interventions.
- **Presence & typing indicators:** The presence broadcasting implemented in `server/presence` shows how to maintain TTL-based
  activity markers. We can adapt this logic into a Postgres table with `updated_at` heartbeats and a Realtime publication via
  Supabase.

### Concrete Implementation Notes

- Model our message storage tables after `server/store`, keeping message bodies small and shipping large attachments through
  direct client ↔ Supabase Storage uploads.
- Implement RPCs mirroring Tinode’s `set` and `get` operations so that clients can update topic metadata, manage subscriptions,
  and fetch history with pagination.
- Use Go snippets from `chat-master/server` as references when building any Go-based tooling around Supabase (e.g., cron jobs
  for cleaning inactive topics) while keeping our primary API surface area as Postgres RPCs.

## Shopify Liquid Template Engine (`liquid-main`)

### What it Provides

- Secure, sandboxed templating language designed for user-editable themes with stateless compilation and rendering phases.
- Rich feature set for loops, filters, custom tags, and strict error modes, plus pluggable environments for scoping custom logic.
- Ruby implementation but the templating concepts translate to any host environment, including serverless contexts.

### How We Can Reuse It

- **Player-authored content:** Use Liquid-compatible syntax for configurable room descriptions, NPC dialogue scripts, or player
  guild pages without risking arbitrary code execution. Rendering can occur in Supabase Edge Functions (Ruby via WASM, Node via
  liquid.js) or in the client before submitting sanitized templates.
- **Email and notification templates:** Adopt Liquid syntax for transactional emails or push notifications triggered by Postgres
  RPCs to keep message personalization consistent across channels.
- **In-game HUD layouts:** Store HUD widget configurations as Liquid templates so designers can ship layout tweaks via the
  database without redeploying clients.

### Concrete Implementation Notes

- Keep template source in Postgres tables with versioning and moderation flags; use RPCs to load the latest published version.
- When rendering on the backend, enforce `strict_variables` / `strict_filters` equivalents to surface configuration errors early.
- Define a curated set of filters (e.g., `markdown`, `title_case`) and tags (e.g., conditional rendering based on player stats)
  aligned with our gameplay data. These can be registered in controlled Liquid environments analogous to the `Environment.build`
  samples.

## Open Match 2 (`open-match2-main`)

### What it Provides

- Open-source matchmaking framework from Google for assembling players into matches based on customizable logic and gRPC APIs.
- Core Go application (`main.go`) serving matchmaking endpoints, protobuf definitions in `proto/`, and generated Go clients in
  `pkg/` for integrating with various services.
- Deployment references (`deploy/`) covering containerization and operational metrics scaffolding (`metrics.go`).

### How We Can Reuse It

- **Matchmaking architecture:** Mirror Open Match’s division between the frontend (ticket ingestion), the core orchestrator, and
  Matchmaking Functions (MMFs). We can implement these roles as Supabase RPCs and cron jobs: tickets stored in Postgres tables,
  MMFs expressed as SQL or serverless functions, and distribution handled by Realtime broadcasts.
- **Data contracts:** Use the protobuf schemas in `proto/` to design our Supabase table structures for tickets, match proposals,
  and assignments. Even if we do not adopt gRPC directly, the messages provide a well-tested set of fields (skill ratings, queue
  identifiers, properties) that map cleanly to JSONB columns.
- **Scalability strategies:** Open Match’s horizontal scaling guidance informs how we partition matchmaking workloads—e.g., by
  game mode or region—with advisory locks or row-level locks in Postgres to avoid conflicts.

### Concrete Implementation Notes

- Implement a `match_tickets` table mirroring `openmatch.Ticket` fields, with RPCs to create tickets and an Edge Function to run
  selection logic similar to the MMF examples.
- Use Supabase Realtime to notify clients when a ticket transitions to `Matched`, inspired by the Assignment service in Open
  Match.
- Borrow the metrics structure (`metrics.go`) to define observability events we can emit via Postgres NOTIFY for Prometheus
  scraping or Logflare forwarding.

---

By treating these repositories as pattern libraries rather than copy-paste sources, we can align their proven architectures with
our Supabase-first stack: database-driven RPC orchestration, Realtime signaling, and direct client storage access. Each reference
highlights a domain—messaging, templating, matchmaking—that we can integrate incrementally into the current game experience.
