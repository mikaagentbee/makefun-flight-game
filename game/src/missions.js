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
  {
    id: 'stormrings',
    name: 'STORM RINGS',
    tag: '8 rings · storm · against the clock',
    brief: 'The full ring course in the weather the courier fears: all 8 rings with the storm shoving at the wings and a clock that will not wait.',
    rings: RINGS.count,
    landing: false,
    fuel: 90,
    timeLimit: 235,
    gusts: true,
  },
];

/**
 * The medal a finished sortie earns, by its score against the mission's par.
 * Pars are set from what a clean, well-flown run scores: ACE asks for
 * bullseyes and a held combo, BRONZE only asks that the sortie be finished.
 */
export const MEDALS = [
  { name: 'ACE', colour: '#ffd75e' },
  { name: 'GOLD', colour: '#ffb02e' },
  { name: 'SILVER', colour: '#cfd8dc' },
  { name: 'BRONZE', colour: '#cd8f52' },
];

export const PARS = {
  rings: [2150, 1750, 1150, 650],
  landing: [600, 520, 400, 250],
  courier: [1650, 1400, 1000, 550],
  stormrings: [2250, 1750, 1150, 600],
};

/** The medal for a score on a mission, or null when it earns none. */
export function medalFor(missionId, score) {
  const par = PARS[missionId];
  if (!par) return null;
  for (let index = 0; index < par.length; index += 1) {
    if (score >= par[index]) return MEDALS[index];
  }
  return null;
}

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
    combo: 0,
    bestCombo: 0,
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
