"use client";

import {
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type ElementType,
  type PointerEventHandler,
  useEffect,
  useRef,
} from "react";
import styles from "./LiquidGlass.module.css";

export type LiquidGlassVariant = "regular" | "clear" | "elevated" | "interactive" | "dark";
export type LiquidGlassEnvironment = "neutral" | "warm" | "teal";
export type LiquidGlassRadius = "panel" | "compact" | "pill";
export type LiquidGlassOptics = "standard" | "cinematic";

interface LiquidGlassOwnProps {
  variant?: LiquidGlassVariant;
  environment?: LiquidGlassEnvironment;
  radius?: LiquidGlassRadius;
  optics?: LiquidGlassOptics;
  busyBackground?: boolean;
  reducedTransparency?: boolean;
  trackPointer?: boolean;
  className?: string;
  contentClassName?: string;
  contentAs?: "div" | "span";
  children?: React.ReactNode;
  style?: CSSProperties;
  onPointerMove?: PointerEventHandler<HTMLElement>;
  onPointerLeave?: PointerEventHandler<HTMLElement>;
}

export type LiquidGlassProps<T extends ElementType = "div"> = LiquidGlassOwnProps & {
  as?: T;
} & Omit<ComponentPropsWithoutRef<T>, keyof LiquidGlassOwnProps | "as">;

const variantClasses: Record<LiquidGlassVariant, string> = {
  regular: styles.regular,
  clear: styles.clear,
  elevated: styles.elevated,
  interactive: styles.interactive,
  dark: styles.dark,
};

const environmentClasses: Record<LiquidGlassEnvironment, string> = {
  neutral: styles.environmentNeutral,
  warm: styles.environmentWarm,
  teal: styles.environmentTeal,
};

const radiusClasses: Record<LiquidGlassRadius, string> = {
  panel: styles.radiusPanel,
  compact: styles.radiusCompact,
  pill: styles.radiusPill,
};

const opticsClasses: Record<LiquidGlassOptics, string | undefined> = {
  standard: undefined,
  cinematic: styles.opticsCinematic,
};

function cx(...classNames: Array<string | false | undefined>) {
  return classNames.filter(Boolean).join(" ");
}

export function LiquidGlass<T extends ElementType = "div">({
  as,
  variant = "regular",
  environment = "neutral",
  radius = "panel",
  optics = "standard",
  busyBackground = false,
  reducedTransparency = false,
  trackPointer,
  className,
  contentClassName,
  contentAs,
  children,
  style,
  onPointerMove,
  onPointerLeave,
  ...restProps
}: LiquidGlassProps<T>) {
  const Component = (as ?? "div") as ElementType;
  const Content = contentAs ?? (as === "button" || as === "a" ? "span" : "div");
  const frameRef = useRef<number | null>(null);
  const pointerRef = useRef<{ element: HTMLElement; clientX: number; clientY: number } | null>(null);
  const shouldTrackPointer = trackPointer ?? variant === "interactive";

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  const handlePointerMove: PointerEventHandler<HTMLElement> = (event) => {
    onPointerMove?.(event);
    if (!shouldTrackPointer || event.defaultPrevented) {
      return;
    }

    pointerRef.current = {
      element: event.currentTarget,
      clientX: event.clientX,
      clientY: event.clientY,
    };

    if (frameRef.current !== null) {
      return;
    }

    frameRef.current = window.requestAnimationFrame(() => {
      const pointer = pointerRef.current;
      frameRef.current = null;

      if (!pointer) {
        return;
      }

      const bounds = pointer.element.getBoundingClientRect();
      const x = ((pointer.clientX - bounds.left) / bounds.width) * 100;
      const y = ((pointer.clientY - bounds.top) / bounds.height) * 100;
      pointer.element.style.setProperty("--liquid-glass-pointer-x", `${x.toFixed(2)}%`);
      pointer.element.style.setProperty("--liquid-glass-pointer-y", `${y.toFixed(2)}%`);
    });
  };

  const handlePointerLeave: PointerEventHandler<HTMLElement> = (event) => {
    onPointerLeave?.(event);
    pointerRef.current = null;
    event.currentTarget.style.removeProperty("--liquid-glass-pointer-x");
    event.currentTarget.style.removeProperty("--liquid-glass-pointer-y");
  };

  return (
    <Component
      {...restProps}
      className={cx(
        styles.surface,
        variantClasses[variant],
        environmentClasses[environment],
        radiusClasses[radius],
        opticsClasses[optics],
        shouldTrackPointer && styles.pointerTracked,
        busyBackground && styles.busyBackground,
        reducedTransparency && styles.reducedTransparency,
        className,
      )}
      data-liquid-glass={variant}
      data-liquid-glass-optics={optics}
      data-busy-background={busyBackground || undefined}
      data-reduced-transparency={reducedTransparency || undefined}
      style={style}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      <Content className={cx(styles.content, contentClassName)}>{children}</Content>
    </Component>
  );
}
