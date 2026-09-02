# Sun Oaks Marketing Studio

Production-oriented vertical pilot for turning verified Sun Oaks information into coordinated marketing campaigns. The existing static Brand House remains at the repository root; this Node application is isolated in `/studio` and is served at the `/studio` URL base path.

## Pilot workflow

1. Add an event or recurring class with plain text or the guided route.
2. Review source excerpts, warnings, possible duplicates, and every operational fact.
3. Verify and publish a canonical versioned record plus a typed marketing-calendar target.
4. Open a ready calendar item, select the deterministic Event Promo or Class Spotlight pack, and generate.
5. Review and approve each still, motion, caption, and email-copy deliverable.
6. Export 1080×1080, 1080×1350, or 1080×1920 PNGs and the six-second motion preset as WebM.

Only four lifecycle states are shown for records and calendar items: Needs information, Verified, Campaign generated, and Exported or done. Deliverable approval is separate; campaign readiness is derived.
An export is authorized only for a valid, approved deliverable belonging to the calendar item’s current campaign. Each completed browser download/copy is recorded separately; the calendar item becomes done only after every required deliverable is approved and exported. Returning an exported deliverable to draft or changes requested invalidates its export event and immediately returns the item and owning record to Campaign generated.

A trusted record’s visible lifecycle is the least-complete state across every calendar item that references it, including verified items that do not yet have campaigns. The record can be Exported or done only when all of those calendar items are done; completing or retrying an older campaign cannot hide newer planned work.

## Setup

Requirements: Node 20+, npm, and current Chrome or Edge for creation and motion export.

```bash
cd studio
cp .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000/studio`.

Development credentials default to `marketing` / `sun-oaks-pilot` only when environment variables are absent. Never deploy those defaults.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `STUDIO_USERNAME` | Single pilot account username |
| `STUDIO_PASSWORD` | Single pilot account password |
| `STUDIO_SESSION_SECRET` | HMAC secret; use at least 32 random bytes |
| `STUDIO_DATA_PATH` | Durable JSON pilot database path; defaults to `./data/studio.json` |
| `STUDIO_TRUST_PROXY_HEADERS` | Set to `true` only when a trusted ingress overwrites client-IP headers |

## Checks

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

## Persistence and deployment

`StudioRepository` is the application persistence boundary. `JsonFileStudioRepository` uses schema validation, serialized writes, temporary files, and atomic rename. It is durable across server restarts and browsers, but is intended for a single Node process and a small staff pilot.

Production should replace the pilot adapter and add media infrastructure when needed:

- PostgreSQL implements `StudioRepository`, with normalized tables and transactional record/campaign creation.
- S3, R2, or equivalent should be added with an authenticated object route when shared uploads or server-rendered exports enter scope.
- Run the Studio on a persistent Node host behind `/studio`; keep the Brand House static files on the existing host or route `/` to that host.
- Back up the relational database and, when introduced, the versioned object bucket before relying on them operationally.
- Run exactly one process with the JSON adapter. Horizontal scaling requires the relational adapter.

The browser-export pilot does not claim server object persistence: approved photographs are immutable application assets, while PNG, WebM, and text files are rendered and downloaded locally after server authorization. There is deliberately no unused object-storage adapter or dead object URL.

## Motion capability boundary

The pilot includes a real six-second canvas animation and browser-produced WebM download. Preview and export share the same renderer and preset. MP4 is intentionally not labeled as available: production H.264 output needs either the reviewed TFG WebCodecs muxer modules or a managed server render/transcode worker. Those modules were not present in this repository, and shipping an unverified MP4 path would be misleading. Current Chrome and Edge are the supported creation/export browsers.

## Security assumptions

The pilot has one environment-configured account and no RBAC UI. A signed, HTTP-only, same-site session cookie scoped to `/studio` expires after 12 hours and is cleared at that same path. All data and action routes verify the session. The application applies a bounded, expiring, per-process failed-login throttle keyed only by client IP; changing User-Agent does not bypass it. Production ingress must add distributed rate limiting and monitoring.

Client-IP headers are trusted only when `STUDIO_TRUST_PROXY_HEADERS=true`. Enable that setting only behind an ingress which removes inbound `X-Forwarded-For`, `X-Real-IP`, and `CF-Connecting-IP` values and supplies its own verified client address. Without that setting, the application deliberately uses one conservative direct-peer throttle bucket because the Web Request API does not expose the socket address. Production refuses secrets shorter than 32 characters. Use TLS, rotate the session secret and password, restrict the application at the network layer where possible, and do not store secrets in the repository.

## Browser storage

The only browser-persisted value is the transient ingester textarea draft. The code catches unavailable-storage errors. Trusted records, sources, schedules, campaigns, approvals, and metadata always live on the server.
