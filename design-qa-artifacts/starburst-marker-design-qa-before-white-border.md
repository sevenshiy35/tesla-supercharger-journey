# Starburst Map Markers — Design QA

## Evidence

- Source visual truth: `design-qa-artifacts/starburst-marker-source.png` (1672 × 941)
- Browser-rendered implementation: `design-qa-artifacts/starburst-marker-implementation.png` (1265 × 712)
- Selected-marker interaction: `design-qa-artifacts/starburst-marker-selected-state.png` (1265 × 712)
- Normalized full-view comparison: `design-qa-artifacts/starburst-marker-comparison.png`
- Focused selected-marker comparison: `design-qa-artifacts/starburst-marker-focused-comparison.png`
- Viewport: 1265 × 712 browser surface; source normalized into the same comparison height
- State: Chinese locale, contiguous United States map; baseline marker density in the full comparison and an unvisited selected station in the focused comparison

The source full view includes one illustrative focus ring while the baseline implementation capture is unselected. Baseline marker form and density are judged in the full comparison; the selected state is judged separately in the focused comparison to avoid mixing interaction states.

## Findings

- No actionable P0, P1, or P2 mismatches remain.
- The implementation preserves the source hierarchy, map crop behavior, parchment/sage/forest palette, red/blue status semantics, and compact nationwide marker density.
- Red unvisited stations use the source-like hollow four-point starburst. Blue visited stations use a filled four-point starburst, preserving both color and shape differentiation.
- The selected marker uses a filled starburst, warm light center, status-colored inner ring, and muted green outer ring. Its visual emphasis now closely matches the source without obscuring nearby stations.

## Required Fidelity Surfaces

- Fonts and typography: existing site font family, weights, title scale, Chinese line height, and selector text remain unchanged. No marker work introduced wrapping or truncation.
- Spacing and layout rhythm: section spacing, map frame radius, selector width, and map padding remain unchanged. The implementation screenshot differs only through the live responsive viewport and source-image normalization.
- Colors and visual tokens: existing deep forest frame, parchment land, sage water, crimson unvisited state, and blue visited state are retained. The selected outer ring uses the existing muted boundary green.
- Image quality and asset fidelity: marker PNGs are rasterized from the MIT-licensed Phosphor `StarFour` icon assets at high source resolution and remain crisp at Mapbox zoom levels. No placeholder, emoji, text glyph, CSS drawing, or handcrafted SVG is used.
- Copy and content: the legend description now says “marker/标记” instead of “point/圆点,” matching the new non-circular shapes. All other page copy is unchanged.

## Interaction And Runtime Checks

- Nationwide map renders red hollow and blue filled starbursts.
- Station hit areas remain larger than the visible markers and open the existing detail panel.
- Selected stations receive the double-ring focus treatment.
- Selecting California filters stations, zooms the map, and retains the selected-state boundary behavior.
- Browser console errors after the final render: none.
- TypeScript, ESLint, 69 automated tests, and the production Next.js build all pass.

## Comparison History

1. Initial implementation used an overly heavy red outline and a focus ring that was too small compared with the source.
2. The red marker was changed to the regular-weight Phosphor starburst while retaining a slightly larger footprint for nationwide readability.
3. The selected state gained separate inner and outer rings, increased ring radii, and a larger filled starburst.
4. Post-fix full and focused comparisons show the baseline density and selected-marker hierarchy aligned with the source visual.

## Follow-up Polish

- P3: if desired after real-world use, the nationwide marker scale can be reduced by roughly 5% in the Northeast only, but current density remains readable and faithful to the selected concept.

## Final Result

final result: passed
