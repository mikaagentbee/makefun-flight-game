// The sortie itself: one world holds the terrain, the plane, the mission and
// the score, and steps them together. It judges rings, landings, scrapes and
// crashes, and reports each as an event the main loop turns into sound and text.

import { COURSE, DAMAGE, LANDING, PLANE, STEP } from './config.js';
import { createAircraft, landingQuality, stepAircraft } from './aircraft.js';
import { buildMission, nextRing, overRunway } from './missions.js';

export const EVENT_RING = 1;
export const EVENT_SCRAPE = 2;
export const EVENT_LAND = 4;
export const EVENT_CRASH = 8;
export const EVENT_FUEL = 16;
export const EVENT_COMPLETE = 32;
export const EVENT_TIME = 64;
export const EVENT_STALL = 128;

/** Clamp a value into [min, max]. */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** The signed angle from `from` to `to`, in (-PI, PI]. */
function angleDifference(to, from) {
  let difference = to - from;
  while (difference > Math.PI) difference -= Math.PI * 2;
  while (difference <= -Math.PI) difference += Math.PI * 2;
  return difference;
}

/** Create a fresh world for a mission id and seed. */
export function createWorld(terrain, missionDef) {
  const mission = buildMission(missionDef, terrain);
  const plane = createAircraft();
  // The tank is the mission's, not the default: a courier flies on 72, not 100.
  plane.fuel = mission.fuel;
  return {
    terrain,
    mission,
    plane,
    phase: 'title',
    outcome: null,
    message: '',
    messageUntil: 0,
    time: 0,
    stallWarnedAt: -10,
  };
}

/** Reset a world to the start of a mission, ready to fly. Pass a mission def to switch sorties. */
export function resetWorld(world, missionDef) {
  const terrain = world.terrain;
  const def = missionDef ?? {
    id: world.mission.id,
    name: world.mission.name,
    tag: world.mission.tag,
    brief: world.mission.brief,
    rings: world.mission.rings.length,
    landing: world.mission.landing,
    fuel: world.mission.fuel,
    timeLimit: world.mission.timeLimit,
    gusts: world.mission.gusts,
  };
  const fresh = createWorld(terrain, def);
  Object.assign(world, fresh);
  world.phase = 'play';
}

/** The wind this step: nothing in calm air, shoving gusts in a storm. */
export function gustAt(world) {
  if (!world.mission.gusts) return { roll: 0, lift: 0 };
  const t = world.time;
  return {
    roll: Math.sin(t * 0.9) * 0.55 + Math.sin(t * 2.7) * 0.3,
    lift: Math.sin(t * 0.6 + 1.3) * 1.6,
  };
}

/**
 * A simple pilot for the staged screenshots: steer at the next ring (or the far
 * strip), hold a safe height over the ground, and keep the throttle honest.
 */
export function autopilot(world) {
  const plane = world.plane;
  const mission = world.mission;
  const ring = nextRing(mission);
  const ground = world.terrain.heightAt(plane.x, plane.z);
  let targetX = 0;
  let targetZ = mission.targetRunway.z;
  let targetY = 120;
  let wantHeight;
  let throttle = 0.68;
  let flaps = false;
  if (ring) {
    targetX = ring.x;
    targetZ = ring.z;
    targetY = ring.y;
    wantHeight = targetY;
  } else if (mission.landing) {
    const distanceToStrip = targetZ - plane.z;
    if (plane.z > mission.targetRunway.z + COURSE.runwayHalfLength + 100) {
      // Past the far end of the strip: go around — climb and aim back at a
      // point short of it for another approach.
      targetZ = mission.targetRunway.z - 1200;
      wantHeight = 90;
      throttle = 0.6;
    } else if (distanceToStrip < 2500) {
      // On final: aim for the threshold, not the middle of the strip — a plane
      // that aims at the centre overflies it before it can get down. A steady
      // glide slope, slow, flaps down. The slope aims below the ground: a floor
      // at 2 m would level the plane off just above the wheels, never touching.
      targetZ = mission.targetRunway.z - 150;
      wantHeight = clamp((targetZ - plane.z) * 0.08, -2, 120);
      throttle = 0.42;
      flaps = true;
    } else {
      wantHeight = ground + 80;
    }
  } else {
    wantHeight = Math.max(ground + 55, 70);
  }
  const desiredHeading = Math.atan2(targetX - plane.x, targetZ - plane.z);
  let headingError = angleDifference(desiredHeading, plane.heading);
  // On short final over the strip, fly straight: the touchdown point is wherever
  // the descent meets the runway, and chasing a fixed point once it slips behind
  // the nose only spins the plane around it.
  if (mission.landing && !ring && overRunway(plane, mission.targetRunway) && plane.y < 30) {
    headingError = 0;
  }
  // A PD steer: bank toward the error, and ease off as the bank builds, so the
  // turn converges instead of winding up into a spiral. The damping is light
  // on purpose — a heavy hand makes the recovery lag a whole valley behind.
  const roll = clamp(headingError * 1.6 - plane.roll * 0.3, -1, 1);
  const heightError = wantHeight - plane.y;
  // On final the pitch answers harder and caps its dive: a firm, steady
  // descent that actually meets the runway instead of levelling off above it.
  const onFinal = !ring && mission.landing && mission.targetRunway.z - plane.z < 2500;
  const pitch = onFinal
    ? clamp(heightError * 0.04, -0.35, 0.5)
    : clamp(heightError * 0.015, -1, 1);
  return { pitch, roll, throttle, flaps };
}

/**
 * Step the world one fixed step while flying. `stick` and `throttleDelta` come
 * from the input (or the autopilot). Returns an event bitmask.
 */
export function stepWorld(world, stick, throttleDelta, dt = STEP) {
  const plane = world.plane;
  const mission = world.mission;
  const terrain = world.terrain;
  let events = 0;
  world.time += dt;
  mission.elapsed += dt;

  const gust = gustAt(world);
  const previousZ = plane.z;
  stepAircraft(plane, stick, throttleDelta, gust, dt);

  // The clock: a sortie that runs out of time ends, scored or not.
  if (mission.elapsed >= mission.timeLimit) {
    world.phase = 'done';
    world.outcome = {
      type: 'time',
      title: 'OUT OF TIME',
      detail: `The clock ran out with ${mission.rings.length - mission.ringIndex} ring${mission.rings.length - mission.ringIndex === 1 ? '' : 's'} still to fly.`,
      score: mission.score,
    };
    return EVENT_TIME;
  }

  // Rings: crossing the ring's plane inside its circle threads it; crossing
  // outside it misses it, and the sortie moves on to the next one — a missed
  // ring is never chased backwards.
  const ring = nextRing(mission);
  if (ring && previousZ < ring.z && plane.z >= ring.z) {
    const dx = plane.x - ring.x;
    const dy = plane.y - ring.y;
    if (Math.hypot(dx, dy) <= ring.radius) {
      ring.passed = true;
      mission.ringIndex += 1;
      mission.score += 100;
      events |= EVENT_RING;
      world.message = `RING ${mission.ringIndex}/${mission.rings.length}  +100`;
      world.messageUntil = world.time + 2;
      if (mission.ringIndex === mission.rings.length && !mission.landing) {
        world.phase = 'done';
        mission.score += Math.max(0, Math.round((mission.timeLimit - mission.elapsed) * 2));
        world.outcome = {
          type: 'rings',
          title: 'COURSE COMPLETE',
          detail: `All ${mission.rings.length} rings threaded with ${Math.round(mission.timeLimit - mission.elapsed)}s to spare.`,
          score: mission.score,
        };
        return events | EVENT_COMPLETE;
      }
    } else {
      ring.missed = true;
      mission.ringIndex += 1;
      mission.ringsMissed = (mission.ringsMissed ?? 0) + 1;
      world.message = `RING MISSED — ${mission.rings.length - mission.ringIndex} left`;
      world.messageUntil = world.time + 2;
      if (mission.ringIndex === mission.rings.length && !mission.landing) {
        world.phase = 'done';
        world.outcome = {
          type: 'rings',
          title: 'COURSE COMPLETE',
          detail: `${mission.rings.length - mission.ringsMissed} of ${mission.rings.length} rings threaded.`,
          score: mission.score,
        };
        return events | EVENT_COMPLETE;
      }
    }
  }

  // The ground: the runway forgives a gentle arrival, everything else does not.
  // A plane on its wheels stays pinned to the strip until it has rotation speed
  // and is climbing — it never lifts off below stall speed just because a gust
  // or an early pull shoved it a metre up.
  const ground = terrain.heightAt(plane.x, plane.z);
  const clearance = plane.y - ground;
  if (plane.grounded) {
    plane.y = ground + 1.2;
    if (plane.speed >= PLANE.stallSpeed * 1.05 && plane.verticalSpeed > 0.5) {
      plane.grounded = false;
    }
    return events;
  }
  if (clearance <= 1.2) {
    const onRunway = overRunway(plane, mission.targetRunway) || overRunway(plane, mission.startRunway);
    const quality = landingQuality(plane);
    if (onRunway && quality.sinkOk && quality.speedOk && quality.attitudeOk) {
      plane.grounded = true;
      plane.y = ground + 1.2;
      plane.pitch = 0;
      plane.roll = 0;
      events |= EVENT_LAND;
      world.message = 'TOUCHDOWN — nice and gentle';
      world.messageUntil = world.time + 2.5;
      // Only the far strip completes a landing sortie: a gentle arrival back on
      // Kestrel Field is just a touchdown, and the plane can lift off again.
      if (mission.landing && overRunway(plane, mission.targetRunway)) {
        const centreBonus = Math.max(0, Math.round((1 - Math.abs(plane.x) / COURSE.runwayHalfWidth) * 150));
        const gentleBonus = Math.max(0, Math.round((1 - Math.abs(plane.verticalSpeed) / LANDING.maxSink) * 150));
        const fuelBonus = Math.round(plane.fuel * 2);
        mission.score += 200 + centreBonus + gentleBonus + fuelBonus;
        world.phase = 'done';
        world.outcome = {
          type: 'landed',
          title: 'LANDED AT MERAPI STRIP',
          detail: `Centreline +${centreBonus} · gentle +${gentleBonus} · fuel left +${fuelBonus}. The parcel is delivered.`,
          score: mission.score,
        };
        return events | EVENT_COMPLETE;
      }
    } else if (onRunway && plane.verticalSpeed > -6 && plane.speed < 60) {
      // A hard runway arrival: a bounce and a bill for the airframe.
      plane.integrity -= DAMAGE.hardBounce;
      plane.grounded = true;
      plane.y = ground + 1.2;
      plane.speed *= 0.75;
      events |= EVENT_SCRAPE;
      world.message = 'HARD LANDING — airframe damaged';
      world.messageUntil = world.time + 2;
    } else if (plane.verticalSpeed > -4 && plane.speed < 45) {
      // A shallow scrape off the strip: survivable, expensive, and slow.
      plane.integrity -= DAMAGE.scrape;
      plane.grounded = true;
      plane.y = ground + 1.2;
      plane.speed *= 0.7;
      events |= EVENT_SCRAPE;
      world.message = 'TERRAIN SCRAPE — integrity down';
      world.messageUntil = world.time + 2;
    } else {
      world.phase = 'done';
      const reason = plane.verticalSpeed <= -4
        ? `Hit the ground at ${Math.round(-plane.verticalSpeed * 3.28)} ft/s down.`
        : `Hit the ridge at ${Math.round(plane.speed * 1.94)} kt.`;
      world.outcome = {
        type: 'crashed',
        title: 'CRASHED',
        detail: reason,
        score: mission.score,
      };
      return events | EVENT_CRASH;
    }
  }

  // A dead airframe is a crash, wherever it happens.
  if (plane.integrity <= 0) {
    plane.integrity = 0;
    world.phase = 'done';
    world.outcome = {
      type: 'crashed',
      title: 'AIRFRAME GAVE OUT',
      detail: 'Too many scrapes — the Kestrel came apart in the air.',
      score: mission.score,
    };
    return events | EVENT_CRASH;
  }

  // An empty tank is a glide: land it on a strip or walk home.
  if (plane.engineOut && !(events & EVENT_FUEL)) {
    events |= EVENT_FUEL;
    world.message = 'FUEL EMPTY — engine out, glide for a strip';
    world.messageUntil = world.time + 3;
  }

  // Stall warnings, throttled so the beep does not machine-gun.
  if (plane.stalled && world.time - world.stallWarnedAt > 1.2) {
    world.stallWarnedAt = world.time;
    events |= EVENT_STALL;
  }
  return events;
}
