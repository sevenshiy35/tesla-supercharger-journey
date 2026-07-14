# Journey Route Atlas — Design QA

## Evidence

- Reference asset: `public/images/journey-animation/route-atlas-background-v2.png` (1819 × 865, 2.10:1)
- Desktop viewport/state: 1536 × 1024, forced `charge` route at 15,000 ms
- Mobile viewport/state: 390 × 844, forced `charge` route at 15,000 ms
- Desktop screenshot: `design-qa-artifacts/journey-route-atlas-desktop-charging-final.png`
- Mobile screenshot: `design-qa-artifacts/journey-route-atlas-mobile-charging-final.png`
- Full comparison: `design-qa-artifacts/journey-route-atlas-comparison-final.png`
- Focused charging-bay comparison: `design-qa-artifacts/journey-route-atlas-focused-comparison-final.png`

## Checks

- Typography: existing site font, weights, and Chinese line-height retained; copy remains readable over the map.
- Layout and spacing: copy/metrics are shifted left on desktop to keep the charging bay visible; mobile spacing exposes the parked car before the metrics card.
- Color and tokens: existing parchment, ink, glass-card, and shadow treatment retained; the new map uses the same warm palette.
- Image quality: source background is generated close to the measured slot ratio and rendered with crisp pixel edges; sprites remain sharp at desktop and mobile sizes.
- Copy: the introduction and metric content are unchanged and no truncation was introduced.
- Responsiveness: verified at 1536 × 1024 and 390 × 844; the mobile crop keeps the charging branch, car, cable, and icon in view.
- Accessibility: the decorative scene remains `aria-hidden`; reduced-motion users receive a stable parked-and-charging state.
- Interaction/motion: one car is rendered at a time; four routes loop in sequence; direction is calculated from path tangents; all six sprite directions were exercised; the charge route includes approach, reverse parking, cable connection, charge indicator, departure, and reset.
- Path accuracy: vehicle positions are mapped through the same `object-fit: cover` transform as the background and remain on the marked lane centerlines.

## Iteration history

1. Replaced the earlier winding map with a straighter, connected route atlas and a true at-grade intersection.
2. Reduced car scale and shifted desktop content left so the charging animation is not covered.
3. Increased mobile spacing so the parked car remains visible.
4. Flipped, resized, and highlighted the cable asset so the charger-to-car connection reads at both breakpoints.
5. Reversed the south route so the loop visibly exercises left and down-left sprites in addition to the other four directions.

## Final result

passed
