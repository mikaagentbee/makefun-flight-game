// The three sorties. Each one is a different way to fly the same valley: thread
// the rings against the clock, put the plane down gently on the far strip, or
// do both in a storm with a tight tank. The world scores them; this file only
// says what each one asks for.

import { COURSE, RINGS } from './config.js';

export const MISSIONS = [
  {
    id: 'rings',
    name: 'RING RUN',
    tag: '8 rings · beat the clock',
    brief: 'Thread all 8 rings down the valley. Full tanks, clean air — speed and smooth turns win.',
    rings: RINGS.count,
    landing: false,
    fuel: 100,
    timeLimit: 260,
    gusts: false,
  },
  {
    id: 'landing',
    name: 'VALLEY LANDING',
    tag: 'Take off · fly 8 km · land it',
    brief: 'Depart Kestrel Field, fly the valley to Merapi Strip, and put her down gentle: slow, level, on the centreline.',
    rings: 0,
    landing: true,
    fuel: 100,
    timeLimit: 300,
    gusts: false,
  },
  {
    id: 'courier',
    name: 'STORM COURIER',
    tag: '5 rings + landing · gusts · tight fuel',
    brief: 'A parcel for Merapi Strip, and the weather turned. Five rings, then land — with gusts shoving you around and fuel to watch.',
    rings: 5,
    landing: true,
    fuel: 72,
    timeLimit: 320,
    gusts: true,
  },
];

/** Build one mission's live state: its rings, its clock and its start position. */
export function buildMission(mission, terrain) {
  const rings = mission.rings > 0 ? terrain.ringPositions(mission.rings) : [];
  return {
    id: mission.id,
    name: mission.name,
    tag: mission.tag,
    brief: mission.brief,
    rings,
    ringIndex: 0,
    ringsMissed: 0,
    landing: mission.landing,
    fuel: mission.fuel,
    timeLimit: mission.timeLimit,
    gusts: mission.gusts,
    elapsed: 0,
    score: 0,
    targetRunway: terrain.runways[1],
    startRunway: terrain.runways[0],
  };
}

/** The next ring to fly through, or null when they are all done. */
export function nextRing(mission) {
  return mission.ringIndex < mission.rings.length ? mission.rings[mission.ringIndex] : null;
}

/** True when the plane is over the far strip, inside its rectangle. */
export function overRunway(plane, runway) {
  return (
    Math.abs(plane.x) <= COURSE.runwayHalfWidth &&
    Math.abs(plane.z - runway.z) <= COURSE.runwayHalfLength
  );
}
