# Token Atlas

Local-first ccusage dashboard. Keep the black/white shadcn-style surfaces,
compact tinted KPI cards, smooth area charts, and theme-aware model colours.
Product copy is Chinese and deliberately brief.

## Current redesign

- Four tasks: overview (scale), analysis (time/model drilldown), sessions
  (local records), sources (device coverage and JSON import).
- The URL owns navigation and the applied device/source/date scope.
- One inclusive date range feeds daily, weekly, monthly, session and export
  reports. Weeks/months are derived from the filtered daily data.
- `days=all` removes the CLI lower date bound and resolves actual coverage from
  selected records. It must never be implemented as a 90/366-day lookback.
- Snapshot identity must match the applied scope. A failed request cannot
  relabel an old snapshot with a new scope.
- Imported reports are daily aggregates, never session records. Mixed-agent
  imports without per-agent details cannot satisfy a single-agent filter.
- Unknown model totals remain visible as unassigned; Top 5 charts include an
  other series. No fabricated per-model request counts or pricing.
- Costs are API reference estimates, never invoices. Preserve ccusage's
  missing-price diagnostics through imports, aggregation and exports. Active
  legacy rows with zero cost remain unconfirmed, not "free". Incomplete cost
  periods are gaps in charts; totals show only a clearly labelled known subtotal.
- The pinned ccusage reader and Jetson export script must be upgraded together.
- Sonner mounts once in the root and follows the app's saved theme.

## Modules

`ccusage-dashboard/lib/usage-range.ts` owns date validation.
`lib/usage.ts` reads ccusage; `lib/usage-snapshot.ts` assembles reports.
`lib/usage-analytics.ts` prepares chart data without rendering concerns.
`components/workspace/` owns the shell, scope controls and page tasks.

## Verification

Run `pnpm verify` from `ccusage-dashboard`. Test real date/source/aggregation
contracts. Check desktop/mobile, both themes, loading/failure states and
import/export feedback in a browser. See `docs/redesign-review.md`.
