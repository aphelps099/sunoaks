# ADR-001: Marketing Studio pilot architecture

**Status:** Accepted for vertical pilot  
**Date:** 2026-09-02

## Context

The static Brand House cannot host authenticated server persistence. The approved pilot must exercise the complete information-to-export loop without committing to production database and object-storage vendors before they are configured. It must preserve the Brand House and avoid making browser storage the system of record.

## Decision

- Keep all existing Brand House files and behavior. Add the Next.js/React/TypeScript application in `/studio`, configured with the `/studio` base path.
- Use route handlers for authenticated application actions and reads.
- Use one signed HTTP-only session for one environment-configured pilot account.
- Model sources, canonical records, record versions, schedule rules, occurrences, typed calendar targets, assets, campaigns, source snapshots, and deliverables with Zod.
- Enforce the redundant calendar owner invariant: every schedule-rule or occurrence target resolves to the same `contentRecordId`.
- Map event to Event Promo and recurring class to Class Spotlight deterministically.
- Snapshot record ID, record version, the exact typed calendar target and its schedule/occurrence facts, and the approved asset metadata used when creating a campaign.
- Store deliverable approval individually and derive campaign rollup.
- Render every still and motion frame through the same canvas renderer. Enforce 1080×1080, 1080×1350, and 1080×1920 in the deterministic pack builder.
- Use `StudioRepository` as the pilot persistence boundary with an atomic JSON adapter. Approved images ship as immutable application assets; authorized PNG, WebM, and text exports are browser downloads.
- Provide WebM motion export. Defer MP4 until the actual TFG H.264/WebCodecs modules or a production transcode worker can be integrated and tested.
- Treat 900px as the minimum creation width. Smaller screens receive clear desktop guidance rather than a compromised editor.

## Data integrity rules

Draft candidates never generate campaigns. Publishing requires an explicit human verification action plus record-type-specific server validation for exact dates, times, locations, and recurring days. Exact source fingerprints and normalized record keys trigger review instead of silent merges. Record and canonical-asset updates create versions. Historical target and asset snapshots never change when trusted data later changes. A deliverable with an error validation result cannot be approved or exported. Exports are recorded per deliverable and item completion is derived from the approved, valid, fully exported required set. Record lifecycle is the least-complete state across every referencing calendar item, including items without campaigns, and reaches done only when all relevant items are done.

## Consequences

The pilot is runnable without external infrastructure and survives restarts, but its JSON adapter supports one application process only. Production deployment must replace it with transactional relational storage. Managed object storage and an authenticated object route are required when uploads or shared server-rendered exports enter scope; no nonfunctional adapter is claimed in this browser-export pilot. WebM is immediately usable in supported browsers; MP4 is a visible, documented capability boundary rather than an unreliable claim.

## Deployment assumptions

Route `/studio/*` to the Node deployment and `/` to the static Brand House. Use TLS, persistent volumes only for the pilot adapter, 12-hour sessions, scheduled database/object backups, current Chrome/Edge, and a production session secret. Static approved assets may be CDN-cached; private uploads require authenticated or signed object URLs.

The ingress must strip caller-supplied forwarding headers and set the verified client address before `STUDIO_TRUST_PROXY_HEADERS=true` is enabled. Otherwise the application uses a single conservative direct-peer login-throttle bucket. The in-process map is bounded and expires stale entries; distributed ingress throttling remains required for horizontal deployment.
