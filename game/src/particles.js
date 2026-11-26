// Particles: short-lived points in world space that the renderer projects and
// paints — sparks when a ring is threaded, dust when the wheels meet dirt or
// asphalt, debris when the airframe does. Pure garnish: nothing here feeds
// back into the flight model, so a busy sky can never change a score. The one
// rule is a hard cap — past it, the oldest particles are dropped, so a long
// sortie cannot grow the list without bound.

/** The most particles alive at once; bursts trim the oldest to stay under it. */
const MAX_PARTICLES = 700;

/** A fresh, empty particle set for a new world. */
export function createParticles() {
  return { list: [] };
}

/** One particle: a point with a velocity, an age, and the colour it fades in. */
function spawnOne(set, x, y, z, options) {
  set.list.push({
    x,
    y,
    z,
    vx: options.vx ?? 0,
    vy: options.vy ?? 0,
    vz: options.vz ?? 0,
    age: 0,
    life: options.life ?? 0.8,
    size: options.size ?? 0.55,
    colour: options.colour ?? '#ffffff',
    gravity: options.gravity ?? 0,
    drag: options.drag ?? 0,
  });
  if (set.list.length > MAX_PARTICLES) {
    set.list.splice(0, set.list.length - MAX_PARTICLES);
  }
}

/**
 * A burst of sparks flying outward from a point — a ring threaded, a scrape,
 * a crash. `spread` is the launch speed in m/s, randomised per spark.
 */
export function spawnBurst(set, x, y, z, { count = 24, colour = '#ffb02e', spread = 16, life = 0.8, size = 0.55, gravity = -6 } = {}) {
  for (let index = 0; index < count; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const up = (Math.random() - 0.35) * 2;
    const flat = Math.cos(Math.asin(Math.max(-1, Math.min(1, up * 0.5))));
    const speed = spread * (0.35 + Math.random() * 0.85);
    spawnOne(set, x, y, z, {
      vx: Math.cos(angle) * flat * speed,
      vy: up * speed * 0.7,
      vz: Math.sin(angle) * flat * speed,
      life: life * (0.6 + Math.random() * 0.7),
      size: size * (0.7 + Math.random() * 0.6),
      colour,
      gravity,
      drag: 1.6,
    });
  }
}

/**
 * A puff of dust kicked up at ground level: slow, wide, and dragged back, the
 * look of wheels rolling fast over a dry strip or a touchdown's first kiss.
 */
export function spawnDust(set, x, y, z, { count = 10, colour = '#c9b18a', spread = 5, life = 1.1, size = 1.15 } = {}) {
  for (let index = 0; index < count; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = spread * (0.3 + Math.random() * 0.9);
    spawnOne(set, x, y, z, {
      vx: Math.cos(angle) * speed,
      vy: 1 + Math.random() * 2.4,
      vz: Math.sin(angle) * speed - 2,
      life: life * (0.7 + Math.random() * 0.6),
      size: size * (0.8 + Math.random() * 0.7),
      colour,
      gravity: 1.2,
      drag: 1.1,
    });
  }
}

/** Advance every particle one step and drop the ones whose life has run out. */
export function stepParticles(set, dt) {
  const list = set.list;
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const p = list[index];
    p.age += dt;
    if (p.age >= p.life) {
      list.splice(index, 1);
      continue;
    }
    const dragFactor = Math.max(0, 1 - p.drag * dt);
    p.vx *= dragFactor;
    p.vz *= dragFactor;
    p.vy = p.vy * dragFactor + p.gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
  }
}
