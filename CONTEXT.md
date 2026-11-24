# Token Atlas

Local-first ccusage dashboard. Keep the black/white shadcn-style surfaces,
compact tinted KPI cards, smooth area charts, and theme-aware model colours.
Product copy is Chinese and deliberately brief.

## Current redesign

- Four tasks: overview (scale and models), analysis (trend or request
  performance), sessions (local aggregates), sources
  (device coverage and JSON import).
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
- ccusage 20.1.1 supplies the GPT-6.2 Astra/Sol offline token rates. Supplement
  only the missing official 2x Fast factor for Codex, without overriding explicit
  prices or aliases. Check the published base rates and the effective settings
  against the pinned CLI; never rewrite the user's configuration.
- Always use offline reports and disable ccusage telemetry in subprocesses and
  the Jetson export script.
- Codex history includes plain and Zstandard-compressed rollouts in both
  sessions/ and archived_sessions/. Test the installed CLI with isolated
  synthetic logs, including duplicate representations, before reader upgrades.
- Sonner mounts once in the root and follows the app's saved theme.
- DSH uses ccusage's native daily and session reports, including pricing and
  visible missing-price diagnostics. In all-agent scope, use the one unified
  report. Pass through `DSH_HOME`; do not re-parse DSH logs, reprice them, or
  add rate cards that the native report did not produce.
- Normalize `deepseek-v4.1-flash` to `deepseek-flash` in report models, session
  names and pricing diagnostics. This only groups existing usage, without
  repricing imports or merging older V4 Flash generations. Match report-wide
  price hints to raw names before grouping; row-level diagnostics take precedence.
  Session search accepts either name.
- Request timing is a read-only projection of Codex logs only, including in
  all-agent scope. DSH, other agents, and external devices have no timing data.
  It never requires CC Switch software, database, or proxy. Do not add
  timing evidence as usage or costs. Keep turn-level TTFT separate from
  request-level estimates. Leave unproven values empty, show sample counts,
  and disclose partial coverage without a technical status strip. Poll the
  timing endpoint only while the Request Performance analysis tab is active
  and visible. Keep it private to the loopback launcher.
- Desktop launch runs one production server; development watchers are opt-in.
  Start timing after the main summary, coalesce refreshes, throttle to the
  visible 60-second cadence and bound decoded bytes, lines, samples, metadata
  discovery and retained files. Date-range timing must not warm unrelated
  archived logs. Resource-limited timing is partial coverage, never a missing
  usage charge or a confirmed zero.

## Modules

`ccusage-dashboard/lib/usage-range.ts` owns date validation.
`lib/usage.ts` reads ccusage; `lib/usage-snapshot.ts` assembles reports.
`lib/usage-analytics.ts` prepares chart data without rendering concerns.
`lib/native-performance.ts` owns the request timing report seam.
`components/workspace/` owns the shell, scope controls and page tasks.

## Verification

Run `pnpm verify` from `ccusage-dashboard`. Test real date/source/aggregation
contracts. Check desktop/mobile, both themes, loading/failure states and
import/export feedback in a browser. See `docs/redesign-review.md`.
