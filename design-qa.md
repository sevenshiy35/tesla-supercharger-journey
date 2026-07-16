# Design QA — New Trip route basics

## Evidence

- Source screenshot: `C:/Users/Seven/AppData/Local/Temp/codex-clipboard-74259fef-e01a-41e3-9dfa-f48555d40133.png`
- Comparison: `artifacts/ui-qa/new-trip-comparison.png`
- Implementation screenshots:
  - `artifacts/ui-qa/new-trip-1031-viewport.png` — 1031 × 1112
  - `artifacts/ui-qa/new-trip-1280.png` — 1280 × 900
  - `artifacts/ui-qa/new-trip-390.png` — 390 × 844
- State: authenticated Admin, blank New Trip form, One way selected, both endpoints in Address mode.

## Findings and fixes

1. Origin and Destination switched to two columns before their controls had enough usable width.
   - The endpoint grid now remains stacked until the `xl` breakpoint.
   - The page container can expand to `max-w-5xl` on wider screens.
2. Destination offered two modes but used a three-column segmented control.
   - Mode columns now match the number of available choices.
3. Long endpoint mode labels wrapped and collided at narrow widths.
   - Labels are now concise: Address, My location, and Supercharger.
   - The three-mode mobile layout uses two columns with Supercharger on a full second row.
4. Search placeholder text was clipped.
   - Placeholders are shorter and the input uses responsive text sizing.

## Final result

Passed. The medium, wide, and mobile layouts have no overlapping mode labels, incorrect empty mode columns, or clipped control labels. No P0, P1, or P2 visual issues remain in this scope.
