// Kestrel Run — every tuning number and colour in one place.
// The world is metres, the sky is a valley 8 km long, and the renderer paints a
// fixed 1280x720 logical frame scaled to the window, so no rule below depends on
// the screen size.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Knots per metre per second, and feet per metre: the HUD reads aviation units. */
export const MS_TO_KT = 1.94384;
export const M_TO_FT = 3.28084;

export const PLANE = {
  /** Wingspan, metres: the chase camera sits this far back and a little above. */
  span: 9.2,
  length: 7.4,
  /** Camera distance behind the plane and height above it, in metres. */
  camBack: 15,
  camUp: 4.2,
  /** Full-throttle level speed, m/s; flaps cut it to 72%. */
  maxSpeed: 96,
  /** Below this the wing stops lifting and the nose drops. */
  stallSpeed: 27,
  /** How fast the nose and the bank answer the stick, radians per second. */
  pitchRate: 1.5,
  rollRate: 3.0,
  /** Pitch and bank the stick can ask for, radians. */
  maxPitch: 0.38,
  maxBank: 1.0,
  /** Acceleration toward the throttle's target speed, m/s per second. */
  accel: 11,
  drag: 7,
};

export const FUEL = {
  /** Units the tank holds at the start of a sortie. */
  start: 100,
  /** Burn per second at idle, plus this per second at full throttle. */
  idleBurn: 0.04,
  fullBurn: 0.3,
  /** Below this the LOW FUEL lamp comes on. */
  lowAt: 18,
};

export const DAMAGE = {
  /** Integrity at the start of a sortie; a scrape costs 12, a hard bounce 25. */
  start: 100,
  scrape: 12,
  hardBounce: 25,
};

/** A landing only counts when it is this gentle and this straight. */
export const LANDING = {
  maxSink: 3.2,
  maxSpeed: 48,
  maxBank: 0.2,
  maxPitch: 0.15,
};

/** Rings: how many, how far apart, how wide, and how high over the valley floor. */
export const RINGS = { count: 8, firstZ: 900, spacing: 850, radius: 26, height: 55 };

/** Course length in metres: Kestrel Field at z=0, Merapi Strip at z=8000. */
export const COURSE = { length: 8000, runwayHalfWidth: 15, runwayHalfLength: 200 };

export const PALETTE = {
  skyTop: '#2f6fb4',
  skyMid: '#7db4dd',
  skyLow: '#cfe8f2',
  haze: '#bcd8e8',
  sun: '#fff3c4',
  grassLow: '#5d8f4a',
  grassHigh: '#7fae5e',
  rock: '#8a7f72',
  snow: '#eef3f6',
  river: '#3f8fbf',
  runway: '#3a3f46',
  runwayLine: '#f5f2e8',
  ringNext: '#ffb02e',
  ringDone: '#58d68d',
  ringOther: '#57c8e8',
  planeBody: '#e8622c',
  planeWing: '#f5f0e6',
  planeTrim: '#1f6f8b',
  panel: '#101820',
  panelEdge: '#2c3e50',
  hudCyan: '#7fe7ff',
  hudAmber: '#ffb02e',
  hudRed: '#ff5a4e',
  hudGreen: '#58d68d',
  text: '#eef4f7',
  muted: '#9db4c0',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'kestrel-run.best';
