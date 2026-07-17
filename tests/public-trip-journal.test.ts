import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPromise = readFile("supabase/migrations/20260716230000_public_trip_journal.sql", "utf8");
const repositoryPromise = readFile("src/lib/trips/public-repository.ts", "utf8");
const homePromise = readFile("src/app/page.tsx", "utf8");
const navigationPromise = readFile("src/components/navigation/GlobalNavigation.tsx", "utf8");
const photosPagePromise = readFile("src/app/photos/page.tsx", "utf8");
const tripActionsPromise = readFile("src/app/admin/trip-actions.ts", "utf8");
const publicTripMapPromise = readFile("src/components/trips/PublicTripMap.tsx", "utf8");
const currentTripSectionPromise = readFile("src/components/trips/CurrentTripSection.tsx", "utf8");
const currentTripStylesPromise = readFile("src/components/trips/CurrentTripSection.module.css", "utf8");
const tripLifecyclePromise = readFile("supabase/migrations/20260717010000_complete_trip_lifecycle.sql", "utf8");

test("public homepage Trip RPC requires deliberate publication", async () => {
  const sql = await migrationPromise;
  assert.match(sql, /tp\.is_public = true/i);
  assert.match(sql, /tp\.show_on_homepage = true/i);
  assert.match(sql, /tp\.status in \('confirmed', 'active', 'completed'\)/i);
});

test("public Trip payload excludes owner and private endpoint fields", async () => {
  const sql = await migrationPromise;
  const publicFunction = sql.slice(sql.indexOf("create or replace function public.get_public_homepage_trip"), sql.indexOf("create or replace function public.admin_set_trip_publication"));
  assert.doesNotMatch(publicFunction, /'userId'|'user_id'|'originLabel'|'destinationLabel'|'fullAddress'/i);
  assert.match(publicFunction, /case when sv\.is_public = true then sv\.checked_in_at else null end/i);
});

test("public Trip RPC is anonymous-readable while publication remains authenticated-only", async () => {
  const sql = await migrationPromise;
  assert.match(sql, /grant execute on function public\.get_public_homepage_trip\(\) to anon, authenticated/i);
  assert.match(sql, /revoke all on function public\.admin_set_trip_publication[\s\S]+from public, anon/i);
  assert.match(sql, /grant execute on function public\.admin_set_trip_publication[\s\S]+to authenticated/i);
});

test("homepage replaces Latest Check-ins with the public Trip journal", async () => {
  const source = await homePromise;
  assert.match(source, /<CurrentTripSection trip=\{homepageTrip\}/);
  assert.doesNotMatch(source, /<LatestCheckIns|getLatestCheckIns/);
});

test("public Trip repository validates data before rendering", async () => {
  const source = await repositoryPromise;
  assert.match(source, /publicTripSchema\.safeParse\(data\)/);
  assert.match(source, /createPublicClient\(\)/);
  assert.doesNotMatch(source, /createClient\(|SUPABASE_SECRET_KEY|service_role/);
});

test("public Trip road geometry follows Mapbox roads using only public Station coordinates", async () => {
  const source = await repositoryPromise;
  assert.match(source, /calculateSegmentedPlannedRoute\(legs, getDrivingDirectionsForWaypoints\)/);
  assert.match(source, /unstable_cache/);
  assert.match(source, /public-trip-road-geometry-v1/);
  assert.match(source, /trip\.stops\.map\(\(\{ sequence, leg, latitude, longitude \}\)/);
  assert.doesNotMatch(source, /originLatitude|originLongitude|destinationLatitude|destinationLongitude|originLabel|destinationLabel/);
});

test("Photo journal has a dedicated public route and navigation link", async () => {
  assert.match(await photosPagePromise, /<PhotoJournal photos=\{photos\}/);
  assert.match(await navigationPromise, /copy\.navigation\.photos/);
  assert.match(await navigationPromise, /href: "\/photos"/);
});

test("homepage navigation leads with the visual Roadbook and omits redundant links", async () => {
  const source = await navigationPromise;
  assert.match(source, /copy\.navigation\.roadbook/);
  assert.match(source, /href: "\/#journey-story"/);
  assert.match(source, /grid-cols-4/);
  assert.doesNotMatch(source, /copy\.navigation\.(?:journey|statistics)|href: "\/#statistics"/);
});

test("missing Trip publication migration returns an actionable admin error", async () => {
  const source = await tripActionsPromise;
  assert.match(source, /schema cache\|could not find the function\|admin_set_trip_publication/i);
  assert.match(source, /Trip publishing is not installed yet\. Apply the latest database migration and try again\./);
});

test("Trip map is a non-interactive route-only overview", async () => {
  const source = await publicTripMapPromise;
  assert.match(source, /interactive: false/);
  assert.match(source, /ROUTE_DASH_SEQUENCE/);
  assert.match(source, /setPaintProperty\(layerId, "line-dasharray", dash\)/);
  assert.doesNotMatch(source, /line-gradient|ROUTE_MOTION_POINT_LAYER_ID|motionPointSource/);
  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.match(source, /cancelAnimationFrame\(routeAnimationFrame\)/);
  assert.doesNotMatch(source, /NavigationControl/);
  assert.doesNotMatch(source, /createPixelModelY|mapMarkerStart|timelineVehicleLabel|statusLabel/);
});

test("timeline starts at private Home and owns the white side-view Model Y progress", async () => {
  const source = await currentTripSectionPromise;
  const styles = await currentTripStylesPromise;
  assert.match(source, /\{ kind: "home", id: "home" \}/);
  assert.match(source, /showParkedCar = isHome && visitedCount === 0 && nextStop !== null/);
  assert.match(source, /carAfterStopId = nextStop && pendingStopIndex > 0/);
  assert.match(source, /showDrivingCar \? <PixelModelY motion="driving"/);
  assert.match(source, /homeLocation/);
  assert.match(source, /isHome[\s\S]+styles\.markerHome[\s\S]+styles\.markerCurrent/);
  assert.match(styles, /\.markerCurrent[\s\S]+border: 3px solid #34908b;[\s\S]+background: #fffdf2/);
  assert.doesNotMatch(styles, /\.markerCurrent::after/);
  assert.match(styles, /journey-animation\/car6-right-0\.png/);
  assert.match(source, /styles\.timelineRoad/);
  assert.match(source, /styles\.timelineRoadMarkings/);
  assert.match(source, /pb-4 pt-20/);
  assert.match(styles, /@keyframes timelineRoadFlow/);
  assert.match(styles, /\.timelineCarDriving \.timelineRoadMarkings,[\s\S]+\.timelineCarParked \.timelineRoadMarkings[\s\S]+animation: timelineRoadFlow/);
  assert.match(styles, /\.timelineRoad[\s\S]+background: transparent/);
  assert.match(styles, /background: repeating-linear-gradient\(90deg, #8da6a1[\s\S]+top \/ 28px 2px repeat-x/);
  assert.doesNotMatch(styles, /linear-gradient\(90deg, #587b76, #587b76\)/);
  assert.doesNotMatch(styles, /#d4b66d|skewX/);
  assert.doesNotMatch(styles, /background: #3f5754/);
  assert.match(styles, /\.mapMarkerCurrent[\s\S]+background: #34908b;[\s\S]+box-shadow: 0 3px 12px/);
  assert.doesNotMatch(styles, /currentMarkerPulse/);
  assert.match(styles, /@keyframes timelineModelYFrames/);
  assert.match(styles, /@keyframes timelineModelYRoadBounce/);
  assert.doesNotMatch(source, /timelineSpeedLines/);
  assert.match(styles, /prefers-reduced-motion[\s\S]+\.timelineCarParked \.timelineRoadMarkings/);
  assert.doesNotMatch(styles, /animation: timelineCarDrive/);
  assert.match(styles, /--mobile-timeline-rail: 62px/);
  assert.match(styles, /\.timelineCarParked\s*\{[\s\S]+left: var\(--mobile-timeline-rail\)/);
});

test("public Trip map markers scale down with the mobile route map", async () => {
  const styles = await currentTripStylesPromise;
  assert.match(styles, /\.mapMarker\s*\{[\s\S]+width: clamp\(16px, 4vw, 22px\);[\s\S]+height: clamp\(16px, 4vw, 22px\);/);
  assert.match(styles, /@media \(max-width: 767px\)[\s\S]+\.mapMarker\s*\{[\s\S]+border-width: 2px;/);
});

test("the final Check-in completes the Trip without unpublishing it", async () => {
  const sql = await tripLifecyclePromise;
  const completionUpdate = sql.slice(sql.indexOf("if v_trip_completed then"), sql.indexOf("elsif v_trip_status = 'confirmed'"));
  assert.match(completionUpdate, /set status = 'completed'/i);
  assert.match(completionUpdate, /completed_at = coalesce\(tp\.completed_at, now\(\)\)/i);
  assert.doesNotMatch(completionUpdate, /show_on_homepage|is_public/i);
});

test("deleting the final Check-in reopens the Trip without changing publication", async () => {
  const sql = await tripLifecyclePromise;
  const resetFunction = sql.slice(sql.indexOf("create or replace function public.reset_trip_stop_on_visit_delete"), sql.indexOf("-- Backfill"));
  assert.match(resetFunction, /set status = 'active',[\s\S]+completed_at = null/i);
  assert.doesNotMatch(resetFunction, /show_on_homepage|is_public/i);
});

test("a completed homepage Trip remains selected until another Trip is published", async () => {
  const publicationSql = await migrationPromise;
  assert.match(publicationSql, /tp\.status in \('confirmed', 'active', 'completed'\)/i);
  assert.match(publicationSql, /if p_show_on_homepage then[\s\S]+set show_on_homepage = false[\s\S]+tp\.id <> v_plan\.id/i);
  assert.match(await currentTripSectionPromise, /isComplete \? copy\.trip\.completeEyebrow : copy\.trip\.eyebrow/);
});
