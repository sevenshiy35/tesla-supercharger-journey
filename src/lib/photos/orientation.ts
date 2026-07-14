export interface OrientationTransform {
  outputWidth: number;
  outputHeight: number;
  matrix: [number, number, number, number, number, number];
}
export function orientationSwapsDimensions(orientation: number) {
  return orientation >= 5 && orientation <= 8;
}

export function getOrientationTransform(
  orientation: number,
  width: number,
  height: number,
): OrientationTransform {
  switch (orientation) {
    case 2: return { outputWidth: width, outputHeight: height, matrix: [-1, 0, 0, 1, width, 0] };
    case 3: return { outputWidth: width, outputHeight: height, matrix: [-1, 0, 0, -1, width, height] };
    case 4: return { outputWidth: width, outputHeight: height, matrix: [1, 0, 0, -1, 0, height] };
    case 5: return { outputWidth: height, outputHeight: width, matrix: [0, 1, 1, 0, 0, 0] };
    case 6: return { outputWidth: height, outputHeight: width, matrix: [0, 1, -1, 0, height, 0] };
    case 7: return { outputWidth: height, outputHeight: width, matrix: [0, -1, -1, 0, height, width] };
    case 8: return { outputWidth: height, outputHeight: width, matrix: [0, -1, 1, 0, 0, width] };
    default: return { outputWidth: width, outputHeight: height, matrix: [1, 0, 0, 1, 0, 0] };
  }
}

export function calculateConstrainedDimensions(
  width: number,
  height: number,
  orientation: number,
  maxEdge: number,
) {
  const swaps = orientationSwapsDimensions(orientation);
  const orientedWidth = swaps ? height : width;
  const orientedHeight = swaps ? width : height;
  const scale = Math.min(1, maxEdge / Math.max(orientedWidth, orientedHeight));
  const scaledWidth = Math.max(1, Math.round(width * scale));
  const scaledHeight = Math.max(1, Math.round(height * scale));
  return getOrientationTransform(orientation, scaledWidth, scaledHeight);
}
