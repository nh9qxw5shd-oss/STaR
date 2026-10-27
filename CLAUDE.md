# STaR

Next.js App Router, TypeScript strict, Tailwind v4, Supabase ("Mini Project Hub", anon key).
Stranded train risk board; see README.md for what it does.

## Working here
- Checks before any push: `npm run lint`, `npm run type-check`, `npm test` (`node --test`, so
  relative imports inside `src/lib` carry the `.ts` suffix), `npm run build`.
- Rules live in `src/lib/star/` and are tested: risk matrix points and thresholds (`risk.ts`, as
  the Stranded Train RA spreadsheet), plans and the RIO checklist (`plans.ts`), the check cadence
  (`reminders.ts`). Keep the stored shapes: `risk_matrix` is JSON text of `rm_*` picks;
  `plan_data` is `{ A, B, C, meta }` and may arrive as a JSON string.
- Writes are scoped by `incident_key` and the incident's `current_session_id`. Closing an incident
  archives (never deletes), stamps `closed_at` and rotates the session. History groups archived
  trains by `(incident_key, session_id)` (`history.ts`); reopening one un-archives that session and
  makes it current, refused while the incident has a live board of its own.
- `star_incidents.name` is optional display text; the key stays the identity and the link. The
  hub's cockpit reads `name` and `closed_at`.
- Free-text inputs keep what is typed (spaces, line breaks); tidy (`clampStr`) on save, never in
  `onChange`.
- "Acting as" is stored raw (not JSON) in `star_acting_as`, mirrored to `star_org`.
- Mounted on the Derby Control hub (PotatOS) at `overseer.derbycontrol.co.uk/star`, which proxies
  `/star/*` here. `basePath` is `/star` (`next.config.ts`) on the standalone hostname too; the root
  redirects there. `public/storage-bridge.html` is byte-identical across systems; change all or
  none. Vercel framework comes from `vercel.json`.
- Overseer is the only way in (27 Oct): the Vercel project has no domain and is reached only through
  `overseer.derbycontrol.co.uk/star` (PotatOS docs/09 §4.6). The last redirect in `next.config` sends a page
  load without Overseer's `x-overseer-hop` marker to the same address on Overseer. Absolute links
  this system hands out use `https://overseer.derbycontrol.co.uk/star/…`. Do not add a domain.

## Design language
Autumn Hub house style (`nh9qxw5shd-oss/autumn-hub`, `web/src/`): the stylesheet, `ui.tsx` and
`uiFeedback.tsx` are copied by hand; keep them in step. Network Rail orange brand mark. Mobile
width 390 px with no horizontal scroll.

Writing and commits: no model names or identifiers in code, README, commit messages or PR text.
