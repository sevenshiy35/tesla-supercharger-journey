# Liquid Glass design system

## Prototype scope

The production prototype is intentionally limited to the homepage global navigation, Hero content card, and `ProgressStats`. The editorial journey gallery, map controls, landmark captions, dialogs, admin tools, and every other page retain their existing materials. The next rollout should use the same primitive selectively rather than turning content containers into glass.

The material is a functional floating layer, not a page background. Dense metric rows remain opaque inside the glass statistics shell so numbers do not compete with the layer behind them.

## Architecture

- `src/styles/liquid-glass-tokens.css` is the only source of material values: blur, saturation, environment tint, opacity, border and highlight color, radius, shadow, fallback color, focus ring, press scale, duration, and easing.
- `src/components/ui/LiquidGlass.tsx` provides the polymorphic component, the public variants, environment and radius controls, contrast strengthening, reduced-transparency mode, and requestAnimationFrame-throttled pointer highlight coordinates.
- `src/components/ui/LiquidGlass.module.css` builds the material from the centralized tokens. It owns variants, directional highlights, inner light, external elevation, fallbacks, reduced motion, reduced transparency, and the mobile optical adjustment.

## Component API

```tsx
<LiquidGlass
  as="nav"
  variant="elevated"
  environment="warm"
  radius="pill"
  busyBackground
  trackPointer
>
  ...
</LiquidGlass>
```

Variants:

- `regular`: balanced material for ordinary floating surfaces.
- `clear`: lighter optical presence; reserve it for large text and simple controls over calm backgrounds.
- `elevated`: stronger blur, opacity, and shadow for navigation and floating panels.
- `interactive`: includes the restrained pressed compression and is the default pointer-tracked variant.
- `dark`: a high-contrast dark material for deep teal or night environments.

Environment values are `neutral`, `warm`, and `teal`. They provide both light and dark tint pairs, so the dark variant still adapts to its surroundings. Radius values are `panel`, `compact`, and `pill`.

`busyBackground` raises the material opacity to the centralized busy-scene values. Use it when a surface crosses photography, maps, or high-frequency illustration. `reducedTransparency` forces the solid fallback on one instance. The global `liquid-glass-reduced-transparency` class can be placed on a surface or ancestor to disable transparency for a subtree. The component also honors the `prefers-reduced-transparency` media query where the browser exposes it.

The component adds an internal content wrapper for reliable highlight layering. Native `button` and `a` surfaces automatically use a `span`; custom link components should pass `contentAs="span"` when phrasing-only markup is required.

## Interaction and accessibility

- Pointer movement updates only two CSS custom properties, throttled to one update per animation frame. It moves a quiet highlight and never changes the material shape.
- Interactive surfaces compress to `0.985` while pressed. There is no wobble, spring, blob, or continuously running filter animation.
- Reduced-motion mode removes highlight motion and pressed transforms.
- Existing global keyboard focus rings remain intact. The interactive variant adds a material-aware ring when the glass surface itself is focusable.
- The navigation remains links and buttons, connects toggle buttons to their controlled regions, exposes expanded state, and closes with Escape.
- Small supporting labels on the dark statistics surface were strengthened. The data grid uses opaque `tile-2`, not clear glass.

## Responsive and performance behavior

The existing Tailwind breakpoints remain unchanged: `sm` 640px, `md` 768px, `lg` 1024px, and `xl` 1280px. Below 768px, blur drops to 14px and saturation to 135%. No full-screen filter, WebGL material, or continuous animation was introduced.

Each prototype region uses one backdrop-filter surface. The Hero content card is spatially separate from the navigation, and its nested buttons do not add another filter. Controls nested inside the navigation and metric rows nested inside statistics use ordinary translucent or opaque paint without another backdrop filter. The mobile menu is a sibling surface below the navigation rather than a nested blur layer.

## Browser fallbacks

- Browsers without `backdrop-filter` receive a near-opaque environment-matched background and keep the border, inner highlight, and shadow.
- Reduced-transparency mode uses the same solid environment fallback and removes the pointer highlight.
- Standard `border-radius` is the baseline. Browsers that support `corner-shape: squircle` receive continuous corners progressively.
- `-webkit-backdrop-filter` is included for Safari.

## Remaining limitations and rollout notes

- Busy-background strengthening is context-driven through `busyBackground`; the component does not sample image luminance at runtime. Runtime sampling would add cost and can produce unstable contrast while images move.
- `prefers-reduced-transparency` is not exposed by every browser, so the explicit prop and global class remain necessary fallbacks.
- Continuous squircle corners depend on emerging browser support; ordinary rounded corners are the visual fallback.
- Map controls, landmark captions, dialogs, and suitable admin controls are candidates for later, component-by-component adoption. Long-form copy, photo stories, tables, and dense lists should not be migrated.
