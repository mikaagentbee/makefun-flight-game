// The Kestrel-9 bush plane: an arcade flight model with real discipline in it.
// Throttle sets a target speed, the stick sets a target pitch and bank, a
// coordinated turn follows the bank, and below stall speed the wing gives up and
// the nose drops. Flaps trade top speed for a lower stall speed on approach.

import { FUEL, LANDING, PLANE } from './config.js';

/** Clamp a value into [min, max]. */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Move `current` toward `target` by at most `rate * dt`. */
function approach(current, target, rate, dt) {
  if (current < target) return Math.min(target, current + rate * dt);
  return Math.max(target, current - rate * dt);
}

/** The plane's state at the start of a sortie, sitting on Kestrel Field. */
export function createAircraft() {
  return {
    x: 0,
    y: 1.2,
    z: -120,
    heading: 0,
    pitch: 0,
    roll: 0,
    speed: 0,
    throttle: 0,
    flaps: false,
    airbrake: false,
    fuel: FUEL.start,
    integrity: 100,
    verticalSpeed: 0,
    grounded: true,
    stalled: false,
    engineOut: false,
  };
}

/** The nose direction from heading and pitch, as a unit vector. */
export function forwardVector(plane) {
  return {
    x: Math.sin(plane.heading) * Math.cos(plane.pitch),
    y: Math.sin(plane.pitch),
    z: Math.cos(plane.heading) * Math.cos(plane.pitch),
  };
}

/**
 * Advance the plane one fixed step. `stick` is { pitch, roll } in [-1, 1] from
 * the input, `throttleDelta` is the wheel/keys throttle nudge, and `gust` is the
 * mission's wind { roll, lift } in metres per second. Returns nothing; the
 * world reads the plane's fields and the ground clearance to judge the flight.
 */
export function stepAircraft(plane, stick, throttleDelta, gust, dt) {
  // Throttle: keys and the mouse wheel nudge it; empty tanks kill the engine.
  if (!plane.engineOut) {
    plane.throttle = clamp(plane.throttle + throttleDelta, 0, 1);
  } else {
    plane.throttle = 0;
  }

  // The stick asks for a pitch and a bank; the airframe answers at its own rate.
  const targetPitch = stick.pitch * PLANE.maxPitch;
  const targetRoll = stick.roll * PLANE.maxBank;
  plane.pitch = approach(plane.pitch, targetPitch, PLANE.pitchRate, dt);
  plane.roll = approach(plane.roll, targetRoll + (gust ? gust.roll * 0.25 : 0), PLANE.rollRate, dt);

  // A coordinated turn: the heading follows the bank, faster when slow. The
  // 1.6 is the arcade in the model — a light bush plane answers the stick
  // quicker than the textbook rate, and a game that will not turn is no game.
  const turnRate = (9.81 * Math.tan(plane.roll) * 1.6) / Math.max(plane.speed, 22);
  plane.heading += turnRate * dt;

  // Speed chases the throttle's target; the airbrake and the flaps drag it down.
  let targetSpeed = plane.throttle * PLANE.maxSpeed;
  if (plane.flaps) targetSpeed *= 0.72;
  if (plane.airbrake) targetSpeed *= 0.55;
  const rate = targetSpeed > plane.speed ? PLANE.accel : PLANE.drag;
  plane.speed = approach(plane.speed, targetSpeed, rate, dt);

  // Lift: full above stall speed, fading below it until the wing quits.
  const stallSpeed = plane.flaps ? PLANE.stallSpeed * 0.8 : PLANE.stallSpeed;
  const lift = clamp(plane.speed / stallSpeed, 0, 1);
  plane.stalled = plane.speed < stallSpeed && !plane.grounded;
  let vertical = Math.sin(plane.pitch) * plane.speed * lift;
  if (plane.stalled) vertical -= (1 - lift) * 14;
  if (gust) vertical += gust.lift;
  plane.verticalSpeed = vertical;

  // Move along the nose, then let the ground decide whether we are flying.
  const forward = forwardVector(plane);
  plane.x += forward.x * plane.speed * dt;
  plane.y += vertical * dt;
  plane.z += forward.z * plane.speed * dt;

  // Fuel burns with the throttle; an empty tank is an engine-out glide.
  if (plane.throttle > 0 && !plane.engineOut) {
    plane.fuel -= (FUEL.idleBurn + FUEL.fullBurn * plane.throttle) * dt;
    if (plane.fuel <= 0) {
      plane.fuel = 0;
      plane.engineOut = true;
    }
  }
}

/** True when the plane is low, slow and straight enough to touch down. */
export function landingQuality(plane) {
  return {
    sinkOk: Math.abs(plane.verticalSpeed) <= LANDING.maxSink,
    speedOk: plane.speed <= LANDING.maxSpeed,
    attitudeOk: Math.abs(plane.roll) <= LANDING.maxBank && Math.abs(plane.pitch) <= LANDING.maxPitch,
  };
}
