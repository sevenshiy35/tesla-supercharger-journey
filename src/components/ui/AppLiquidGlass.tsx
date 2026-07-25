"use client";

import dynamic from "next/dynamic";
import {
  Component,
  type ComponentPropsWithoutRef,
  type ElementType,
  type ReactNode,
} from "react";
import styles from "./AppLiquidGlass.module.css";

const LiquidGlass = dynamic(() => import("liquid-glass-react"), {
  ssr: false,
  loading: () => null,
});

type AppLiquidGlassVariant = "navigation" | "hero" | "imageInfo";

const variantConfig: Record<
  AppLiquidGlassVariant,
  {
    displacementScale: number;
    blurAmount: number;
    saturation: number;
    aberrationIntensity: number;
    cornerRadius: number;
  }
> = {
  navigation: {
    displacementScale: 46,
    blurAmount: 0.08,
    saturation: 118,
    aberrationIntensity: 0.9,
    cornerRadius: 999,
  },
  hero: {
    displacementScale: 40,
    blurAmount: 0.075,
    saturation: 116,
    aberrationIntensity: 0.75,
    cornerRadius: 30,
  },
  imageInfo: {
    displacementScale: 34,
    blurAmount: 0.08,
    saturation: 114,
    aberrationIntensity: 0.65,
    cornerRadius: 24,
  },
};

interface AppLiquidGlassOwnProps {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  variant: AppLiquidGlassVariant;
}

type AppLiquidGlassProps<T extends ElementType = "div"> = AppLiquidGlassOwnProps & {
  as?: T;
} & Omit<ComponentPropsWithoutRef<T>, keyof AppLiquidGlassOwnProps | "as">;

interface EffectBoundaryState {
  failed: boolean;
}

class EffectBoundary extends Component<{ children: ReactNode }, EffectBoundaryState> {
  state: EffectBoundaryState = { failed: false };

  static getDerivedStateFromError(): EffectBoundaryState {
    return { failed: true };
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function cx(...classNames: Array<string | undefined>) {
  return classNames.filter(Boolean).join(" ");
}

export function AppLiquidGlass<T extends ElementType = "div">({
  as,
  children,
  className,
  contentClassName,
  variant,
  ...restProps
}: AppLiquidGlassProps<T>) {
  const Root = (as ?? "div") as ElementType;
  const enabled = process.env.NEXT_PUBLIC_ENABLE_LIQUID_GLASS !== "false";
  const config = variantConfig[variant];

  return (
    <Root
      {...restProps}
      className={cx(styles.root, styles[variant], className)}
      data-app-liquid-glass={enabled ? variant : undefined}
    >
      <div aria-hidden className={styles.fallback} />

      {enabled ? (
        <EffectBoundary>
          <div aria-hidden className={styles.effect}>
            <LiquidGlass
              displacementScale={config.displacementScale}
              blurAmount={config.blurAmount}
              saturation={config.saturation}
              aberrationIntensity={config.aberrationIntensity}
              elasticity={0}
              cornerRadius={config.cornerRadius}
              mode="standard"
              padding="0px"
              className={styles.libraryGlass}
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                width: "100%",
              }}
            >
              <span className={styles.effectSizer} />
            </LiquidGlass>
          </div>
        </EffectBoundary>
      ) : null}

      <div className={cx(styles.content, contentClassName)}>{children}</div>
    </Root>
  );
}
