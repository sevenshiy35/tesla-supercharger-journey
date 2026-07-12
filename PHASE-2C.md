# Phase 2C: Tesla Receipt visit import

## Audited source data

The location audit workbook is:

```text
outputs/tesla_receipt_locations_20260712/2026_Tesla_充电地点统计.xlsx
```

Its `收据明细` sheet contains one row per PDF: 75 Receipts, 25 independent charging locations,
75 unique Tesla Invoice Numbers, and the reviewed NLR/manual station mapping. The importer does not
trust the workbook's saved station UUIDs; it resolves each reviewed external ID against the current
Supabase `stations` table.

The canonical field source for charging values is the original archive:

```text
~/Downloads/JAN_2026-JAN_2027.zip
```

All 75 PDFs are one-page Tesla Invoices with extractable text. Each contains a unique Invoice
Number and Reference Number, Charging Location, event date, explicit unit price, energy quantity,
and final USD amount. No PDF contains a charging start clock time, timezone, or duration. PDF
CreationDate metadata is an invoice/file-generation timestamp and is not used as charging time.

## Import model and field mapping

Each parsed Receipt is reduced to the minimum import-safe fields. Customer name, email, address,
VIN, full Receipt text, tax identifiers, and PDF metadata are never written to the database or
local report.

| Import field | Source / rule |
|---|---|
| `sourceFile` | PDF basename |
| `sourcePage` | Page 1 |
| `sourceReceiptId` | Tesla Invoice Number |
| `referenceId` | Tesla Reference Number; report/audit only |
| `rawLocation` | Charging Location block only |
| `stationExternalId` | Reviewed 25-location mapping, explicit alias, or exact address match |
| `stationId` | Live Supabase lookup by unique external ID |
| `eventDate` | Invoice Date of Event, normalized to `YYYY-MM-DD` |
| `localStartedAt` | `null` for current date-only Invoices; reviewed value for future exact records |
| `timezone` | Exact-time override or `tz-lookup` from matched station coordinates |
| `startedAtUtc` | `null` for date-only; real UTC session start for exact records |
| `visitAnchorAtUtc` | Exact start, or local event date at noon converted to UTC for date-only sorting |
| `checkedInTimePrecision` | `exact` or `date_only` |
| `energyKwh` | Invoice Energy fee Quantity |
| `costUsd` | Final `Total Amount (USD)`, including tax/adjustments |
| `chargingMinutes` | `null`; absent from all current Invoices |
| `pricePerKwh` | Invoice Unit Price only; never calculated from cost/energy |

## Exact station matching

`scripts/data/receipt-station-mappings.ts` preserves the 25 manually reviewed location mappings as
external IDs. Piscataway maps to `manual:tesla:piscataway-centennial-ave`; Garfield Avenue maps to
`manual:tesla:jersey-city-garfield-ave`. The remaining 23 map to their reviewed NLR IDs.

Matching never uses city-only, state-only, nearest station, fuzzy string similarity, merchant
frequency, or a shopping-center name by itself. Zero database rows for an expected ID is
`unmatched`; more than one is `ambiguous`. Apply requires both counts to be zero.

## Date-only history and timezone safety

The current Invoices contain event dates but no start clock times. They are valid historical
`date_only` Visits and do not require 75 manual time overrides. The importer looks up the matched
station's IANA timezone, converts local `12:00:00` on the event date to UTC, and stores that instant
only as the `station_visits.checked_in_at` ordering anchor. It writes
`checked_in_time_precision = 'date_only'`.

Local noon is used instead of midnight so normal UTC offsets do not move the anchor to a different
calendar date. It is not an asserted charging time. `localStartedAt` and
`charging_sessions.started_at` remain `null`, and the UI must show only the local date.

Future exact-time evidence may use an ignored override file:

```json
[
  {
    "sourceReceiptId": "TESLA_INVOICE_NUMBER",
    "localStartedAt": "2026-03-20T15:00:00"
  }
]
```

An optional `timezone` may be added when the source explicitly confirms it. Otherwise the importer
uses the station coordinate. Exact-time conversion uses 2026 timezone rules and rejects
nonexistent or ambiguous DST times. Exact records write the real UTC value to both the Visit anchor
and Session start, with precision `exact`. PDF CreationDate, file modification time, and invented
midnight are never used.

## Idempotence and conflicts

A Tesla Invoice Number produces `tesla:invoice:<NUMBER>`. If a future source lacks a unique ID, a
SHA-256 fingerprint covers normalized station ID, the available exact time or date anchor, energy,
final cost, duration, source file, and page. Decimal normalization makes `18.5` and `18.50`
equivalent. Current Invoice-based IDs do not change if the representative anchor changes.

The fingerprint is converted to UUID v5 with the fixed project namespace in
`scripts/lib/receipt-import/fingerprint.ts`. That UUID becomes `station_visits.id`; the unique
`charging_sessions.visit_id` is the session conflict key. Re-running the same input therefore
updates the same two rows without resetting `created_at` or creating duplicates.

Existing visit IDs are treated as dangerous conflicts if station, user, or timestamp differs.
Different Receipts sharing station, exact UTC time, and amount are also blocked for manual review.

## Atomic database boundary

Migration `20260712180000_import_receipt_charge_rpc.sql` introduced the security-definer RPC. After
that version was applied remotely, follow-up Migration
`20260712210000_add_date_only_receipt_precision.sql` adds time precision and replaces the function
signature safely without rewriting migration history. Migrations `20260712213000` and
`20260712214000` qualify the RPC's `visit_id` references and unique-conflict target after live
transaction testing exposed PL/pgSQL output-column ambiguity. The RPC verifies the administrator and station, locks and
validates any existing Visit, upserts `station_visits`, then upserts `charging_sessions` in one
PostgreSQL transaction. It never updates recorded GPS or notes.

The same Migration adds `station_visits.checked_in_time_precision` with an `exact`/`date_only`
constraint. RPC parameters keep the non-null Visit anchor separate from nullable Session start.

Execute is revoked from public, anon, and authenticated and granted only to service_role. The role
receives only the SELECT privileges required for Dry Run plus RPC execute; it receives no DELETE.
The Migration must be reviewed and applied before the database-backed Dry Run can inspect existing
visits and sessions.

## Current readiness

The parser and normalizer read all 75 PDFs as 75 valid date-only records across 25 locations: zero
parser errors, invalid, unmatched, or ambiguous records; zero missing energy/cost; and 75
non-blocking missing durations. Formal Apply remains blocked until:

1. the new Migration is applied;
2. both manual station external IDs exist in Supabase;
3. `IMPORT_USER_ID` is a valid `app_admins.user_id`;
4. Dry Run reports zero invalid, unmatched, ambiguous, and duplicate conflicts.

No manual start-time completion is required for the current 75 Invoices.

## Display rule

Any Visit display must inspect `checked_in_time_precision`: exact records may show local date and
time; date-only records show the local date only. Latest Check-ins follows this rule and never
exposes the noon anchor as an actual charging time. Station status and latest-visit sorting continue
to use the anchor without a map or statistics refactor.

No Receipt Apply is performed as part of Phase 2C implementation.
