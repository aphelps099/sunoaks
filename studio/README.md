# Sun Oaks Marketing Studio

Production-oriented vertical pilot for turning verified Sun Oaks information into coordinated marketing campaigns. The existing static Brand House remains at the repository root; this Node application is isolated in `/studio` and is served at the `/studio` URL base path.

## Pilot workflow

1. Add an event or recurring class with plain text or the guided route.
2. Review source excerpts, warnings, possible duplicates, and every operational fact.
3. Verify and publish a canonical versioned record plus a typed marketing-calendar target.
4. Open a ready calendar item, select the deterministic Event Promo or Class Spotlight pack, and generate.
5. Review and approve each still, motion, caption, and email-copy deliverable.
6. Use Promo Kit for verified 1:1, 4:5, 9:16, email 2:1, and lobby 16:9 PNG artboards.
7. Build multi-scene motion in 16:9, 1:1, 9:16, or 4:5 and export PNG, WebM, or browser-supported H.264 MP4.
8. Create an expiring GM link for selected campaign artwork; revoke or regenerate it at any time.

Only four lifecycle states are shown for records and calendar items: Needs information, Verified, Campaign generated, and Exported or done. Deliverable approval is separate; campaign readiness is derived.
An export is authorized only for a valid, approved deliverable belonging to the calendar item’s current campaign. Each completed browser download/copy is recorded separately; the calendar item becomes done only after every required deliverable is approved and exported. Returning an exported deliverable to draft or changes requested invalidates its export event and immediately returns the item and owning record to Campaign generated.

A trusted record’s visible lifecycle is the least-complete state across every calendar item that references it, including verified items that do not yet have campaigns. The record can be Exported or done only when all of those calendar items are done; completing or retrying an older campaign cannot hide newer planned work.

## Studio v2 creation tools

- **Promo Kit** reads active, human-verified records and approved library images. Editable fields are continuously compared with the record; any changed fact blocks download until the verified value is restored.
- **Motion Studio** provides a scene list, deterministic canvas stage, inspector, scrub timeline, title, statement, stat, list, quote, photo, details, calendar, presenter, disclaimer, and end-card templates, transitions, text animations, approved-library and local image support, and four aspect ratios.
- MP4 export uses WebCodecs H.264 and is enabled only when the browser exposes a compatible encoder. WebM is the fallback; PNG exports the current motion frame.

## Secure GM review

Authenticated editors select still/motion deliverables in a campaign and create a short review URL. Tokens use 256 bits of cryptographic randomness; only their SHA-256 hashes are stored. Links expire, can be revoked, and regeneration revokes the prior link in the same serialized repository update. The public `/studio/review/[token]` page returns only the title, version, review state, selected artwork presentation data, and reviewer comment. Repository, campaign, deliverable, and review-link identifiers are not returned.

Requesting changes requires a comment and marks only selected deliverables as changes requested. Approval is refused when selected artwork has validation errors.

Promo Kit and Motion Studio can save the project currently being edited and create the GM link directly from that editor. The server versions the project and stores rendered review snapshots in the same atomic JSON update; the token then points to that immutable saved version, so later canvas edits do not change what the reviewer sees.

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
| `PUBLIC_STUDIO_URL` | Optional canonical origin or URL ending in `/studio`; forwarded host/protocol are used otherwise |

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

## Railway

`railway.toml` builds and starts the Next app and checks `/studio/api/health`. Set the Railway service root directory to `studio`, mount a persistent volume at `/data`, set `STUDIO_DATA_PATH=/data/studio.json`, and configure the variables in `.env.example`.

Review URLs prefer `PUBLIC_STUDIO_URL`. Otherwise the server derives the origin from `X-Forwarded-Host` and `X-Forwarded-Proto`, then `Host`, which is compatible with Railway’s proxy. Keep exactly one application process while using the JSON repository.

## Motion capability boundary

Motion preview and PNG, WebM, and MP4 exports share the deterministic canvas renderer. H.264 MP4 is packaged in-browser with the selectively ported WebCodecs + `mp4-muxer` approach from the reference motion engine. Browser codec availability still varies: current Chrome or Edge is required for MP4, and the UI disables MP4 when WebCodecs is absent. WebM remains available through `MediaRecorder`.

Audio mixing and uploaded video-scene decoding are consciously deferred in this pass. They require persistence for binary media plus deterministic audio/video seeking during offline export; presenting controls without durable media would make saved GM reviews misleading. The broader text, data, calendar, presenter, disclaimer, image, and end-card scene set is included now.

## Security assumptions

The pilot has one environment-configured account and no RBAC UI. A signed, HTTP-only, same-site session cookie scoped to `/studio` expires after 12 hours and is cleared at that same path. All data and action routes verify the session. The application applies a bounded, expiring, per-process failed-login throttle keyed only by client IP; changing User-Agent does not bypass it. Production ingress must add distributed rate limiting and monitoring.

Client-IP headers are trusted only when `STUDIO_TRUST_PROXY_HEADERS=true`. Enable that setting only behind an ingress which removes inbound `X-Forwarded-For`, `X-Real-IP`, and `CF-Connecting-IP` values and supplies its own verified client address. Without that setting, the application deliberately uses one conservative direct-peer throttle bucket because the Web Request API does not expose the socket address. Production refuses secrets shorter than 32 characters. Use TLS, rotate the session secret and password, restrict the application at the network layer where possible, and do not store secrets in the repository.

## Browser storage

The only browser-persisted value is the transient ingester textarea draft. The code catches unavailable-storage errors. Trusted records, sources, schedules, campaigns, approvals, and metadata always live on the server.
