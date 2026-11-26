// The painter: a chase camera behind the Kestrel, a projected valley of coloured
// quads, the low-poly plane itself, and a glass cockpit of lit instruments. All
// drawing is plain Canvas 2D; the only 3D is the projection maths in this file.

import { FIELD, MS_TO_KT, M_TO_FT, PALETTE, FONT, PLANE } from './config.js';
import { forwardVector } from './aircraft.js';
import { MISSIONS, medalFor, nextRing } from './missions.js';

/** Clamp a value into [min, max]. */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** A 3D vector's length. */
function length3(v) {
  return Math.hypot(v.x, v.y, v.z);
}

/** A unit vector in the direction of `v`. */
function normalize3(v) {
  const length = length3(v) || 1;
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}

/** The cross product of two 3D vectors. */
function cross3(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

/** Rotate a vector around an axis by `angle` (Rodrigues' formula). */
function rotateAround(vector, axis, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dot = vector.x * axis.x + vector.y * axis.y + vector.z * axis.z;
  const cross = cross3(axis, vector);
  return {
    x: vector.x * cos + cross.x * sin + axis.x * dot * (1 - cos),
    y: vector.y * cos + cross.y * sin + axis.y * dot * (1 - cos),
    z: vector.z * cos + cross.z * sin + axis.z * dot * (1 - cos),
  };
}

/** Parse a #rrggbb colour into [r, g, b]. */
function hexRgb(hex) {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

const GRASS_LOW = hexRgb(PALETTE.grassLow);
const GRASS_HIGH = hexRgb(PALETTE.grassHigh);
const ROCK = hexRgb(PALETTE.rock);
const SNOW = hexRgb(PALETTE.snow);
const RIVER = hexRgb(PALETTE.river);
const HAZE = hexRgb(PALETTE.haze);

/** The ground's colour at a height, shaded by slope, hazed by distance, and varied a little per quad. */
function groundColor(height, slope, distance, variation = 0) {
  let colour = [
    GRASS_LOW[0] + (GRASS_HIGH[0] - GRASS_LOW[0]) * clamp(height / 70, 0, 1),
    GRASS_LOW[1] + (GRASS_HIGH[1] - GRASS_LOW[1]) * clamp(height / 70, 0, 1),
    GRASS_LOW[2] + (GRASS_HIGH[2] - GRASS_LOW[2]) * clamp(height / 70, 0, 1),
  ];
  if (height > 105) {
    const t = clamp((height - 105) / 40, 0, 1);
    colour = [colour[0] + (ROCK[0] - colour[0]) * t, colour[1] + (ROCK[1] - colour[1]) * t, colour[2] + (ROCK[2] - colour[2]) * t];
  }
  if (height > 160) {
    const t = clamp((height - 160) / 30, 0, 1);
    colour = [colour[0] + (SNOW[0] - colour[0]) * t, colour[1] + (SNOW[1] - colour[1]) * t, colour[2] + (SNOW[2] - colour[2]) * t];
  }
  const shade = clamp(0.86 - slope * 0.9 + variation, 0.55, 1.05);
  colour = [colour[0] * shade, colour[1] * shade, colour[2] * shade];
  const haze = clamp(distance / 1500, 0, 0.55);
  colour = [colour[0] + (HAZE[0] - colour[0]) * haze, colour[1] + (HAZE[1] - colour[1]) * haze, colour[2] + (HAZE[2] - colour[2]) * haze];
  return `rgb(${Math.round(colour[0])},${Math.round(colour[1])},${Math.round(colour[2])})`;
}

/** A deterministic 2D lattice hash in [0, 1), for per-quad variation. */
function latticeHash2(ix, iz, seed) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 974634211)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** The plane's own shape, in body coordinates: x right, y up, z forward. */
const PLANE_VERTICES = [
  [0, 0.15, 3.7], // 0 nose
  [-0.55, 0.75, 2.1], // 1 canopy top front, left
  [0.55, 0.75, 2.1], // 2 canopy top front, right
  [-0.55, 0.8, -2.4], // 3 spine back, left
  [0.55, 0.8, -2.4], // 4 spine back, right
  [-0.2, 0.35, -3.7], // 5 tail tip, left
  [0.2, 0.35, -3.7], // 6 tail tip, right
  [-0.5, -0.5, 2.1], // 7 belly front, left
  [0.5, -0.5, 2.1], // 8 belly front, right
  [-0.5, -0.45, -2.4], // 9 belly back, left
  [0.5, -0.45, -2.4], // 10 belly back, right
  [-0.55, 0.15, 1.3], // 11 left root front
  [-0.55, 0.15, -0.5], // 12 left root back
  [-4.6, 0.1, 0.6], // 13 left tip front
  [-4.6, 0.1, -0.2], // 14 left tip back
  [0.55, 0.15, 1.3], // 15 right root front
  [0.55, 0.15, -0.5], // 16 right root back
  [4.6, 0.1, 0.6], // 17 right tip front
  [4.6, 0.1, -0.2], // 18 right tip back
  [0, 1.7, -3.3], // 19 fin top
  [-1.9, 0.4, -3.1], // 20 left stabiliser tip
  [1.9, 0.4, -3.1], // 21 right stabiliser tip
  [0, 0.8, -2.4], // 22 spine centre
  [0, 0.35, -3.7], // 23 tail tip centre
];

/** Faces as [vertex indices..., colour]: drawn far to near. */
const PLANE_FACES = [
  { v: [0, 1, 3, 5, 9, 7], c: PALETTE.planeBody },
  { v: [0, 8, 10, 6, 4, 2], c: PALETTE.planeBody },
  { v: [1, 2, 4, 3], c: PALETTE.planeWing },
  { v: [7, 9, 10, 8], c: '#2c3e50' },
  { v: [3, 4, 6, 5], c: PALETTE.planeBody },
  { v: [11, 13, 14, 12], c: PALETTE.planeWing },
  { v: [15, 16, 18, 17], c: PALETTE.planeWing },
  { v: [22, 19, 23], c: PALETTE.planeTrim },
  { v: [3, 5, 20], c: PALETTE.planeWing },
  { v: [4, 21, 6], c: PALETTE.planeWing },
];

/** Create the renderer for a canvas; it paints a 1280x720 logical frame. */
export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const W = FIELD.width;
  const H = FIELD.height;
  /** The projection's focal length; draw() widens it with speed (dynamic FOV). */
  const BASE_FOCAL = (H / 2) / Math.tan((70 * Math.PI) / 360);
  let focal = BASE_FOCAL;

  /** The chase camera: behind the plane, banked a little with it. */
  function buildCamera(plane) {
    const forward = forwardVector(plane);
    const position = {
      x: plane.x - forward.x * PLANE.camBack,
      y: plane.y - forward.y * PLANE.camBack + PLANE.camUp,
      z: plane.z - forward.z * PLANE.camBack,
    };
    const look = {
      x: plane.x + forward.x * 30,
      y: plane.y + forward.y * 30,
      z: plane.z + forward.z * 30,
    };
    const f = normalize3({ x: look.x - position.x, y: look.y - position.y, z: look.z - position.z });
    let r = normalize3(cross3(f, { x: 0, y: 1, z: 0 }));
    let u = cross3(r, f);
    const bank = plane.roll * 0.45;
    r = rotateAround(r, f, bank);
    u = rotateAround(u, f, bank);
    return { position, f, r, u };
  }

  /** Project a world point to screen space, or null when behind the camera. */
  function project(camera, point) {
    const dx = point.x - camera.position.x;
    const dy = point.y - camera.position.y;
    const dz = point.z - camera.position.z;
    const cx = dx * camera.r.x + dy * camera.r.y + dz * camera.r.z;
    const cy = dx * camera.u.x + dy * camera.u.y + dz * camera.u.z;
    const cz = dx * camera.f.x + dy * camera.f.y + dz * camera.f.z;
    if (cz < 2) return null;
    return { x: W / 2 + (cx / cz) * focal, y: H / 2 - (cy / cz) * focal, d: cz };
  }

  /** The sky: a gradient, the sun, and a few high clouds painted in screen space. */
  function drawSky(camera, plane, storm = false) {
    const gradient = context.createLinearGradient(0, 0, 0, H);
    if (storm) {
      gradient.addColorStop(0, '#26343f');
      gradient.addColorStop(0.55, '#51626f');
      gradient.addColorStop(1, '#8fa3ae');
    } else {
      gradient.addColorStop(0, PALETTE.skyTop);
      gradient.addColorStop(0.55, PALETTE.skyMid);
      gradient.addColorStop(1, PALETTE.skyLow);
    }
    context.fillStyle = gradient;
    context.fillRect(0, 0, W, H);
    const sunPoint = project(camera, {
      x: camera.position.x + 1400,
      y: camera.position.y + 900,
      z: camera.position.z + 2600,
    });
    if (sunPoint && sunPoint.d > 0 && !storm) {
      const glow = context.createRadialGradient(sunPoint.x, sunPoint.y, 4, sunPoint.x, sunPoint.y, 90);
      glow.addColorStop(0, 'rgba(255,243,196,0.95)');
      glow.addColorStop(0.25, 'rgba(255,243,196,0.55)');
      glow.addColorStop(1, 'rgba(255,243,196,0)');
      context.fillStyle = glow;
      context.fillRect(sunPoint.x - 90, sunPoint.y - 90, 180, 180);
    }
  }

  /** Far mountain silhouettes on the horizon, hazed with distance. */
  function drawDistantPeaks(camera, plane, terrain) {
    context.fillStyle = 'rgba(122,148,178,0.5)';
    const baseZ = plane.z + 1700;
    let x = -1600;
    while (x < 1600) {
      const width = 260 + latticeHash2(Math.round(x), 3, 11) * 320;
      const peakHeight = 170 + latticeHash2(Math.round(x), 5, 13) * 150;
      const left = project(camera, { x, y: 0, z: baseZ });
      const peak = project(camera, { x: x + width / 2, y: peakHeight, z: baseZ });
      const right = project(camera, { x: x + width, y: 0, z: baseZ });
      if (left && peak && right) {
        context.beginPath();
        context.moveTo(left.x, left.y);
        context.lineTo(peak.x, peak.y);
        context.lineTo(right.x, right.y);
        context.closePath();
        context.fill();
      }
      x += width * 0.75;
    }
  }

  /** The valley floor: projected quads, far rows first, coloured by height. */
  function drawTerrain(camera, plane, terrain) {
    const rows = [];
    let z = plane.z + 30;
    while (z < plane.z + 1500) {
      rows.push(z);
      z *= 1;
      z += Math.max(28, (z - plane.z) * 0.22);
    }
    for (let row = rows.length - 1; row >= 0; row -= 1) {
      const z0 = rows[row];
      const z1 = row + 1 < rows.length ? rows[row + 1] : z0 + 60;
      for (let x = -800; x < 800; x += 80) {
        const x0 = x;
        const x1 = x + 80;
        const h00 = terrain.heightAt(x0, z0);
        const h10 = terrain.heightAt(x1, z0);
        const h01 = terrain.heightAt(x0, z1);
        const h11 = terrain.heightAt(x1, z1);
        const p00 = project(camera, { x: x0, y: h00, z: z0 });
        const p10 = project(camera, { x: x1, y: h10, z: z0 });
        const p01 = project(camera, { x: x0, y: h01, z: z1 });
        const p11 = project(camera, { x: x1, y: h11, z: z1 });
        if (!p00 || !p10 || !p01 || !p11) continue;
        const height = (h00 + h10 + h01 + h11) / 4;
        const slope = Math.abs(h10 - h00) / 80 + Math.abs(h01 - h00) / Math.max(1, z1 - z0);
        const distance = (p00.d + p11.d) / 2;
        // A little per-quad variation, so the ground reads as fields, not flat paint.
        const variation = (latticeHash2(x, Math.round(z0), 7) - 0.5) * 0.14;
        let colour = groundColor(height, slope, distance, variation);
        context.fillStyle = colour;
        context.beginPath();
        context.moveTo(p00.x, p00.y);
        context.lineTo(p10.x, p10.y);
        context.lineTo(p11.x, p11.y);
        context.lineTo(p01.x, p01.y);
        context.closePath();
        context.fill();
      }
    }
  }

  /** The river: a narrow ribbon that follows its centreline down the valley. */
  function drawRiver(camera, plane, terrain) {
    for (let z = Math.max(-200, plane.z - 100); z < plane.z + 1500; z += 40) {
      const centre = terrain.riverX(z);
      const a = project(camera, { x: centre - 7, y: terrain.heightAt(centre - 7, z) + 0.4, z });
      const b = project(camera, { x: centre + 7, y: terrain.heightAt(centre + 7, z) + 0.4, z });
      const c = project(camera, { x: centre + 7, y: terrain.heightAt(centre + 7, z + 40) + 0.4, z: z + 40 });
      const d = project(camera, { x: centre - 7, y: terrain.heightAt(centre - 7, z + 40) + 0.4, z: z + 40 });
      if (!a || !b || !c || !d) continue;
      context.fillStyle = `rgb(${RIVER[0]},${RIVER[1]},${RIVER[2]})`;
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.lineTo(c.x, c.y);
      context.lineTo(d.x, d.y);
      context.closePath();
      context.fill();
    }
  }

  /** The runway strips and their centreline dashes, drawn crisp over the ground. */
  function drawRunways(camera, terrain) {
    for (const runway of terrain.runways) {
      for (let z = runway.z - 200; z < runway.z + 200; z += 40) {
        const a = project(camera, { x: -15, y: 0.4, z });
        const b = project(camera, { x: 15, y: 0.4, z });
        const c = project(camera, { x: 15, y: 0.4, z: z + 40 });
        const d = project(camera, { x: -15, y: 0.4, z: z + 40 });
        if (!a || !b || !c || !d) continue;
        context.fillStyle = PALETTE.runway;
        context.beginPath();
        context.moveTo(a.x, a.y);
        context.lineTo(b.x, b.y);
        context.lineTo(c.x, c.y);
        context.lineTo(d.x, d.y);
        context.closePath();
        context.fill();
        // Edge lights: a warm dot on each corner of the segment, so the strip
        // reads as a place to land long before its paint does.
        for (const edgeX of [-16.5, 16.5]) {
          const dot = project(camera, { x: edgeX, y: 0.7, z });
          if (dot && dot.d < 1200) {
            context.fillStyle = 'rgba(255,214,140,0.9)';
            context.beginPath();
            context.arc(dot.x, dot.y, clamp(500 / dot.d, 1, 3.4), 0, Math.PI * 2);
            context.fill();
          }
        }
        if (Math.floor(z / 40) % 2 === 0) {
          const e = project(camera, { x: -1.2, y: 0.5, z: z + 8 });
          const f = project(camera, { x: 1.2, y: 0.5, z: z + 8 });
          const g = project(camera, { x: 1.2, y: 0.5, z: z + 28 });
          const h = project(camera, { x: -1.2, y: 0.5, z: z + 28 });
          if (e && f && g && h) {
            context.fillStyle = PALETTE.runwayLine;
            context.beginPath();
            context.moveTo(e.x, e.y);
            context.lineTo(f.x, f.y);
            context.lineTo(g.x, g.y);
            context.lineTo(h.x, h.y);
            context.closePath();
            context.fill();
          }
        }
      }
      // The strip's name, painted on the ground near its threshold.
      const label = project(camera, { x: 0, y: 2, z: runway.z - 230 });
      if (label && label.d < 900) {
        context.fillStyle = 'rgba(238,244,247,0.85)';
        context.font = `600 ${Math.max(11, 900 / label.d)}px ${FONT}`;
        context.textAlign = 'center';
        context.fillText(runway.name, label.x, label.y);
      }
    }
  }

  /** Clouds: soft white billboards that drift with the valley, drawn far to near. */
  function drawClouds(camera, terrain, storm = false) {
    const visible = [];
    for (const cloud of terrain.clouds) {
      const point = project(camera, { x: cloud.x, y: cloud.y, z: cloud.z });
      if (point && point.d > 20 && point.d < 2200) visible.push({ point, cloud });
    }
    visible.sort((a, b) => b.point.d - a.point.d);
    for (const { point, cloud } of visible) {
      const size = (cloud.size / point.d) * focal;
      if (size < 4) continue;
      const alpha = clamp(0.85 - point.d / 2600, 0.25, 0.85);
      // Each puff is its own ellipse, so overlaps blend instead of cusping.
      // In a storm the same clouds hang grey and heavy instead of white.
      context.fillStyle = storm ? `rgba(74,88,100,${Math.min(0.95, alpha + 0.1)})` : `rgba(255,255,255,${alpha})`;
      const puffs = [
        [0, 0, 1, 0.42],
        [-0.5, 0.08, 0.6, 0.3],
        [0.5, 0.08, 0.6, 0.3],
      ];
      for (const [dx, dy, rx, ry] of puffs) {
        context.beginPath();
        context.ellipse(point.x + dx * size, point.y + dy * size, rx * size, ry * size, 0, 0, Math.PI * 2);
        context.fill();
      }
    }
  }

  /** The rings: glowing circles the next one wears amber, the rest cyan. */
  function drawRings(camera, world) {
    const mission = world.mission;
    for (let index = mission.ringIndex; index < mission.rings.length; index += 1) {
      const ring = mission.rings[index];
      const centre = project(camera, { x: ring.x, y: ring.y, z: ring.z });
      if (!centre || centre.d < 10) continue;
      const radius = (ring.radius / centre.d) * focal;
      if (radius < 2) continue;
      const isNext = index === mission.ringIndex;
      const colour = isNext ? PALETTE.ringNext : PALETTE.ringOther;
      context.save();
      context.globalAlpha = clamp(1.15 - centre.d / 1600, 0.35, 1);
      context.strokeStyle = colour;
      context.lineWidth = Math.max(2, radius * 0.09);
      context.shadowColor = colour;
      context.shadowBlur = isNext ? 18 : 8;
      context.beginPath();
      context.arc(centre.x, centre.y, radius, 0, Math.PI * 2);
      context.stroke();
      context.shadowBlur = 0;
      context.fillStyle = colour;
      context.font = `700 ${Math.max(12, radius * 0.32)}px ${FONT}`;
      context.textAlign = 'center';
      context.fillText(String(index + 1), centre.x, centre.y - radius - 8);
      context.restore();
    }
  }

  /** Rotate a body-space point by heading, pitch and roll into the world. */
  function bodyToWorld(plane, local) {
    const [x, y, z] = local;
    // Roll about the forward axis (positive roll banks right, right wing down).
    const cosR = Math.cos(-plane.roll);
    const sinR = Math.sin(-plane.roll);
    const rx = x * cosR - y * sinR;
    const ry = x * sinR + y * cosR;
    const rz = z;
    // Pitch about the right axis (positive pitch is nose up).
    const cosP = Math.cos(-plane.pitch);
    const sinP = Math.sin(-plane.pitch);
    const px = rx;
    const py = ry * cosP - rz * sinP;
    const pz = ry * sinP + rz * cosP;
    // Heading about the world up axis.
    const cosH = Math.cos(plane.heading);
    const sinH = Math.sin(plane.heading);
    return {
      x: plane.x + px * cosH + pz * sinH,
      y: plane.y + py,
      z: plane.z - px * sinH + pz * cosH,
    };
  }

  /** The Kestrel herself, drawn low-poly and sorted face by face. */
  function drawPlane(camera, plane, now) {
    const projected = PLANE_VERTICES.map((vertex) => {
      const world = bodyToWorld(plane, vertex);
      return { point: project(camera, world), world };
    });
    const faces = PLANE_FACES.map((face) => {
      const points = face.v.map((index) => projected[index].point);
      const depth = face.v.reduce((sum, index) => sum + projected[index].world.z, 0) / face.v.length;
      return { points, colour: face.c, depth };
    });
    faces.sort((a, b) => b.depth - a.depth);
    for (const face of faces) {
      if (face.points.some((point) => !point)) continue;
      context.fillStyle = face.colour;
      context.strokeStyle = 'rgba(16,24,32,0.55)';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(face.points[0].x, face.points[0].y);
      for (let index = 1; index < face.points.length; index += 1) {
        context.lineTo(face.points[index].x, face.points[index].y);
      }
      context.closePath();
      context.fill();
      context.stroke();
    }
    // The propeller: a faint disc and two thin blades spinning with the engine.
    const nose = project(camera, bodyToWorld(plane, [0, 0.15, 3.9]));
    if (nose && plane.speed > 2) {
      const radius = (1.05 / nose.d) * focal;
      context.save();
      context.globalAlpha = 0.16;
      context.fillStyle = '#dfe7ea';
      context.beginPath();
      context.arc(nose.x, nose.y, radius, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 0.55;
      context.strokeStyle = '#2c3e50';
      context.lineWidth = Math.max(1.5, radius * 0.05);
      const angle = now * 22;
      context.beginPath();
      context.moveTo(nose.x - Math.cos(angle) * radius, nose.y - Math.sin(angle) * radius);
      context.lineTo(nose.x + Math.cos(angle) * radius, nose.y + Math.sin(angle) * radius);
      context.moveTo(nose.x - Math.cos(angle + Math.PI / 2) * radius, nose.y - Math.sin(angle + Math.PI / 2) * radius);
      context.lineTo(nose.x + Math.cos(angle + Math.PI / 2) * radius, nose.y + Math.sin(angle + Math.PI / 2) * radius);
      context.stroke();
      context.restore();
    }
    // Navigation lights: red left, green right, white tail.
    const lights = [
      { local: [-4.6, 0.15, 0.2], colour: '#ff5a4e' },
      { local: [4.6, 0.15, 0.2], colour: '#58d68d' },
      { local: [0, 0.4, -3.7], colour: '#ffffff' },
    ];
    for (const light of lights) {
      const point = project(camera, bodyToWorld(plane, light.local));
      if (!point) continue;
      context.fillStyle = light.colour;
      context.beginPath();
      context.arc(point.x, point.y, 3, 0, Math.PI * 2);
      context.fill();
    }
  }

  /** A small glass panel: dark glass, a lit edge, and a title. */
  function glassPanel(x, y, width, height, title) {
    context.fillStyle = 'rgba(16,24,32,0.82)';
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 1.5;
    context.beginPath();
    context.roundRect(x, y, width, height, 8);
    context.fill();
    context.stroke();
    if (title) {
      context.fillStyle = PALETTE.hudCyan;
      context.font = `700 11px ${FONT}`;
      context.textAlign = 'left';
      context.fillText(title, x + 10, y + 16);
    }
  }

  /** The compass strip across the top: ticks, cardinal letters, the heading. */
  function drawCompass(plane) {
    const centreX = W / 2;
    const y = 30;
    const headingDeg = ((plane.heading * 180) / Math.PI % 360 + 360) % 360;
    // A dark backing so clouds never wash the compass out.
    context.fillStyle = 'rgba(16,24,32,0.55)';
    context.beginPath();
    context.roundRect(centreX - 170, 8, 340, 44, 8);
    context.fill();
    context.save();
    context.beginPath();
    context.rect(centreX - 170, 8, 340, 44);
    context.clip();
    for (let offset = -90; offset <= 90; offset += 5) {
      const degrees = Math.round((headingDeg + offset) / 5) * 5;
      const wrapped = ((degrees % 360) + 360) % 360;
      const x = centreX + (offset / 90) * 170;
      const major = wrapped % 30 === 0;
      context.strokeStyle = major ? PALETTE.hudCyan : 'rgba(127,231,255,0.4)';
      context.lineWidth = major ? 2 : 1;
      context.beginPath();
      context.moveTo(x, y + 8);
      context.lineTo(x, y + (major ? -4 : 2));
      context.stroke();
      if (major) {
        const label = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' }[wrapped];
        context.fillStyle = PALETTE.text;
        context.font = `700 ${label ? 13 : 10}px ${FONT}`;
        context.textAlign = 'center';
        context.fillText(label ?? String(wrapped).padStart(3, '0'), x, y - 8);
      }
    }
    context.restore();
    context.fillStyle = PALETTE.hudAmber;
    context.beginPath();
    context.moveTo(centreX, y + 14);
    context.lineTo(centreX - 6, y + 4);
    context.lineTo(centreX + 6, y + 4);
    context.closePath();
    context.fill();
    context.fillStyle = 'rgba(16,24,32,0.55)';
    context.beginPath();
    context.roundRect(centreX - 34, 54, 68, 22, 6);
    context.fill();
    context.fillStyle = PALETTE.text;
    context.font = `700 13px ${FONT}`;
    context.textAlign = 'center';
    context.fillText(`${String(Math.round(headingDeg)).padStart(3, '0')}°`, centreX, 70);
  }

  /** A vertical tape: the current value centred, ticks above and below. */
  function drawTape(x, y, height, value, step, format, accent, lowBand) {
    const pixelsPerUnit = height / (step * 8);
    glassPanel(x - 34, y - height / 2 - 14, 68, height + 28, '');
    context.save();
    context.beginPath();
    context.rect(x - 34, y - height / 2 - 14, 68, height + 28);
    context.clip();
    const base = Math.floor(value / step) * step;
    for (let index = -4; index <= 4; index += 1) {
      const tickValue = base + index * step;
      if (tickValue < 0) continue;
      const ty = y - (tickValue - value) * pixelsPerUnit;
      const major = tickValue % (step * 2) === 0;
      context.strokeStyle = 'rgba(238,244,247,0.45)';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(x - 12, ty);
      context.lineTo(x + (major ? 12 : 6), ty);
      context.stroke();
      if (major) {
        context.fillStyle = PALETTE.muted;
        context.font = `600 11px ${FONT}`;
        context.textAlign = 'left';
        context.fillText(format(tickValue), x + 16, ty + 4);
      }
    }
    if (lowBand !== undefined) {
      const lowY = y - (lowBand - value) * pixelsPerUnit;
      context.fillStyle = 'rgba(255,90,78,0.35)';
      context.fillRect(x - 34, lowY, 68, height);
    }
    context.restore();
    // The current value rides in a lit pill across the tape, dark on cyan.
    context.fillStyle = accent;
    context.beginPath();
    context.roundRect(x - 34, y - 13, 68, 26, 4);
    context.fill();
    context.fillStyle = '#101820';
    context.font = `700 13px ${FONT}`;
    context.textAlign = 'center';
    context.fillText(format(Math.round(value)), x, y + 5);
  }

  /** The attitude ball: sky and ground split by the horizon, rolled with the plane. */
  function drawAttitudeBall(x, y, radius, plane) {
    context.save();
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.clip();
    context.translate(x, y);
    context.rotate(-plane.roll);
    const pitchOffset = plane.pitch * radius * 1.4;
    context.fillStyle = '#3f8fbf';
    context.fillRect(-radius, -radius - pitchOffset, radius * 2, radius + pitchOffset);
    context.fillStyle = '#7a5a38';
    context.fillRect(-radius, pitchOffset, radius * 2, radius * 2);
    context.strokeStyle = 'rgba(238,244,247,0.9)';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(-radius, pitchOffset);
    context.lineTo(radius, pitchOffset);
    context.stroke();
    for (const offset of [-30, -15, 15, 30]) {
      context.beginPath();
      context.moveTo(-14, pitchOffset + offset);
      context.lineTo(14, pitchOffset + offset);
      context.stroke();
    }
    context.restore();
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.stroke();
    // The fixed aircraft symbol over the ball.
    context.strokeStyle = PALETTE.hudAmber;
    context.lineWidth = 2.5;
    context.beginPath();
    context.moveTo(x - 18, y);
    context.lineTo(x - 5, y);
    context.moveTo(x + 5, y);
    context.lineTo(x + 18, y);
    context.moveTo(x, y - 2);
    context.lineTo(x, y + 6);
    context.stroke();
  }

  /** The gauges: throttle, fuel and airframe, plus the stall and fuel lamps. */
  function drawGauges(world, plane) {
    const x = W - 218;
    const y = H - 134;
    glassPanel(x, y, 198, 110, 'ENGINE');
    // Throttle bar.
    context.fillStyle = '#22303c';
    context.fillRect(x + 14, y + 26, 14, 56);
    context.fillStyle = PALETTE.hudCyan;
    context.fillRect(x + 14, y + 26 + 56 * (1 - plane.throttle), 14, 56 * plane.throttle);
    context.fillStyle = PALETTE.text;
    context.font = `600 11px ${FONT}`;
    context.textAlign = 'left';
    context.fillText(`THR ${Math.round(plane.throttle * 100)}%`, x + 34, y + 40);
    // Fuel bar.
    context.fillStyle = '#22303c';
    context.fillRect(x + 14, y + 48, 170, 10);
    context.fillStyle = plane.fuel < 18 ? PALETTE.hudRed : PALETTE.hudGreen;
    context.fillRect(x + 14, y + 48, 170 * (plane.fuel / 100), 10);
    context.fillStyle = PALETTE.text;
    context.fillText(`FUEL ${Math.round(plane.fuel)}`, x + 34, y + 68);
    // Airframe bar.
    context.fillStyle = '#22303c';
    context.fillRect(x + 14, y + 74, 170, 8);
    context.fillStyle = plane.integrity < 40 ? PALETTE.hudRed : PALETTE.hudAmber;
    context.fillRect(x + 14, y + 74, 170 * (plane.integrity / 100), 8);
    context.fillStyle = PALETTE.text;
    context.fillText(`HULL ${Math.round(plane.integrity)}%`, x + 34, y + 96);
    // Warning lamps, one line at the top of the panel.
    const lamps = [];
    if (plane.stalled) lamps.push(['STALL', PALETTE.hudRed]);
    if (plane.fuel < 18) lamps.push(['LOW FUEL', PALETTE.hudAmber]);
    const clearance = plane.y - world.terrain.heightAt(plane.x, plane.z);
    if (clearance < 20 && !plane.grounded) lamps.push(['TERRAIN', PALETTE.hudRed]);
    if (plane.flaps) lamps.push(['FLAPS', PALETTE.hudGreen]);
    if (lamps.length > 0) {
      context.fillStyle = lamps[0][1];
      context.font = `700 12px ${FONT}`;
      context.textAlign = 'right';
      context.fillText(lamps.map(([label]) => label).join('  ·  '), x + 184, y + 14);
    }
  }

  /**
   * Rain, in screen space: a field of slanted streaks recycled by the clock,
   * so a storm sortie is flown through weather, not just against wind numbers.
   * Each drop's lane comes from a hash of its index — no state, no allocation.
   */
  function drawRain(now) {
    context.save();
    context.strokeStyle = 'rgba(198,220,236,0.38)';
    context.lineWidth = 1.4;
    context.beginPath();
    for (let index = 0; index < 150; index += 1) {
      const lane = latticeHash2(index, 31, 17);
      const laneY = latticeHash2(index, 47, 19);
      const x = lane * (W + 120) - 60 + Math.sin(index * 7.3) * 6;
      const y = (laneY * H + now * (620 + lane * 260)) % (H + 40) - 20;
      context.moveTo(x, y);
      context.lineTo(x - 5, y + 15);
    }
    context.stroke();
    context.restore();
  }

  /** Particles: projected points, fading as they age, sized by their world size. */
  function drawParticles(camera, world) {
    for (const p of world.particles.list) {
      const point = project(camera, p);
      if (!point || point.d < 4) continue;
      const size = Math.max(1.2, (p.size / point.d) * focal);
      const fade = 1 - p.age / p.life;
      context.save();
      context.globalAlpha = clamp(fade, 0, 1) * 0.9;
      context.fillStyle = p.colour;
      context.beginPath();
      context.arc(point.x, point.y, size, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
  }

  /** Floating score popups: born at a ring, they rise and fade over their life. */
  function drawPopups(camera, world) {
    for (const popup of world.popups) {
      const age = world.time - popup.born;
      const risen = { x: popup.x, y: popup.y + age * 7, z: popup.z };
      const point = project(camera, risen);
      if (!point || point.d < 6) continue;
      const fade = clamp(1 - age / popup.life, 0, 1);
      const size = clamp(3400 / point.d, 13, 30);
      context.save();
      context.globalAlpha = fade;
      context.fillStyle = popup.colour;
      context.font = `800 ${size}px ${FONT}`;
      context.textAlign = 'center';
      context.shadowColor = 'rgba(10,18,26,0.8)';
      context.shadowBlur = 6;
      context.fillText(popup.text, point.x, point.y);
      context.restore();
    }
  }

  /**
   * Where the sortie wants the plane next: the next ring, or the far strip's
   * touchdown zone once the rings are done. Null when there is nothing to aim at.
   */
  function currentTarget(world) {
    const ring = nextRing(world.mission);
    if (ring) return { x: ring.x, y: ring.y, z: ring.z, label: `RING ${world.mission.ringIndex + 1}`, kind: 'ring' };
    if (world.mission.landing) {
      const runway = world.mission.targetRunway;
      return { x: 0, y: world.terrain.heightAt(0, runway.z) + 3, z: runway.z - 150, label: 'MERAPI STRIP', kind: 'strip' };
    }
    return null;
  }

  /**
   * The guide: a diamond on the target when it is on screen, and an arrow on
   * the screen's edge with the distance when it is not — a pilot (or a judge)
   * is never left wondering where the sortie goes next.
   */
  function drawTargetGuide(camera, world) {
    if (world.phase === 'done') return;
    const target = currentTarget(world);
    if (!target) return;
    const plane = world.plane;
    const distance = Math.hypot(target.x - plane.x, target.z - plane.z);
    const distanceText = distance >= 1000 ? `${(distance / 1000).toFixed(1)} km` : `${Math.round(distance)} m`;
    const point = project(camera, target);
    const margin = 64;
    const onScreen = point && point.x > margin && point.x < W - margin && point.y > margin && point.y < H - margin;
    context.save();
    if (onScreen) {
      context.strokeStyle = PALETTE.hudAmber;
      context.lineWidth = 2;
      context.globalAlpha = 0.9;
      const s = 11;
      context.beginPath();
      context.moveTo(point.x, point.y - s);
      context.lineTo(point.x + s, point.y);
      context.lineTo(point.x, point.y + s);
      context.lineTo(point.x - s, point.y);
      context.closePath();
      context.stroke();
      context.fillStyle = PALETTE.hudAmber;
      context.font = `700 12px ${FONT}`;
      context.textAlign = 'center';
      context.fillText(`${target.label} · ${distanceText}`, clamp(point.x, 78, W - 78), point.y - s - 8);
    } else {
      // Direction in screen space; a target behind the camera flips the axis.
      let dx = point ? point.x - W / 2 : (target.x - plane.x);
      let dy = point ? point.y - H / 2 : -(target.y - plane.y);
      if (point && point.d < 8) {
        dx = target.x - plane.x;
        dy = -(target.y - plane.y);
      }
      if (!point) {
        dx = target.x - plane.x;
        dy = -(target.y - plane.y);
      }
      const length = Math.hypot(dx, dy) || 1;
      const ux = dx / length;
      const uy = dy / length;
      const cx = W / 2 + ux * (W / 2 - margin);
      const cy = H / 2 + uy * (H / 2 - margin);
      const angle = Math.atan2(uy, ux);
      context.translate(cx, cy);
      context.rotate(angle);
      context.fillStyle = PALETTE.hudAmber;
      context.beginPath();
      context.moveTo(16, 0);
      context.lineTo(-10, -10);
      context.lineTo(-4, 0);
      context.lineTo(-10, 10);
      context.closePath();
      context.fill();
      context.rotate(-angle);
      context.translate(-cx, -cy);
      context.fillStyle = PALETTE.hudAmber;
      context.font = `700 12px ${FONT}`;
      context.textAlign = 'center';
      context.fillText(`${target.label} · ${distanceText}`, cx, cy + 30);
    }
    context.restore();
  }

  /**
   * PAPI glidepath lights beside the Merapi threshold, once the sortie is on
   * final: four lamps that read white when high, red when low, two-and-two on
   * the 3° slope — the same language real strips speak.
   */
  function drawPapi(camera, world) {
    const mission = world.mission;
    if (!mission.landing || nextRing(mission)) return;
    const plane = world.plane;
    if (plane.grounded) return;
    const runway = mission.targetRunway;
    const thresholdZ = runway.z - 150;
    const distance = thresholdZ - plane.z;
    if (distance < 60 || distance > 3400) return;
    const groundY = world.terrain.heightAt(0, thresholdZ);
    const glideAngle = Math.atan2(Math.max(0, plane.y - groundY), distance);
    const onSlope = (3 * Math.PI) / 180;
    const whites = glideAngle > onSlope + 0.014 ? 4 : glideAngle > onSlope + 0.005 ? 3 : glideAngle > onSlope - 0.005 ? 2 : glideAngle > onSlope - 0.014 ? 1 : 0;
    for (let index = 0; index < 4; index += 1) {
      const point = project(camera, { x: -24 - index * 3.2, y: groundY + 1.2, z: thresholdZ });
      if (!point) continue;
      const radius = clamp(900 / point.d, 2, 7);
      context.save();
      context.fillStyle = index < whites ? '#f5f2e8' : PALETTE.hudRed;
      context.shadowColor = context.fillStyle;
      context.shadowBlur = 8;
      context.beginPath();
      context.arc(point.x, point.y, radius, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
    // The verdict in words, under the compass: the slope, said plainly.
    context.save();
    context.fillStyle = whites >= 3 ? PALETTE.text : whites === 2 ? PALETTE.hudGreen : PALETTE.hudRed;
    context.font = `700 13px ${FONT}`;
    context.textAlign = 'center';
    context.fillText(whites >= 3 ? 'HIGH — ease her down' : whites === 2 ? 'ON THE SLOPE' : 'LOW — add power', W / 2, 148);
    context.restore();
  }

  /** The whole HUD: compass, tapes, attitude, gauges, mission and messages. */
  function drawHud(world, plane, best) {
    const mission = world.mission;
    const speedKt = plane.speed * MS_TO_KT;
    const altitudeFt = plane.y * M_TO_FT;
    // Mission panel, top left.
    glassPanel(16, 12, 300, 86, mission.name);
    context.fillStyle = PALETTE.text;
    context.font = `600 12px ${FONT}`;
    context.textAlign = 'left';
    const objective = mission.rings.length > 0
      ? `Rings ${mission.ringIndex}/${mission.rings.length}${mission.landing ? '  ·  then land at Merapi' : ''}`
      : 'Land at Merapi Strip — gentle and straight';
    context.fillText(objective, 26, 44);
    const timeLeft = Math.max(0, mission.timeLimit - mission.elapsed);
    context.fillStyle = timeLeft < 30 ? PALETTE.hudRed : PALETTE.muted;
    context.font = `700 15px ${FONT}`;
    context.fillText(`TIME ${Math.floor(timeLeft / 60)}:${String(Math.floor(timeLeft % 60)).padStart(2, '0')}`, 26, 68);
    context.fillStyle = PALETTE.hudAmber;
    context.font = `700 15px ${FONT}`;
    context.fillText(`SCORE ${mission.score}`, 26, 88);
    // Score, top right.
    context.fillStyle = PALETTE.text;
    context.font = `700 13px ${FONT}`;
    context.textAlign = 'right';
    context.fillText(`BEST ${best}`, W - 20, 30);
    drawCompass(plane);
    drawTape(56, 300, 260, speedKt, 10, (v) => String(v), PALETTE.hudCyan, 52);
    context.fillStyle = PALETTE.muted;
    context.font = `700 11px ${FONT}`;
    context.textAlign = 'center';
    context.fillText('KNOTS', 56, 300 - 148);
    drawTape(W - 56, 300, 260, altitudeFt, 100, (v) => String(v), PALETTE.hudCyan);
    context.fillStyle = PALETTE.muted;
    context.fillText('FEET', W - 56, 300 - 148);
    const aglFt = Math.max(0, (plane.y - world.terrain.heightAt(plane.x, plane.z)) * M_TO_FT);
    context.fillStyle = PALETTE.text;
    context.font = `600 12px ${FONT}`;
    context.fillText(`AGL ${Math.round(aglFt)} ft`, W - 56, 300 + 164);
    drawAttitudeBall(W / 2, H - 62, 46, plane);
    drawGauges(world, plane);
    // Controls hint, bottom left.
    context.fillStyle = 'rgba(238,244,247,0.75)';
    context.font = `600 12px ${FONT}`;
    context.textAlign = 'left';
    context.fillText('↑↓ pitch · ←→ bank · Shift/Ctrl throttle · G flaps · B brake · mouse steers · P pause', 16, H - 14);
    // Centre messages: rings, touchdowns, warnings.
    if (world.message && world.time < world.messageUntil) {
      context.fillStyle = 'rgba(16,24,32,0.7)';
      const messageWidth = context.measureText(world.message).width + 36;
      context.beginPath();
      context.roundRect(W / 2 - messageWidth / 2, 92, messageWidth, 34, 8);
      context.fill();
      context.fillStyle = PALETTE.hudAmber;
      context.font = `700 16px ${FONT}`;
      context.textAlign = 'center';
      context.fillText(world.message, W / 2, 115);
    }
    if (plane.stalled) {
      context.fillStyle = Math.floor(world.time * 4) % 2 === 0 ? PALETTE.hudRed : 'rgba(255,90,78,0.4)';
      context.font = `700 22px ${FONT}`;
      context.textAlign = 'center';
      context.fillText('STALL — NOSE DOWN, POWER UP', W / 2, 160);
    }
    // The combo, while it lives: a streak is worth showing off.
    if (mission.combo > 1) {
      context.fillStyle = PALETTE.hudAmber;
      context.font = `700 13px ${FONT}`;
      context.textAlign = 'left';
      context.fillText(`COMBO ×${Math.min(2, 1 + 0.25 * (mission.combo - 1)).toFixed(2).replace(/\.?0+$/, '')} — ${mission.combo} rings in a row`, 26, 108);
    }
    // First-seconds coaching: how to get off the ground, said once, plainly.
    if (plane.grounded && plane.speed < PLANE.stallSpeed && mission.elapsed < 30) {
      context.fillStyle = 'rgba(16,24,32,0.7)';
      context.beginPath();
      context.roundRect(W / 2 - 250, H - 120, 500, 36, 8);
      context.fill();
      context.fillStyle = PALETTE.text;
      context.font = `700 15px ${FONT}`;
      context.textAlign = 'center';
      context.fillText('THROTTLE UP — hold SHIFT · pull ↑ gently at 55 kt', W / 2, H - 97);
    }
    // On final without flaps is a fast arrival: say so before the strip does.
    if (mission.landing && !nextRing(mission) && !plane.grounded && !plane.flaps) {
      const distance = mission.targetRunway.z - plane.z;
      if (distance > 0 && distance < 3000) {
        context.fillStyle = PALETTE.hudAmber;
        context.font = `700 13px ${FONT}`;
        context.textAlign = 'center';
        context.fillText('ON FINAL — flaps G · slow below 90 kt · aim for the PAPI lights', W / 2, 172);
      }
    }
  }

  /** The title screen: the game, its three sorties, and how to fly. */
  function drawTitleScreen(world, best) {
    context.fillStyle = 'rgba(10,18,26,0.55)';
    context.fillRect(0, 0, W, H);
    context.fillStyle = PALETTE.text;
    context.font = `800 64px ${FONT}`;
    context.textAlign = 'center';
    context.fillText('KESTREL RUN', W / 2, 130);
    context.fillStyle = PALETTE.hudAmber;
    context.font = `600 20px ${FONT}`;
    context.fillText('A bush-plane courier over the Merapi valley — fly it like you mean it.', W / 2, 164);
    const cards = MISSIONS.map((mission, index) => ({
      key: String(index + 1),
      name: mission.name,
      tag: mission.tag,
    }));
    cards.forEach((card, index) => {
      const x = W / 2 - 462 + index * 238;
      const y = 220;
      glassPanel(x, y, 218, 110, `${card.key} — ${card.name}`);
      context.fillStyle = PALETTE.muted;
      context.font = `600 12px ${FONT}`;
      context.textAlign = 'left';
      const tag = card.tag.length > 40 ? `${card.tag.slice(0, 39)}…` : card.tag;
      context.fillText(tag, x + 10, y + 52);
      context.fillStyle = PALETTE.hudCyan;
      context.font = `600 12px ${FONT}`;
      context.fillText('Press ' + card.key + (index === 0 ? ' or click' : ''), x + 10, y + 92);
    });
    context.fillStyle = PALETTE.text;
    context.font = `600 15px ${FONT}`;
    context.textAlign = 'center';
    context.fillText('↑ ↓ pitch      ← → bank      Shift / Ctrl throttle      G flaps      B airbrake      mouse steers', W / 2, 400);
    context.fillStyle = PALETTE.muted;
    context.font = `600 14px ${FONT}`;
    context.fillText('Mind the ridges, mind the fuel, and put her down gentle — a hard arrival is a bill for the airframe.', W / 2, 428);
    if (best > 0) {
      context.fillStyle = PALETTE.hudAmber;
      context.font = `700 16px ${FONT}`;
      context.fillText(`BEST SCORE ${best}`, W / 2, 470);
    }
  }

  /** The end of a sortie: what happened, what it was worth, and how to fly again. */
  function drawEndScreen(world, best) {
    const outcome = world.outcome;
    context.fillStyle = 'rgba(10,18,26,0.6)';
    context.fillRect(0, 0, W, H);
    const panelWidth = 560;
    const panelX = W / 2 - panelWidth / 2;
    glassPanel(panelX, 190, panelWidth, 260, world.mission.name);
    context.fillStyle = outcome.type === 'crashed' || outcome.type === 'time' ? PALETTE.hudRed : PALETTE.hudGreen;
    context.font = `800 34px ${FONT}`;
    context.textAlign = 'center';
    context.fillText(outcome.title, W / 2, 262);
    context.fillStyle = PALETTE.text;
    context.font = `600 16px ${FONT}`;
    context.fillText(outcome.detail, W / 2, 300);
    context.fillStyle = PALETTE.hudAmber;
    context.font = `800 26px ${FONT}`;
    context.fillText(`SCORE ${outcome.score}`, W / 2, 350);
    // A finished sortie earns its medal: the grade is the chase between runs.
    const medal = outcome.type === 'rings' || outcome.type === 'landed' ? medalFor(world.mission.id, outcome.score) : null;
    if (medal) {
      context.fillStyle = medal.colour;
      context.font = `800 19px ${FONT}`;
      context.fillText(`★ ${medal.name} STANDARD`, W / 2, 378);
    }
    context.fillStyle = PALETTE.muted;
    context.font = `600 15px ${FONT}`;
    context.fillText(`BEST ${Math.max(best, outcome.score)}`, W / 2, 402);
    context.fillStyle = PALETTE.text;
    context.font = `600 15px ${FONT}`;
    context.fillText('Press R or click to fly again', W / 2, 420);
  }

  /** Paint one frame: the world, the plane, the HUD, and the screen over it. */
  function draw(world, screen, best, now) {
    const plane = world.plane;
    // Speed opens the lens: the faster she flies, the wider the world feels.
    focal = BASE_FOCAL * (1 - clamp((plane.speed - 45) / 500, 0, 0.13));
    const camera = buildCamera(plane);
    context.save();
    // Trauma shakes the world, never the instruments: a scrape rattles the
    // view for a moment, a crash for longer.
    if (world.trauma > 0.01) {
      const shake = world.trauma * world.trauma * 13;
      context.translate(Math.sin(now * 121.7) * shake, Math.cos(now * 149.3) * shake * 0.7);
    }
    const storm = world.mission.gusts;
    drawSky(camera, plane, storm);
    drawDistantPeaks(camera, plane, world.terrain);
    drawTerrain(camera, plane, world.terrain);
    drawRiver(camera, plane, world.terrain);
    drawRunways(camera, world.terrain);
    drawClouds(camera, world.terrain, storm);
    drawRings(camera, world);
    drawPlane(camera, plane, now);
    drawParticles(camera, world);
    drawPopups(camera, world);
    drawTargetGuide(camera, world);
    drawPapi(camera, world);
    context.restore();
    if (storm && screen === 'play') {
      drawRain(now);
      // A bolt lights the whole valley for a frame or two after it strikes.
      const sinceBolt = world.time - world.boltAt;
      if (sinceBolt >= 0 && sinceBolt < 0.13) {
        context.fillStyle = 'rgba(230,238,255,0.20)';
        context.fillRect(0, 0, W, H);
      } else if (sinceBolt >= 0.2 && sinceBolt < 0.3) {
        context.fillStyle = 'rgba(230,238,255,0.10)';
        context.fillRect(0, 0, W, H);
      }
    }
    if (screen === 'title') {
      drawTitleScreen(world, best);
    } else if (screen === 'paused') {
      drawHud(world, plane, best);
      context.fillStyle = 'rgba(10,18,26,0.55)';
      context.fillRect(0, 0, W, H);
      context.fillStyle = PALETTE.text;
      context.font = `800 44px ${FONT}`;
      context.textAlign = 'center';
      context.fillText('PAUSED', W / 2, H / 2);
      context.fillStyle = PALETTE.muted;
      context.font = `600 16px ${FONT}`;
      context.fillText('Press P or Esc to keep flying', W / 2, H / 2 + 34);
    } else if (screen === 'done') {
      drawHud(world, plane, best);
      drawEndScreen(world, best);
    } else {
      drawHud(world, plane, best);
    }
  }

  return { draw };
}
