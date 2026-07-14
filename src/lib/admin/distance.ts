const EARTH_RADIUS_MILES = 3_958.7613;

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function haversineMiles(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
) {
  const latitudeDelta = toRadians(latitudeB - latitudeA);
  const longitudeDelta = toRadians(longitudeB - longitudeA);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(latitudeA)) *
      Math.cos(toRadians(latitudeB)) *
      Math.sin(longitudeDelta / 2) ** 2;

  return 2 * EARTH_RADIUS_MILES * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDistance(distanceMiles: number) {
  if (distanceMiles < 0.1) {
    return `${Math.max(1, Math.round(distanceMiles * 5_280)).toLocaleString("en-US")} ft`;
  }

  if (distanceMiles < 1) {
    return `${distanceMiles.toFixed(1)} mi`;
  }

  return `${distanceMiles.toFixed(distanceMiles < 10 ? 1 : 0)} mi`;
}
