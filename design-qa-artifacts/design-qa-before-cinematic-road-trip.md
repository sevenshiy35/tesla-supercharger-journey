# White-Bordered Starburst Markers — Design QA

## Evidence

- Source visual truth: `design-qa-artifacts/starburst-white-border-source.png` (1672 × 941)
- Browser-rendered implementation: `design-qa-artifacts/starburst-white-border-implementation.png` (1265 × 712)
- Normalized full-view comparison: `design-qa-artifacts/starburst-white-border-comparison.png`
- Focused map comparison: `design-qa-artifacts/starburst-white-border-focused-comparison.png`
- Previous marker QA archive: `design-qa-artifacts/starburst-marker-design-qa-before-white-border.md`
- Viewport: 1265 × 712 browser surface; source normalized to the implementation viewport for comparison
- State: Chinese locale, contiguous United States map, nationwide station density

The left side of each comparison is the supplied reference and the right side is the live implementation. The focused comparison isolates the map because the requested change affects marker separation rather than page layout.

## Findings

- No actionable P0, P1, or P2 mismatches remain.
- Every red and blue station starburst now has a warm-white outer edge, matching the supplied reference treatment.
- The white edge remains visible at the nationwide zoom level and keeps adjacent markers distinguishable in dense West Coast, Great Lakes, and Northeast clusters.
- Red and blue centers remain solid, so the previously approved status semantics and compact marker size are preserved.
- Selected markers reuse the same bordered image assets and continue to receive the existing double-ring focus treatment.

## Required Fidelity Surfaces

- Typography, copy, selector geometry, map crop, boundary treatment, and page spacing remain unchanged.
- The marker edge uses warm white `#fffdf2`, which reads clearly against the parchment land color without creating a harsh pure-white halo.
- Red `#c9323b` and blue `#1f6f9a` center colors remain unchanged.
- Marker PNGs are built from the project’s Phosphor `StarFour` icon source at 96 × 96 with transparent padding. No placeholder, emoji, text glyph, CSS drawing, or handcrafted SVG is used.

## Runtime Checks

- Nationwide map renders solid red and blue starbursts with visible warm-white separation edges.
- Marker hit areas, station selection, selected-state boundary behavior, and map controls remain unchanged.
- Browser console errors after the final render: none.
- TypeScript, ESLint, 69 automated tests, and the production Next.js build all pass.

## Comparison History

1. First pass added a thin warm-white edge while keeping the approved marker size.
2. Visual comparison showed the edge was slightly too subtle at the nationwide scale.
3. The colored center was inset further while preserving the overall marker footprint, producing an approximately one-screen-pixel edge at the default map zoom.
4. Final browser and focused comparisons confirm clearer separation without increasing visual clutter.

## Final Result

final result: passed
