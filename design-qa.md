# Design QA — Homepage hero redesign

## Comparison target

- Source visual truth: `C:/Users/Seven/Downloads/ChatGPT Image 2026年7月17日 01_21_05.png`
- Supplied background asset: `C:/Users/Seven/Downloads/ChatGPT Image 2026年7月17日 01_18_28.png`
- Final desktop implementation screenshot: `design-qa-artifacts/home-hero-desktop-1717-final-v3.png`
- Final mobile implementation screenshot: `design-qa-artifacts/home-hero-mobile-390-final-v2.png`
- Full-view comparison evidence: `design-qa-artifacts/home-hero-comparison-full-final.png`
- Focused card comparison evidence: `design-qa-artifacts/home-hero-comparison-focused-final.png`
- Desktop layout viewport: 1717 × 916, English, homepage at rest.
- Mobile layout viewport: 390 × 844, English, homepage at rest.
- Scope constraint: the existing navigation UI is intentionally unchanged, so navigation styling differences from the source image are excluded from fidelity findings.

The in-app browser laid out the desktop page at 1717 × 916 and reported the final hero card at x 179, y 312, 544 × 372. Its screenshot surface captured the visible browser panel, so the full comparison uses the corresponding source crop at the same pixel scale. The focused comparison isolates the card at matching coordinates.

## Findings

No actionable P0, P1, or P2 differences remain.

- Fonts and typography: the existing serif display face and UI sans stack preserve the reference hierarchy. The final English tagline wraps to two lines, and no text clips or truncates in either checked viewport.
- Spacing and layout rhythm: the final desktop card is within 1–2 px of the source position and dimensions. Its internal left edge, eyebrow, title, tagline, and button row align with the focused reference comparison. The 390 px layout has no horizontal overflow and stacks the CTAs cleanly.
- Colors and visual tokens: the warm, nearly opaque card surface and existing teal brand tokens match the reference direction while remaining consistent with the current site system.
- Image quality and asset fidelity: the implementation uses the user's supplied second image directly through the framework image pipeline. Desktop uses bottom-centered cover cropping so the full car remains visible; mobile shifts the focal point to keep the vehicle recognizable behind the card.
- Copy and content: all existing bilingual hero copy and CTA labels are preserved. The English state matches the source copy exactly.
- Interaction and console checks: language switching, `Explore the Map`, and `View Progress` were exercised. Both CTAs reached their intended anchors. The final clean browser load produced no console errors or warnings attributable to this change.

## Comparison history

1. Initial implementation — `design-qa-artifacts/home-hero-desktop-1717-en.png`
   - Earlier P2: the English tagline wrapped to three lines, making the card about 391 px tall and placing its top roughly 33 px above the source.
   - Fix: reduced the large tagline optical width, constrained the card to the source dimensions, and adjusted its desktop vertical offset.
   - Post-fix evidence: `design-qa-artifacts/home-hero-desktop-1717-final-v2.png`; the tagline wrapped to two lines and the card outer bounds matched the source.
2. Focused rhythm pass — `design-qa-artifacts/home-hero-comparison-focused-final.png`
   - Earlier P2: the post-fix button row remained about 20 px too high because the card's internal vertical gaps were compressed.
   - Fix: matched the eyebrow-to-title, title-to-tagline, and tagline-to-buttons spacing, then tuned the card padding and surface opacity.
   - Post-fix evidence: `design-qa-artifacts/home-hero-desktop-1717-final-v3.png`; measured card x 179, y 312, 544 × 372, with the button row at y 591.

## Open questions

- None for the requested scope. The navigation remains intentionally untouched.

## Implementation checklist

- [x] Use the supplied second image as the hero background.
- [x] Match the first image's desktop card placement and proportions.
- [x] Preserve the navigation UI.
- [x] Verify English and Chinese hero states.
- [x] Verify desktop and 390 px mobile layouts.
- [x] Verify primary hero CTA anchors and final console state.

## Follow-up polish

- P3: additional art-direction breakpoints could be added later for unusually wide or short laptop viewports, but the checked desktop and mobile states require no blocking changes.

final result: passed
