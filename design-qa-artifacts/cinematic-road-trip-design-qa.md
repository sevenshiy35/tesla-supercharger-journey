# Cinematic Road Trip Prototype — Design QA

## Evidence

- Source visual truth: `C:\Users\Seven\Downloads\ChatGPT Image 2026年7月14日 12_18_26 (1).png` (New York desktop) and `C:\Users\Seven\Downloads\ChatGPT Image 2026年7月14日 12_18_26 (4).png` (New York mobile bridge crop)
- Browser-rendered implementation: `design-qa-artifacts/cinematic-road-trip-desktop-1440-final-v3.png`
- Scene checks: `design-qa-artifacts/cinematic-road-trip-desktop-california.png` and `design-qa-artifacts/cinematic-road-trip-desktop-utah-final-v3.png`
- Responsive checks: `design-qa-artifacts/cinematic-road-trip-1280-interactions.png`, `design-qa-artifacts/cinematic-road-trip-tablet-1024-final.png`, `design-qa-artifacts/cinematic-road-trip-tablet-768-final.png`, `design-qa-artifacts/cinematic-road-trip-mobile-430-final-v2.png`, and `design-qa-artifacts/cinematic-road-trip-mobile-390-final.png`
- Normalized full-scene comparison: `design-qa-artifacts/cinematic-road-trip-comparison-final.png`
- Focused bridge/vehicle comparison: `design-qa-artifacts/cinematic-road-trip-focused-comparison-final.png`
- Previous root QA report archive: `design-qa-artifacts/design-qa-before-cinematic-road-trip.md`
- Viewports: 1440 × 900, 1280 × 800, 1024 × 768, 768 × 900, 430 × 932, and 390 × 844
- State: mock 2026 journey statistics; New York, California, and Utah scenes; normal and fast playback; environment motion on and off; automatic and paused playback

The comparison artifacts place the supplied illustration on the left and the live browser render on the right. The focused comparison isolates the Brooklyn Bridge approach and animated Model Y alignment.

## Findings

- No actionable P0, P1, or P2 mismatches remain.
- New York preserves the supplied blue-hour illustration, landmark density, indigo/coral palette, and bridge approach while adding the readable editorial overlay and vehicle layer.
- California maintains the requested cool-water/warm-sky contrast, moving fog, foreground coastal road, and side-front vehicle perspective.
- Utah maintains the requested red-orange/violet canyon depth, heat shimmer, cloud shadow, and far-to-near road perspective.
- The car remains visually attached to a road in all three final scene captures. The vehicle path, perspective scale, and body rotation read as one continuous drive-through rather than a floating overlay.
- Desktop information blocks stay inside the scene without obscuring the primary road. At 760 px and below, copy and statistics move outside the illustration, preserving the 4:5 scene crop and readable text.
- Horizontal overflow is absent at all required widths. At 1280 px, the browser reported `innerWidth: 1280` and document `scrollWidth: 1265` (the 15 px difference is the vertical scrollbar).

## Required Fidelity Surfaces

- **Typography:** Georgia-led cinematic serif headings pair with compact system sans-serif labels and controls. The hierarchy is deliberate and remains readable against the scene veil.
- **Spacing and composition:** Desktop uses a single 16:9 rounded scene; tablet uses a 4:3 scene; mobile uses a tall 4:5-style crop with cards below. Scene title, counter, and indicators remain separated from the intro/stat cards.
- **Color:** Deep navy framing, ivory glass cards, muted copper labels, and scene-specific blue/coral or red/violet palettes match the supplied travel-poster mood.
- **Image quality:** All visible scenes and vehicles are real local image assets. No placeholder boxes, emoji, CSS drawings, text glyphs, or approximate inline SVGs are used.
- **Copy:** The requested intro, mock statistics, scene titles, and preview-only control labels are present and legible.
- **Controls:** Auto Play, Pause, Restart Scene, speed selection, environment motion, scene buttons, and indicators are keyboard-focusable native buttons with clear labels and pressed states.
- **Motion:** Scene reveal/depart, vehicle movement, suspension, and ambient layers are CSS-driven. React state changes only at scene/control boundaries. `prefers-reduced-motion` disables autoplay and leaves a static vehicle composition while retaining manual controls.

## Runtime Checks

- New York, California, and Utah scene selection works.
- Pause, restart, fast speed, environment motion off, and automatic playback resume work in the browser-rendered prototype.
- The next scene is preloaded; only active/outgoing scene layers render during crossfade.
- Browser console warnings and errors after the final interaction pass: none.
- ESLint, TypeScript, and the production Next.js build pass.

## Comparison History

1. Initial New York motion placed the vehicle too close to open water; the route was redirected onto the Brooklyn Bridge approach.
2. Desktop comparison showed the bridge car slightly above the deck; keyframe Y values and perspective scale were corrected.
3. The general New York crop did not preserve enough bridge road on narrow screens; a dedicated mobile bridge crop and mobile-only path were added.
4. California comparison confirmed the foreground coastal route, so only scale and turn easing were retained.
5. Utah comparison showed the vehicle below the distant road; the entire far-to-near canyon path was moved upward and rechecked in the browser.
6. Final combined comparisons confirm source fidelity, readable overlays, and road-attached vehicle motion without introducing homepage or production-data changes.

## Final Result

final result: passed
