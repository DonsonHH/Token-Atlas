# Token Atlas workspace redesign

Reviewed against the v0.2.2 implementation and the earlier interaction history.
The existing brand, monochrome surfaces, tinted KPI cards and smooth area charts
are retained. Product copy is short; explanations live in tooltips or details.

## Information architecture

| Page | Purpose | Primary action |
| --- | --- | --- |
| Overview | Scale, daily change and model composition | Open analysis / export scope |
| Analysis | Time, metric and model comparison | Change grain / export periods |
| Sessions | Find a local session | Search, sort, inspect / export results |
| Sources | Device coverage and import freshness | Import / update one device |

The URL owns navigation and the applied scope. Calendar inputs are drafts until
Apply. Chart metric/grain/grouping stay local to analysis. Session search and
model filters affect the session table and its export, not global totals.

## Review findings and changes

| Before | After | Why |
| --- | --- | --- |
| Weekly CLI report always loaded 12 weeks | Weeks and months derive from the filtered daily report | Every view covers the same inclusive range |
| Session CLI received no date arguments | Since/until/timezone passed to the report reader | Session amounts describe the chosen range |
| Custom range labelled using lookback-from-today | Exact applied start/end returned in the snapshot | Historical windows are not truncated or mislabelled |
| Request failure could reuse another scope's snapshot | Snapshot identity includes the complete request | No old numbers under new filter labels |
| Mixed-agent imports admitted to any source filter | Mixed imports excluded from single-agent scopes with an explanation | Prevent false Agent attribution |
| First five model series only | Top five plus remaining and unassigned amounts | Chart preserves the full reported total |
| Moving average always used total tokens and only activity dates | Average follows the selected metric and calendar dates | Correct input/output and cache comparisons |
| Reasoning added again to derived total | Reasoning remains a subset of output | Avoid duplicate token counting |
| Unknown names could hash to the same colour | Shared deterministic catalogue resolves palette collisions | Match the same model across charts |
| Large repeated scope forms and audit banners | Direct scope controls; a dedicated Sources page | Fewer layers and clearer ownership |
| Large page mixed reading, charts and table interactions | Domain, reporting, chart preparation and pages have separate modules | Changes can be reviewed and tested at their interfaces |
| Imports required a separate script | Paste/file import with preview and explicit update target | Complete workflow in the dashboard |
| No action feedback / duplicated notifications | One root Sonner toaster, shared app theme and event-driven feedback | Short, accurate progress and result messages |
| Dark calendar range had low-contrast text | Explicit range-middle foreground | Selected dates remain readable |
| Date input displayed edits without committing them in browser checks | Draft updates from input events | Applied scope matches visible dates |
| A single weekly/monthly point produced no visible area | One period uses a single (stacked) column; multiple periods retain smooth areas | A one-period selection is still readable |
| Missing export timestamps were replaced with the current time | Display the real import time when export time is unknown | Do not invent device freshness |
| Next.js traced private device JSON into the deployment manifest | Runtime file access is excluded from build tracing | Personal usage files stay out of packaged assets |
| Whole-page loading and long chart animations | Same-scope refresh preserves content; charts update immediately | Less layout movement and faster inspection |
| General button transition animated every property | Explicit colour, shadow and transform transitions; reduced-motion support | Predictable interaction feedback |

## Verification

- Final result: `pnpm verify` passed (lint, strict type checking, 14 tests and
  the Next.js production build). The final build has no tracing warnings.
- Both route deployment manifests were inspected: zero private device files,
  and no whole-project tracing. README uses a real screenshot of the rebuilt UI.
- Domain regression checks cover invalid dates/timezones, history windows,
  inclusive scope agreement, mixed-source exclusion, partial local failures,
  model-tail conservation, per-metric calendar averages, import validation,
  and model-colour collisions.
- Real-data API checks compared daily, weekly, monthly and local session totals
  in the same range; imported device totals are separate from local sessions.
- Browser checks: navigation, custom dates, model split / grain, search,
  pagination, export contents and toast feedback, paste/file preview and device
  import / update. Invalid JSON disables submission.
- Desktop (1440 px) and mobile (390 px), dark and light themes were checked.
  Mobile layout has no horizontal overflow; KPI cards use two columns.
- An invalid device displays an explicit error and disables export, with no
  previous-scope totals. Reset restores a valid scope.
- The temporary imported fixture was updated from 100 to 200 tokens; its `.bak`
  preserved the original 100. Stale updates returned 409 without changing it;
  cross-origin writes returned 403. Invalid dates returned 400.
- Test-only device files are kept outside the application in
  `C:/tmp/token-atlas-import-review-20261011/`; real Jetson data was not changed.

## Deliberate limits

- Imported daily aggregates cannot be re-bucketed to another timezone or
  expanded into sessions. Their date labels are preserved.
- Reference prices are ccusage estimates; models missing offline prices may
  report zero. There is no per-model actual bill or fabricated request count.
- This is a local application. Same-origin import protection is not a substitute
  for authentication if deploying outside a trusted machine/network.
