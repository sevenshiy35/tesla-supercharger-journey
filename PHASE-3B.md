# Phase 3B — short-term station-sweep Trip Planner

Phase 3B is a private administrator workflow for planning a short Supercharger sweep. A Trip Plan is
planning intent; it is never a Station Visit, and an endpoint is not automatically a Trip Stop.

## Delivery roadmap

| Step | Scope | Status |
| --- | --- | --- |
| 3B.1 | Schema and Drafts | Complete; remote Migration applied |
| 3B.2 | Origin/Destination and Base Route | Complete |
| 3B.3 | Candidate Selection and Optimization | Complete; remote Migration applied |
| 3B.4 | Manual Review, Editing, Recalculation, and Anchored Re-optimization | Complete; remote Migration applied |
| 3B.4.1 | Round-trip Map Station Selection and directed route optimization | Complete; remote Migration applied |
| 3B.5 | Confirmation and Homepage Display | Paused |
| 3B.6 | Active Trip and Check-in Integration | Planned |

The linked remote Migration list was checked on July 15, 2026. The Foundation, endpoint,
nullable Stop-limit, 3B.3 algorithm, 3B.4 manual-editing, 3B.4.1 selected-route, and the final parking
feature rollback are present remotely through `20260715234500`. Parking information is not part of
the current product. `20260715235500_trip_route_basics.sql` is the only pending Migration.
The compatibility Migration is:

```text
supabase/migrations/20260715190000_nullable_trip_stop_limit.sql
```

`20260715190000` was applied and verified against the linked remote history on July 15, 2026.

## Current simplified workflow

The active Draft flow is **Route basics → Select stations → Optimize route → Review**. Route basics
contains one segmented One way/Round trip control plus Origin and Destination. A Round trip treats
Destination as the turnaround point and previews `Origin → Destination → Origin`. New Drafts require
all three route inputs before creation; the detail page edits the same three values atomically.

Planning Limits are no longer ordinary product settings. The UI does not expose route corridor,
maximum extra time/distance, Station dwell time, or maximum Stops. Users explicitly choose Stations;
the software assigns round-trip legs, optimizes visit order, and calculates the route. One-way keeps
manual Add Stop, reorder, and Recalculate Route. Results present Base, Optimized, and Additional
driving time/distance, not budget status. `stop_duration_minutes = 3` is the internal quick check-in
estimate; its stop-time/total-time estimate remains hidden from the simplified UI.

The 10/25/50/75/100-mile **Display corridor** defaults to 50 and is local map filtering only. It never
writes `trip_plans.corridor_miles`, removes selected/current Stops, or limits optimization. The old
columns and Settings/endpoints/swap RPCs remain for historical compatibility, but ordinary UI does
not call the Settings RPC.

The pending `20260715235500_trip_route_basics.sql` Migration adds atomic create/update Route
basics RPCs. The later pending `20260716010000_trip_plan_rename.sql` Migration adds the narrowly
scoped Trip-name RPC. Neither pending Migration is applied by this delivery. Phase 3B.5 remains
paused.

## Endpoint sources

Each Draft may independently select an Origin and Destination from:

- **Mapbox Geocoding v6:** an explicitly selected US address/place with provider ID, display label,
  full address, and coordinates;
- **Current location:** requested only after a user click, with an editable display label and no
  reverse-geocoded address;
- **Tesla Supercharger:** the existing administrator Station search, using stable `stations.id` and
  authoritative database coordinates. Visited and unvisited Stations are both valid endpoints.

Current-location coordinates never enter a URL, browser storage, logs, public View, or public map.
They are sent only when **Create Draft** or **Save Route Basics** is clicked and remain in the
administrator-only Trip row.
If a referenced Station is deleted, `on delete set null` preserves the private label/address/coordinate
snapshot, but route calculation requires the endpoint to be selected again.

## Permanent Geocoding is paused

The product retains chosen endpoints, so it must not switch to Temporary Geocoding: Mapbox does not
permit temporary results to be cached or stored for future use. Address search is therefore hidden
and rejected by the server unless both Permanent Geocoding feature flags are explicitly enabled.
Current-location and Supercharger endpoints remain available, and previously stored endpoints remain
usable for Directions.

When explicitly enabled, the implementation uses Mapbox Geocoding API v6 with `permanent=true`,
`country=US`, `language=en`, autocomplete, the reviewed address/place types, and a six-result limit.

Mapbox documents that permanent results may be stored indefinitely, and that Permanent Geocoding
requires an eligible account with a valid credit card or enterprise contract. Configure and verify
that prerequisite before acceptance testing. The proxy is authenticated administrator-only,
private/no-store, and returns only the compact product DTO—not a raw response or token.

Official references reviewed July 15, 2026:

- [Mapbox Geocoding API](https://docs.mapbox.com/api/search/geocoding/)
- [Mapbox Directions API](https://docs.mapbox.com/api/navigation/directions/)
- [Mapbox Matrix API](https://docs.mapbox.com/api/navigation/matrix/)
- [Mapbox Terms of Service](https://www.mapbox.com/legal/tos)
- [Mapbox Product Terms](https://www.mapbox.com/legal/service-terms)

## Directions and route algorithms

All Directions requests use the server-only `mapbox/driving` profile with GeoJSON, full overview,
no steps, no alternatives, English, and `continue_straight=true`. Live traffic, EV routing, the
Optimization API, maneuvers, voice/banner instructions, and automatic charging stations remain
excluded. Phase 3B.3 uses Matrix only for road-cost evaluation; Matrix never supplies Geometry.

- **One-way:** request Origin → Destination once and create Segment 0, `outbound`.
- **Round-trip:** request Origin → Destination and Destination → Origin separately. Segment 0 is
  `outbound`, Segment 1 is `return`; total metrics are the sums. Return Geometry is never copied or
  reversed from outbound. `Promise.all` means either-leg failure prevents any save.

Endpoints must be complete, valid, on a Draft, and at least 100 meters apart. The server chooses only
`routes[0]`, rounds provider metrics to meters/seconds, and sanitizes Geometry to exactly a GeoJSON
LineString. Coordinates are finite and in range; two or more are required. The application and RPC
both enforce 100,000-coordinate and 8 MiB technical safety ceilings. Raw provider responses,
maneuvers, incidents, metadata, and formatted display strings are never stored.

## Geometry persistence review

The July 15, 2026 official Directions documentation and applicable public Mapbox Terms reviewed
above do not clearly confirm that this account may retain Directions route Geometry indefinitely.
The implementation therefore does not assume permission:

```dotenv
MAPBOX_PERSIST_ROUTE_GEOMETRY=false
```

`false` is the safe default. Supabase stores private endpoints, Stops, metrics, provider, algorithm,
and calculation time, but no planned `trip_plan_segments` row. The current action response displays
sanitized LineStrings immediately. After refresh, an administrator-only, `private, no-store` preview
rebuilds Base or planned Geometry from saved endpoints and ordered Stops without modifying Metrics,
Stops, or revision. Set the flag to `true` only after the operator confirms the account-specific
contract permits retention. Even then, only sanitized LineStrings and per-segment metrics are
persisted—not the complete Directions response.

## Revision and invalidation

`route_input_revision bigint not null default 0` is a monotonic concurrency token. In the current
product, a real change to Trip Type, Origin, or Destination:

1. updates the input and increments the revision;
2. deletes existing Segments and suggested Stops;
3. clears provider, algorithm, base/planned/extra metrics, and calculation time;
4. keeps the Plan, Stations, Visits, photos, and charging history intact.

Identical Route basics use null-safe comparisons and do not invalidate. The local Swap control only
changes the two form values until the atomic Route basics save. Clear Route keeps both endpoints,
deletes route/Stops, clears metrics, and increments the revision. Retained legacy Settings and swap
RPCs keep their historical behavior but have no ordinary UI entry.

Route calculation captures the revision before provider calls. `admin_save_trip_base_route` locks the
owner's Draft and accepts the result only if `p_expected_revision` still matches. A stale A→B response
therefore cannot overwrite a newer A→C edit, even if the server request itself could not be cancelled.

## RPC and security boundary

The 3B.2 Migration upgrades `admin_update_trip_plan_settings` and adds:

- `admin_update_trip_plan_endpoints`
- `admin_swap_trip_plan_endpoints`
- `admin_clear_trip_plan_route`
- `admin_save_trip_base_route`

Each is `security definer`, fixes `search_path = public`, checks `auth.uid()`, `app_admins`, ownership,
and Draft status, and is executable only by `authenticated`. Base tables keep RLS and no anonymous
Trip Policy/View. Station endpoints are re-read and coordinate-matched in SQL. The browser cannot
submit route Geometry, distance, duration, provider, algorithm, ownership, status, or public flags;
it sends only the Trip ID as calculation intent to a Server Action. The authenticated Cookie Session
client is used—never service role or `SUPABASE_SECRET_KEY`.

The pending `20260715235500_trip_route_basics.sql` Migration adds
`admin_create_trip_plan_route_draft` and `admin_update_trip_plan_route_basics`. Both fix the same
security boundary and accept only Trip Type plus complete endpoint intent (and expected revision for
updates). Station endpoints are authoritatively re-read through the retained endpoint validator. An
identical update returns `changed = false`; a real change advances revision once and atomically clears
this Draft's Stops, all Base/planned Segments, Metrics, calculation/audit state, and stale flag. It
never changes Stations, Visits, photos, Receipts, or Charging Sessions.

The compatibility Migration makes `trip_plans.max_stops` nullable without changing existing rows.
`null` means there is no user-configured Station-count cap. Current Route Draft creation stores null;
the old create/settings RPCs continue to accept and return nullable `p_max_stops` for old data and API
compatibility. Ordinary UI no longer saves any legacy Planning Limit.

The applied 3B.3 Migration is:

```text
supabase/migrations/20260715200000_trip_suggestion_algorithm.sql
```

It adds `route_kind = base | planned`, changes Segment uniqueness to
`(trip_plan_id, route_kind, segment_index)`, adds the Stop measurements
`corridor_distance_meters`, `route_progress`, and `selection_rank`, and adds compact candidate and
technical-limit audit fields on `trip_plans`. Internal request, coordinate, shortlist, and iteration
limits remain application constants and are not stored as user settings. The Migration also adds
`admin_save_trip_plan_suggestions` and `admin_clear_trip_plan_suggestions`. Both are authenticated
administrator-only, owner/Draft-scoped, fixed-search-path RPCs. Save locks the Draft and validates
revision, endpoint/base prerequisites, exact payload shapes, unique existing Stations, current-user
Visit history, sequence/leg/rank, authoritative Metrics, legacy cap, detour budgets, and cleaned
LineStrings before atomically replacing algorithm Stops and planned Segments. Clear keeps endpoints,
Base Segments, Base Metrics, and revision while restoring planned Metrics to the Base Route.

## Historical Phase 3B.3 automatic Stop-selection contract

This contract documents the retained legacy algorithm and RPC compatibility; it has no current UI
entry. Its automatic objective was to **maximize the number of unvisited Superchargers visited within the
route corridor and detour budget**. "Unvisited" means the administrator has no Visit for the Station,
regardless of whether a historical Visit would have been public or private. The same Station is
counted at most once across outbound and return legs.

Candidate expansion stops when any applicable condition is reached:

1. another Station would exceed `max_extra_minutes` of extra driving time;
2. another Station would exceed non-null `max_extra_miles`;
3. no feasible unvisited candidate remains inside the route corridor;
4. provider results leave no reachable candidate;
5. an internal API or algorithm technical guard is reached; or
6. for backward compatibility only, a non-null legacy `max_stops` value is reached.

With `max_stops = null`, condition 6 never applies and the algorithm continues while candidates are
feasible. With a numeric legacy value, it remains an optional upper bound until the user saves the
new settings form. Equal-count plans use deterministic tie-breakers that prefer lower extra driving
time, then lower extra distance, then stable Station identity.

Matrix shortlist size, Directions coordinate limits, request batching, and iteration ceilings are
implementation safety guards. They stay in application code/configuration, never in `trip_plans`,
and never appear as a user business limit. Hitting a guard must produce an explicit partial-result
notice rather than silently claiming that every feasible Station was considered. Large candidate
sets should be paged/batched and map-clustered instead of truncated by a user Stop-count setting.

`max_extra_minutes` remains an **extra driving** budget. Estimated Station dwell time is tracked
separately as `stop_duration_minutes × selected Station count` in planned Stop seconds, so maximizing
Station count can materially increase total elapsed Trip time even when detour driving stays within
budget. The Review step must show both values.

## Phase 3B.3 candidate and route algorithm

“Unvisited” is computed from `station_visits` for the current `auth.uid()`, not from the public status
View. Any Public, Private, exact, date-only, Receipt-imported, or phone Check-in Visit excludes that
Station; other users' Visits never affect the result. The authenticated Cookie Session is used and
queries explicitly filter `station_visits.user_id` to the current administrator. Service role and
`SUPABASE_SECRET_KEY` are never used. Eligible Stations must have finite US coordinates and one of
the operational statuses observed in the current dataset (`available` or `open`). Missing postal
code, stall count, or maximum power is allowed. Endpoint Stations and duplicate non-algorithm Stops
are excluded.

The server obtains each true Base leg from a valid persisted Base Segment or a temporary Directions
request. Round trips always use independently calculated outbound and return Geometry. Expanded
latitude/longitude Bounding Boxes reduce the database query before any detailed measurement; near
the antimeridian the query is split into safe boxes. Every remaining point is projected onto each
great-circle route segment using unit-sphere vectors. This produces spherical
`corridorDistanceMeters`, per-leg `routeProgress` in `[0,1]`, the nearest segment, and an initial leg.
Round-trip ties prefer outbound deterministically. Candidates outside `corridor_miles` are removed,
and the sorted pool uses leg, progress, corridor distance, state, city, and stable Station ID.

Mapbox limits were checked against the official Matrix and Directions documentation on July 15,
2026:

- Matrix `mapbox/driving`: 2–25 coordinates, up to 625 elements for a 25×25 request, and 60 requests
  per minute. Phase 3B.3 requests `distance,duration`; values are meters and seconds. `null` remains
  unreachable. `fallback_speed` is deliberately absent.
- Directions `mapbox/driving`: 2–25 coordinates per request. Ordered routes over that limit are split
  into consecutive requests whose adjacent pieces share a boundary waypoint.

The Matrix client is server-only, uses the shared 15-second abort timeout and bounded three-attempt
retry policy for 429/502/503/504, validates square dimensions, and never logs tokens, URLs, or raw
responses. Progressive batches interleave early, middle, and late candidates from both legs, combine
them with consecutive current-route node chunks, evaluate every insertion edge covered by the batch,
and compare the best candidate across batches. A missing Matrix element makes that insertion
unreachable. Tiny negative provider rounding is clamped to zero; a material negative never grants
budget credit and increments only a safe aggregate diagnostic.

Greedy selection starts at Origin→Destination or Origin→Destination→Origin. In each iteration it
chooses the feasible insertion with lowest added drive time, then added distance, corridor distance,
route progress, Station ID, and edge index. Adding another Station always improves the primary
station-count objective, so the loop continues until budget, reachability, candidates, legacy cap,
or an internal guard stops it. Destination remains the round-trip midpoint; insertion before it is
outbound and insertion after it is return. A bounded deterministic adjacent-swap pass can improve
time, then distance, without changing the selected set, endpoints, midpoint, or leg.

Matrix output is never final route truth. Directions recalculates one-way ordered Stops, or separate
outbound and return legs, and safely segments more than 25 waypoints with shared boundaries. Segment
Metrics are summed. Final extra drive time/distance are compared to the saved Base Metrics; Station
dwell time is excluded. If actual Directions exceeds a budget, a bounded correction loop removes the
highest estimated-cost/later-selected Stop and recalculates. If it still cannot fit, nothing is saved.
Zero selected Stops is a successful result that restores Base Metrics. A round-trip request fails as
a whole if either leg/segment fails.

The 3B.3 generation UI and its Server Action entries are retired from the current product. The
applied schema, RPCs, audit fields, and service implementation remain only for compatibility with
existing Trips. A legacy `source = algorithm` Stop still loads, displays, deletes, reorders, and
recalculates; no Generate, Regenerate, Re-optimize, Clear Suggestions, technical-limit, or automatic
candidate-count interface remains.

## Phase 3B.4 manual editing contract

The applied 3B.4 Migration is:

```text
supabase/migrations/20260715210000_trip_manual_editing.sql
```

It adds `trip_plans.planned_route_stale`, makes the per-Trip sequence constraint deferrable for
atomic reordering, and adds authenticated owner/Draft/revision-scoped RPCs for manual add, remove,
algorithm lock/unlock, exact complete reordering, exact Directions result saving, Anchor-aware
re-optimization, and scratch regeneration. The current application uses add/remove/reorder/leg move
and exact recalculate only; the old lock/re-optimize/scratch RPCs remain unused compatibility code.
It does not change either earlier Migration and was verified in linked remote Migration history.

A manual Stop is always `source = manual`, `is_locked = true`, `status = planned`. The server fixes
those values; the browser sends only Trip ID, Station ID, leg, optional insertion position, and the
expected revision. Manual Stations may be visited and may lie outside the original corridor. They
still consume configured Station dwell time, but are not counted as expected new Check-ins.
Endpoints, duplicates, invalid coordinates, and clearly closed Stations are rejected. Unknown
operational status is allowed with a warning so the administrator can make the final decision.

A locked algorithm Stop and every manual Stop is a fixed **Anchor**. Re-optimization preserves each
Anchor's identity, leg, relative order, and lock/source state. Existing unlocked algorithm Stops stay
inside their original Anchor interval; new candidates stay on their measured leg. Only unlocked
algorithm Stops may be removed, moved, or replaced automatically. Current Visit history is refreshed
on every load and calculation: a newly visited unlocked algorithm Stop drops from the next
re-optimization, while a visited Anchor remains fixed.

Human intent outranks budget enforcement. Add, remove, reorder, leg change, and lock operations never
call Mapbox. Add/remove/reorder increment `route_input_revision`, delete only planned Segments, retain
Base Segments and saved Metrics, and mark `planned_route_stale = true`. Lock/unlock also increments
revision to invalidate in-flight calculations, but retains Stop order, Metrics, Segments, and the
existing stale value. Endpoint or planning-setting changes continue the older full invalidation
workflow.

**Recalculate Route** sends only Trip ID from the browser. The Server Action reloads the exact current
Stop set/order/leg, calls segmented Directions, derives authoritative metrics, and saves only if the
revision still matches. It never changes Stops and is allowed to save an over-budget human route.
The summary reports `within`, `over_time`, `over_distance`, or `over_both`, with exact overages, and
sets `planned_route_stale = false` using `manual-route-v1`.

The former **Re-optimize Unlocked Stops** and **Regenerate From Scratch** application entries are
removed. Their already-applied database contracts are not rewritten. No current browser route can
invoke them, and no automatic process discards manual, locked, or legacy algorithm Stops.

The Stop editor is split into Outbound Stops, a fixed Destination card, and Return Stops. It supports
native drag/drop plus 44 px Move Earlier/Later controls, explicit Round Trip leg moves, and named
Remove confirmation. Numbering is shared by list and map. Manual, legacy-saved, Visited, and
Expected-new markers/badges remain distinct. A stale route line is visibly faded and
labelled not current. Summary counts total, expected-new, already-visited, manual/legacy, and each
leg, plus Base, Optimized, and Additional distance/drive-time metrics. Station-time totals and budget
status are hidden from the ordinary workflow.

Every Stop-changing operation uses `p_expected_revision`. The exact stale response is: “The trip
changed while this operation was running. Refresh and try again.” Re-optimization and scratch
regeneration advance revision after replacing the Stop set, preventing an older Directions result
from overwriting a newer plan. Internal Matrix, Directions-coordinate, request, shortlist, and
iteration guards remain application constants and are never stored or shown as business limits.

## Phase 3B.4.1 Map selection and delivery-style optimization

Phase 3B.4.1 makes **Select Stations on Map** the only round-trip Station-choice mode and leaves
one-way manual planning unchanged. The user
chooses the complete Station set; the server assigns each Station to outbound or return and chooses
a fast visit order. The route structure is always:

```text
Origin → outbound Stops → fixed Destination → return Stops → Origin
```

Every explicitly selected Station is retained exactly once. A visited Station is allowed, participates
in optimization, consumes dwell time, and is saved as a Stop, but does not count as an expected new
Check-in. Endpoints, missing/closed Stations, invalid coordinates, an unreachable complete route,
stale revision, or a provider/technical failure reject the whole operation without a partial save.

Candidate display uses the union of independently calculated outbound and return Base Route
corridors. The 10/25/50/75/100-mile control is display-only; search can add a Station outside that
display corridor. Current Stops initialize the browser selection. Clicking markers changes only a
client-side Set of Station IDs. The authenticated, administrator/owner-scoped, private/no-store
Candidate endpoint returns a compact Station DTO plus only the current administrator's visited flag.
The optimize action accepts only Trip ID, expected revision, and Station IDs, then reloads every
authoritative Station and Visit row on the server.

The selected Station optimizer uses a full **directed** `mapbox/driving` Matrix. It never assumes
A→B equals B→A, never uses straight-line cost as route truth, and preserves Matrix `null` as
unreachable. Official Matrix limits were rechecked July 15, 2026: driving requests accept 2–25 input
coordinates, at most 625 elements, and 60 requests per minute; `sources` and `destinations` are
zero-based indices. The implementation uses 12-source × 13-destination tiles, stable global node
indices (`0 = Origin`, `1 = Destination`, Stations sorted by ID), and merges every tile without
symmetrizing it. At the current 48-Station internal guard, 50 nodes require at most 20 Matrix
requests. The application-only guards are:

- `MAX_SELECTED_STATIONS_PER_OPTIMIZATION = 48`
- `MAX_MATRIX_REQUESTS_PER_OPTIMIZATION = 24`
- `MAX_OPTIMIZATION_ITERATIONS = 256`
- `MAX_OPTIMIZATION_RUNTIME_MS = 20000`

They are provider/runtime safety rails, not user business limits, and are not stored in the database.
The heuristic runs cheapest insertion, regret-2 insertion, nearest-leg, and route-progress seeds. A
deterministic local search evaluates within/across-leg relocate and swap moves plus directed 2-opt.
It accepts lower duration, or equal duration with lower distance, and uses stable signatures for final
ties. “Optimized route” and “fastest estimated visit order” are accurate product labels; the heuristic
does not promise a mathematically global shortest route.

Matrix decides leg and order; segmented Directions independently calculates the final authoritative
outbound and return Geometry and metrics. The return route is requested separately, never fabricated
by reversing outbound. Any segment failure prevents saving. With Geometry persistence disabled,
Stops and metrics are still saved and the private planned preview can rebuild LineStrings on demand.

Legacy detour values do not control or warn in this user-selection mode. All selected Stations remain,
and the result shows objective Base, Optimized, and Additional drive time/distance. Internal summary
types may retain historical budget fields for RPC/data compatibility, but ordinary UI does not render
Within/Over budget status. All selected rows are stored as `source = manual`, `is_locked = true`,
`status = planned`, with algorithm-only ranking/detour fields left null. Recalculate remains a
distinct exact operation that preserves the current Station order; Optimize Selected Stations is the
operation that may reassign legs and reorder the complete set.

The applied Phase 3B.4.1 Migration is:

```text
supabase/migrations/20260715220000_trip_selected_out_and_back.sql
```

`admin_save_selected_out_and_back_route` locks the owner Draft, rechecks round-trip status, revision,
endpoints, Base metrics, exact selected/Stop set equality, continuous outbound-before-return order,
manual/locked/planned metadata, Station validity, segment continuity, and metric totals. It then
atomically replaces all Trip Stops, replaces planned Segments only when persistence is enabled,
preserves Base Segments, clears stale, records `selected-out-and-back-v1`, and advances revision.
No Visit, Station public status, homepage state, current-location record, token, raw Matrix, or raw
Directions payload is created or changed. Phase 3B.5 remains paused; confirmation and public display
are not part of this delivery.

## Environment

```dotenv
# Public style token used only by Mapbox GL JS to draw the administrator map
NEXT_PUBLIC_MAPBOX_TOKEN=

# Keep the Matrix optimization UI disabled unless its cost model is explicitly approved
NEXT_PUBLIC_MAPBOX_MATRIX_API_ENABLED=false

# Hide Mapbox address search while Permanent Geocoding is paused
NEXT_PUBLIC_MAPBOX_PERMANENT_GEOCODING_ENABLED=false

# Dedicated server token for Geocoding v6, Directions v5, and Matrix v1; never expose in a client variable
MAPBOX_SERVER_ACCESS_TOKEN=

# Deny Matrix requests without affecting other Mapbox services
MAPBOX_MATRIX_API_ENABLED=false

# Deny billable Permanent Geocoding requests on the server
MAPBOX_PERMANENT_GEOCODING_ENABLED=false

# Safe default; enable only after account-specific Directions retention rights are confirmed
MAPBOX_PERSIST_ROUTE_GEOMETRY=false
```

Use a dedicated least-privilege Mapbox token with only the APIs required here. Never paste tokens,
real home coordinates, or user UUIDs into documentation or test fixtures.

## Local verification and explicit smoke test

Normal verification uses fixtures and makes no Mapbox request or database write:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npx supabase migration list
npx supabase db push --dry-run
```

For an explicit 3B.4.1 acceptance test, first confirm the applied Migration in the intended Supabase
environment. Start the app with both Mapbox tokens configured, sign in as an
allowlisted administrator, and create a disposable Draft using two clearly non-sensitive test places
(for example Philadelphia City Hall and Baltimore City Hall). Calculate the Base Route, generate
round-trip Base Route, select a mixture of unvisited and visited test Stations, and verify every
selected Station is retained once, the Destination stays fixed, the numbered map/summary match the
saved rows, and refresh rebuilds the route while Geometry persistence is false. Test an over-budget
selection, Recalculate, manual reordering, and an empty selection clear. Inspect
Network to confirm the browser sees only the protected application endpoints and Server Actions,
never the server token, Matrix/ Directions URL, candidate pool, Metrics submission, or raw provider
response. Finally verify no Visit, public status, or homepage data changed. This delivery does not
apply the Migration or run any live Mapbox/Trip smoke test.

## Trip name editing

The Trip detail heading now has a visible edit control. An administrator can rename any owned Trip
inline, including the initially unnamed Draft, with Save, Cancel, Escape, pending, and safe error
states. Names are trimmed, required, and limited to 120 characters consistently in the browser,
Server Action, and database RPC. Renaming updates only `trip_plans.name` and `updated_at`; it does not
invalidate a route, clear Stops, advance the route revision, or change status. The new RPC is in the
unapplied `20260716010000_trip_plan_rename.sql` Migration.

## Not implemented and paused Phase 3B.5 decisions

Confirmation, status transitions, homepage layers, Active Trip/Check-in linking, navigation,
range/energy, weather, immutable run-history, and production deployment remain out of scope. Phase
3B.5 is paused and will own Review/Confirm behavior and any public presentation. The 3B.4.1
Migration is already applied after 3B.4; confirm linked history before real map-selection acceptance.

## Parking information

`20260716120000_station_user_preferences.sql` adds the private, per-user
`station_user_preferences` table and `admin_set_station_pay_to_park` RPC. It is pending and is not
applied by this delivery. **Pay to park** means only that the current administrator personally
marked the Station after reviewing it in the Tesla app. The website does not verify the fee, query
Tesla Find Us, infer from NLR or Station names, or expose the preference publicly.

The Station Selection Map uses a yellow circle with a persistent `$`; Selected adds the existing
outer selection ring, and Visited remains available in the Popup. Planned-route markers retain the
Stop number and add a small yellow `$` badge. Search results, Selected Stations, manual Add Stop,
and Planned Stops show the same private badge. Mark/Unmark is idempotent, optimistic, and does not
change selected IDs, Stops, Segments, metrics, or `route_input_revision`.

**Select all visible unvisited** skips unselected Stations marked Pay to park and reports the skipped
count. It never removes a marked Station that was already selected. A user can always select a
yellow `$` Station individually; Optimize Selected Stations keeps it and applies the same Matrix,
Directions, leg-assignment, and ordering behavior as every other explicitly selected Station. The
database preference is Station-level and survives Trip changes or Draft deletion.

## Current product workflow convergence

The active flow is **Route basics → Select stations → Optimize route → Review**. Trip Type, Origin,
and Destination share the first step; Round trip labels Destination as the turnaround. The user
chooses the complete Station set; the server only assigns outbound/return legs, optimizes order, and
calculates road routes. Display corridor is a local 50-mile-by-default map filter. One-way retains
Base Route, Add Stop, reorder, and Recalculate. Phase 3B.5 remains paused.
