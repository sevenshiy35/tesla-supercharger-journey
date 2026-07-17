# Design QA — Homepage Trip journal and Photos

## Evidence

- Selected source mock: `C:/Users/Seven/.codex/generated_images/019f6d64-9fd4-7463-97c6-a5d74bad2588/exec-7b79bf0b-791e-4534-86c5-49660b8cfbb3.png`
- Side-by-side comparison: `design-qa-artifacts/public-trip-editorial-roadbook-comparison.jpg`
- Implementation screenshots:
  - `design-qa-artifacts/public-trip-editorial-roadbook-desktop.jpg` — desktop Trip header and live map
  - `design-qa-artifacts/public-trip-editorial-roadbook-desktop-bottom.jpg` — desktop station timeline and progress footer
  - `design-qa-artifacts/public-trip-editorial-roadbook-mobile.jpg` — 390 px mobile Trip layout
  - `design-qa-artifacts/photo-journal-desktop.jpg` — dedicated Photo journal
- State: public preview Trip with two completed stops, one current stop, one planned stop; six real repository image assets for Photo-journal QA.
- Browser: in-app browser, 1280 × 720 desktop capture; mobile content rendered in a 390 px same-origin QA frame.

## Findings and fixes

1. The navigation labels could shift when English and Chinese strings changed width.
   - Desktop navigation now uses a fixed five-column centered grid.
   - Measured link-center deltas after switching languages: `0, 0, 0, 0, 0 px`.
2. The route runner originally animated by a percentage of its own width, so it barely moved along the connector.
   - The runner now animates its actual `left` or `top` position across the full connector and respects reduced-motion preferences.
3. The desktop timeline needed a compact responsive alternative.
   - At 390 px the Trip narrative and map stack, and the station plan becomes a vertical progress rail without horizontal overflow.
4. The Photo journal needed to work as a site, not only a static grid.
   - The masonry layout uses real photo aspect ratios, and the lightbox supports next/previous, Escape, focus trapping, focus restoration, and touch swipes.
5. The selected mock used illustrative map labels that are not available in the live Mapbox style.
   - The implementation preserves the selected editorial layout and route colors while using the existing live Mapbox cartography and attribution. This is an intentional P3 fidelity difference.

## Functional checks

- English/Chinese navigation position stability: passed.
- Route map loaded with completed, current, and future segments: passed.
- Animated route runner and current Mapbox bead: passed.
- Photo lightbox open, next, and close flow: passed.
- Desktop and 390 px layouts: passed.
- Browser console showed no application errors in the checked states.

## Final result

Passed. The selected editorial-roadbook direction is preserved across the live homepage Trip and the dedicated Photo journal. No P0, P1, or P2 visual issues remain in this scope.
