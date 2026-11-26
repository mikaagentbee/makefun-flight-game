// The staged scenes behind ?shot=cover|takeoff|landing|storm. Each one plays the
// real rules forward from a fresh world for a fixed number of steps, steered by
// the same autopilot a careful pilot would use, so the frame is what a short
// flight really looks like — and the same seed always gives the same frame.

import { STEP } from './config.js';
import { MISSIONS } from './missions.js';
import { autopilot, resetWorld, stepWorld } from './world.js';

/** Seconds of flight each staged scene plays before its frame is taken. */
const SCENE_SECONDS = {
  cover: 46,
  takeoff: 5,
  landing: 22,
  storm: 34,
};

/** Which mission each scene flies: the storm is the courier, the rest are named. */
function missionForScene(name) {
  if (name === 'storm') return MISSIONS.find((mission) => mission.id === 'courier');
  if (name === 'landing') return MISSIONS.find((mission) => mission.id === 'landing');
  return MISSIONS.find((mission) => mission.id === 'rings');
}

/**
 * Set `world` to the named scene and return the screen to draw over it.
 * The landing scene starts the plane on final approach to Merapi Strip; the
 * others start on Kestrel Field and fly the autopilot out.
 */
export function stageShot(name, world) {
  const missionDef = missionForScene(name);
  resetWorld(world, missionDef);
  if (name === 'landing') {
    const plane = world.plane;
    plane.x = 60;
    plane.y = 150;
    plane.z = 6900;
    plane.heading = 0;
    plane.pitch = -0.06;
    plane.roll = 0;
    plane.speed = 55;
    plane.throttle = 0.55;
    plane.flaps = true;
    plane.grounded = false;
  }
  const seconds = SCENE_SECONDS[name] ?? SCENE_SECONDS.cover;
  for (let index = 0; index < seconds / STEP; index += 1) {
    const controls = autopilot(world);
    world.plane.throttle = controls.throttle;
    world.plane.flaps = controls.flaps;
    stepWorld(world, { pitch: controls.pitch, roll: controls.roll }, 0);
    if (world.phase === 'done') break;
  }
  return { screen: 'play' };
}
