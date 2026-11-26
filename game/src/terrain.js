// The valley: a seeded heightfield, a river that meanders down its floor, two
// flat runway strips, and the clouds that hang over it. Everything here is pure
// arithmetic on (x, z) so the renderer and the flight model agree on the ground.

import { COURSE, RINGS } from './config.js';
import { createRandom } from './random.js';

/** Clamp a value into [0, 1] after a smoothstep between two edges. */
function smoothstep(edge0, edge1, value) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** A deterministic 2D lattice hash in [0, 1). */
function latticeHash(ix, iz, seed) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 974634211)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1): bilinear interpolation of the lattice. */
function valueNoise(x, z, seed) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = latticeHash(ix, iz, seed);
  const b = latticeHash(ix + 1, iz, seed);
  const c = latticeHash(ix, iz + 1, seed);
  const d = latticeHash(ix + 1, iz + 1, seed);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

/** Three octaves of value noise, centred near zero. */
function fbm(x, z, seed) {
  return (
    (valueNoise(x, z, seed) - 0.5) * 2 * 0.6 +
    (valueNoise(x * 2.13, z * 2.13, seed + 7) - 0.5) * 2 * 0.3 +
    (valueNoise(x * 4.31, z * 4.31, seed + 13) - 0.5) * 2 * 0.15
  );
}

/** The two runways: Kestrel Field at z=0 and Merapi Strip at the far end. */
export const RUNWAYS = [
  { name: 'KESTREL FIELD', z: 0, heading: 0 },
  { name: 'MERAPI STRIP', z: COURSE.length, heading: 0 },
];

/**
 * Build the valley for a seed. heightAt is the ground in metres at (x, z);
 * riverX is the river's centreline; clouds are fixed billboards for the renderer.
 */
export function createTerrain(seed) {
  const random = createRandom(seed);
  const phase = random.range(0, Math.PI * 2);
  const ridgeSeed = seed + 101;
  const hillSeed = seed + 202;
  const clouds = [];
  for (let index = 0; index < 26; index += 1) {
    clouds.push({
      x: random.range(-900, 900),
      y: random.range(190, 300),
      z: random.range(-400, COURSE.length + 600),
      size: random.range(60, 150),
    });
  }

  /** The river's centreline wanders across the valley floor. */
  function riverX(z) {
    return 55 * Math.sin(z * 0.00045 + phase) + 25 * Math.sin(z * 0.0011 + phase * 2);
  }

  /** How much of the ground is flattened for a runway at (x, z): 1 on the strip. */
  function runwayFlatten(x, z) {
    let flat = 0;
    for (const runway of RUNWAYS) {
      const dx = Math.abs(x);
      const dz = Math.abs(z - runway.z);
      const edge = smoothstep(COURSE.runwayHalfWidth + 60, COURSE.runwayHalfWidth, dx) *
        smoothstep(COURSE.runwayHalfLength + 120, COURSE.runwayHalfLength, dz);
      flat = Math.max(flat, edge);
    }
    return flat;
  }

  /** Ground height in metres at (x, z). */
  function heightAt(x, z) {
    const distance = Math.abs(x);
    // Ridges climb on both sides of the valley, higher and rougher further out.
    const ridgeRise = smoothstep(240, 760, distance);
    const ridge = ridgeRise * (150 + 60 * fbm(x * 0.0011, z * 0.0011, ridgeSeed));
    // Gentle rolling hills on the valley floor, fading out toward the ridges.
    const hills = (1 - ridgeRise) * fbm(x * 0.004, z * 0.004, hillSeed) * 16;
    const bumps = fbm(x * 0.02, z * 0.02, seed) * 2.5;
    let height = ridge + hills + bumps;
    // The river cuts a shallow channel through the floor.
    const riverDistance = Math.abs(x - riverX(z));
    height -= 4.5 * Math.exp(-(riverDistance * riverDistance) / 180);
    // Runways sit on flat ground.
    height *= 1 - runwayFlatten(x, z);
    return Math.max(0, height);
  }

  /** Ring positions for a course: a gentle slalom down the valley over the river. */
  function ringPositions(count) {
    const rings = [];
    for (let index = 0; index < count; index += 1) {
      const z = RINGS.firstZ + index * RINGS.spacing;
      rings.push({
        x: riverX(z) * 0.5 + Math.sin(z * 0.0012 + phase) * 40,
        y: heightAt(riverX(z), z) + RINGS.height + Math.sin(index * 2.3) * 12,
        z,
        radius: RINGS.radius,
        passed: false,
        missed: false,
      });
    }
    return rings;
  }

  return { heightAt, riverX, clouds, ringPositions, runways: RUNWAYS };
}
