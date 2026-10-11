# STaR — Stranded Train Risk

Collaborative stranded train risk management for the desk: one board per incident, a card per
train with a live timer, the Excel-aligned risk matrix (on-board + location + traction), Plans
A/B/C with a preferred plan and actioning state, the RIO evacuation checklist when the preferred
plan is to detrain, a map pin with live weather, notes tagged with the organisation you are acting
as, check reminders at 20 / 30 / 60 minutes then every 20, an incident PDF, and closing an
incident (final PDF, then the session's trains and notes archived; nothing deleted).

Rebuilt in October 2026 on the Autumn Hub house style (Next.js App Router, TypeScript, Tailwind
v4, the shared kit). Same tables, columns and rules as STaR V2, so links and data carry over.

## Run

```
npm install
npm run dev        # http://localhost:3000/star
npm run lint && npm run type-check && npm test && npm run build
```

Supabase (Mini Project Hub) defaults are built in; `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` override them.

## Addresses

- `https://star.derbycontrol.co.uk/star?i=<incident>` — the board. The bare hostname, `/?i=…` links
  copied from STaR V2 and `/index.html` redirect here with the query intact.
- `https://overseer.derbycontrol.co.uk/star` — the same app inside the Derby Control hub.

## Data

`star_incidents` (one per key, `current_session_id` scopes the board, `started_at` drives the
clock), `star_trains` (`risk_matrix` JSON text of `rm_*` picks; `plan_data` JSONB, older rows hold
it as a JSON string), `star_notes`. Logic is pure and tested under `src/lib/star/`.
