# Homepage Cinematic Journey Integration — Design QA

## Evidence

- Source visual truth: `design-qa-artifacts/cinematic-road-trip-desktop-1440-final-v3.png`
- Browser-rendered desktop implementation: `design-qa-artifacts/home-cinematic-second-section-desktop-final.png`
- Browser-rendered mobile implementation: `design-qa-artifacts/home-cinematic-second-section-mobile-final.png`
- Full-view comparison: `design-qa-artifacts/home-cinematic-integration-comparison-final.png`
- Focused scene/card comparison: `design-qa-artifacts/home-cinematic-integration-focused-comparison-final.png`
- Previous root QA report archive: `design-qa-artifacts/design-qa-before-home-cinematic-integration.md`
- Viewports checked: 1440 × 900, 1024 × 768, 768 × 900, 430 × 932, and 390 × 844
- State: Chinese locale; New York initial scene; California and Utah manual scene selection; automatic image rotation enabled; live homepage journey summary

The approved standalone cinematic prototype is the source direction. The homepage implementation intentionally removes the Model Y layer, vehicle timeline, and development controls while retaining the three illustrations, stable introduction card, live statistics, location title, crossfade, and scene indicators.

## Findings

- No actionable P0, P1, or P2 differences remain.
- The homepage second section now carries the approved dark editorial frame, blue-hour travel illustration, warm ivory cards, serif hierarchy, location title, and compact scene indicators.
- The Model Y is absent from the DOM and no vehicle, charging cable, charger sprite, or Model Y image resource is loaded by the homepage section.
- The introduction remains connected to the existing language copy, and the three statistics remain connected to the existing live `JourneySummary` values rather than prototype mock data.
- Desktop and 1024 px tablet keep the information panel over the left side of the scene. At 820 px and below, the illustration becomes a 4:5 frame and the cards move below it.
- 390 px and 430 px layouts have no horizontal overflow. Browser measurements were `innerWidth: 390 / scrollWidth: 375` and `innerWidth: 430 / scrollWidth: 415`; the 15 px difference is the vertical scrollbar.

## Required Fidelity Surfaces

- **Fonts and typography:** Georgia/Times/Songti display typography preserves the cinematic editorial tone; existing SF/PingFang/system sans fallbacks remain in body copy and labels. Chinese headline sizing was reduced at desktop so it holds one intentional line rather than leaving a single orphan character.
- **Spacing and layout rhythm:** The section uses the site's 1360 px content width, generous page padding, rounded image frame, compact glass cards, and existing section-to-section flow. Mobile cards are separated from the image for readability.
- **Colors and visual tokens:** Deep navy, warm ivory, muted copper, cobalt water, violet sky, and warm city lights match the selected prototype. The following map section keeps its existing green palette unchanged.
- **Image quality and asset fidelity:** The homepage loads the same compressed local WebP illustrations as the approved prototype. New York uses its dedicated mobile bridge crop; California and Utah use responsive crops of their source illustrations. No placeholders or code-drawn substitutes are present.
- **Copy and content:** Existing translated introduction and live station/state/mileage labels are preserved. New section heading, scene title, subtitle, and button labels switch between English and Chinese.

## Runtime Checks

- New York renders first without hydration drift.
- New York, California, and Utah indicator buttons switch scenes and update `aria-current` and the live title.
- The next scene preloads, the automatic rotation pauses outside the viewport, and reduced motion disables automatic rotation and crossfade animation.
- Vehicle elements in the homepage section: `0`; vehicle image resources loaded by the homepage section: `0`.
- Browser console errors: none.
- Browser console warnings introduced by this section: none. The full homepage still emits the existing downstream Mapbox GL container warning, which is unrelated to this replacement.
- ESLint, TypeScript, and the production Next.js build pass.

## Comparison History

1. First mobile pass exposed a P1 blank-scene issue: New York had a dedicated mobile image, but the shared mobile rule also hid the only image for California and Utah.
2. The desktop image is now hidden only when that scene actually has a mobile alternative. California and Utah retain their original illustration with mobile object positioning.
3. Browser verification after the fix confirmed visible California and Utah images at 390 px, correct titles and active indicators, and no horizontal overflow.
4. Final full-view and focused comparisons confirm that the approved illustration/card direction is preserved while the vehicle animation is intentionally excluded.

## Final Result

final result: passed
