**Findings**
- No P0/P1/P2 findings remain.

**Source Visual Truth**
- User reference: `design-qa-artifacts/journey-six-direction-user-reference.png`.
- Required behavior: six redrawn vehicle directions (left, right, up-left, up-right, down-left, down-right), three suspension frames per direction, a connected charging branch with a marked parking bay, reverse parking, cable connection, and a charging icon above the car.

**Implementation Evidence**
- Component: `src/components/journey/JourneyRoadAnimation.tsx`.
- Animation styles: `src/components/journey/JourneyRoadAnimation.module.css`.
- Six-direction source sheet: `design-qa-artifacts/car-six-direction-spritesheet-source.png`.
- Processed-frame contact sheet: `design-qa-artifacts/car-six-direction-frames-contact-sheet.png`.
- Reverse-parking screenshot: `design-qa-artifacts/journey-six-direction-reverse.png`.
- Charging screenshot: `design-qa-artifacts/journey-six-direction-charging.png`.
- Departure screenshot: `design-qa-artifacts/journey-six-direction-depart.png`.
- Mobile charging screenshot: `design-qa-artifacts/journey-six-direction-mobile-charging.png`.
- Full-view comparison: `design-qa-artifacts/journey-six-direction-comparison.png`.
- Focused branch comparison: `design-qa-artifacts/journey-six-direction-focused-comparison.png`.
- Desktop viewport: 1440 x 900.
- Mobile viewport: 390 x 844 with a 375px document width and no horizontal overflow.
- Browser sampling covered a complete 34.5-second loop and observed all six directions, all behavior phases, and 16 of the 18 direction/frame combinations; the remaining two frame files were alpha-validated in the full 18-frame asset set.
- Observed phases: drive, turn-in, reverse, connecting, charging, parked, depart, and reset.
- Console errors checked: none on desktop or mobile.

**Required Fidelity Surfaces**
- Fonts and typography: the existing SF Pro/PingFang system stack, sizing, weight, line height, and journey copy remain unchanged. The cream content surfaces preserve readable dark-teal copy over the animated map.
- Spacing and layout rhythm: the central copy zone remains calm. The desktop charging vignette sits outside the paragraph card; mobile keeps a dedicated animation gap between the paragraph and metrics surfaces.
- Colors and visual tokens: the background, six-direction sprites, charger, cable, and charging badge preserve the cream, parchment, deep teal, white, red, turquoise, and warm-yellow palette of the reference.
- Image quality and asset fidelity: the car uses 18 real transparent raster frames rather than CSS rotation. The connected branch, parking stall, charger, cable, and battery badge are generated raster assets with validated transparent borders and no green chroma residue.
- Copy and content: journey copy, statistics, localization behavior, and data-source label are unchanged.
- Accessibility: the scene remains `aria-hidden`; reduced-motion users receive a static parked-and-charging state with the cable and badge visible.

**Comparison History**
- Initial P1: one high-detail car image was rotated around curves, producing rigid movement and incorrect viewpoints. Fix: replaced it with six independently drawn directions and three suspension-deformation frames per direction, then switched frames at 145–210ms intervals. Post-fix evidence: `design-qa-artifacts/car-six-direction-frames-contact-sheet.png`; browser sampling observed left, right, up-left, up-right, down-left, and down-right in one loop.
- Initial P1: the charger floated beside the main road and the car jumped directly to charging. Fix: replaced the background with a physically connected side branch and marked parking stall, then split the sequence into approach, turn-in, forward overshoot, reverse down-right while facing up-left, cable connection, charging, exit, and departure. Post-fix evidence: `design-qa-artifacts/journey-six-direction-reverse.png` and `design-qa-artifacts/journey-six-direction-focused-comparison.png`.
- Initial P2: the desktop paragraph surface partly hid the parked car and charging badge. Fix: shifted the final parking coordinates, charger, and cable to the right half of the bay. Post-fix evidence: `design-qa-artifacts/journey-six-direction-charging.png`.
- Initial P2: the mobile paragraph surface covered the charging badge. Fix: moved the badge to the visible gap directly above the parked car. Post-fix evidence: `design-qa-artifacts/journey-six-direction-mobile-charging.png`.

**Open Questions**
- None blocking this iteration.

**Implementation Checklist**
- [x] Six directions implemented and used in the live route.
- [x] Three suspension frames per direction implemented.
- [x] Connected parking branch and marked stall installed.
- [x] Forward setup and reverse-parking phases implemented.
- [x] Cable extension/retraction implemented.
- [x] Charging badge shown above the parked car.
- [x] Desktop and mobile browser checks completed.
- [x] Reduced-motion fallback retained.
- [x] Production build, typecheck, lint, and 69 tests passed.

**Follow-up Polish**
- [P3] The six-direction sheet is intentionally a little more detailed than the map terrain; a future bespoke pixel pass could reduce highlight clusters by another 10–15% for a stricter retro look.

**Final Result**
- final result: passed
