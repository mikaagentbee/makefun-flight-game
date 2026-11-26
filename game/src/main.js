// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between four screens: title, play, paused
// and done.
//
// ?seed=N fixes the valley, the rings and the clouds. ?shot=cover|takeoff|
// landing|storm (with &seed=N) stages that scene instead of running the loop,
// paints it twice and sets window.__shotReady for a screenshot.

import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createTerrain } from './terrain.js';
import { createWorld, EVENT_COMPLETE, EVENT_CRASH, EVENT_FUEL, EVENT_LAND, EVENT_RING, EVENT_SCRAPE, EVENT_STALL, EVENT_TIME, autopilot, resetWorld, stepWorld } from './world.js';
import { MISSIONS } from './missions.js';
import { ACTION_BRAKE, ACTION_CONFIRM, ACTION_FLAPS, ACTION_MISSION_1, ACTION_MISSION_2, ACTION_MISSION_3, ACTION_PAUSE, ACTION_RESTART, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const terrain = createTerrain(seed);
const world = createWorld(terrain, MISSIONS[0]);
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world, scene.screen, 0, performance.now() / 1000);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = 'title';
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let stallBeepAt = 0;

  // Screen readers (and anyone watching the page's text) hear the screen changes and each event.
  function announce(message) {
    status.textContent = message;
  }

  function startMission(index) {
    resetWorld(world, MISSIONS[index]);
    accumulator = 0;
    screen = 'play';
    audio.unlock();
    announce(`Flying ${MISSIONS[index].name}. ${MISSIONS[index].brief}`);
  }

  function endSortie() {
    screen = 'done';
    if (world.outcome.score > best) {
      best = world.outcome.score;
      saveBest(best);
    }
    announce(`${world.outcome.title}. Score ${world.outcome.score}. Best ${best}.`);
  }

  function handleEvents(events) {
    if (events & EVENT_RING) audio.ring();
    if (events & EVENT_LAND) audio.thud();
    if (events & EVENT_SCRAPE) audio.scrape();
    if (events & EVENT_CRASH) audio.crash();
    if (events & EVENT_COMPLETE) audio.fanfare();
    if (events & EVENT_FUEL) announce('Fuel empty. Engine out.');
    if (events & EVENT_TIME) announce('Out of time.');
    if (events & EVENT_STALL) {
      const now = performance.now();
      if (now - stallBeepAt > 1200) {
        stallBeepAt = now;
        audio.stall();
      }
    }
    if (events & (EVENT_COMPLETE | EVENT_CRASH | EVENT_TIME)) endSortie();
  }

  function handleActions() {
    const actions = input.takeActions();
    if (input.clicked()) {
      audio.unlock();
      if (screen === 'title') startMission(0);
      else if (screen === 'done') startMission(0);
      return;
    }
    if (actions & ACTION_MISSION_1 && screen !== 'play') startMission(0);
    else if (actions & ACTION_MISSION_2 && screen !== 'play') startMission(1);
    else if (actions & ACTION_MISSION_3 && screen !== 'play') startMission(2);
    else if (actions & ACTION_CONFIRM && screen === 'title') startMission(0);
    else if (actions & ACTION_CONFIRM && screen === 'done') startMission(0);
    else if (actions & ACTION_RESTART && screen === 'done') startMission(0);
    else if (actions & ACTION_PAUSE && screen === 'play') {
      screen = 'paused';
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === 'paused') {
      screen = 'play';
      announce('Flying.');
    }
    if (actions & ACTION_FLAPS && screen === 'play') {
      world.plane.flaps = !world.plane.flaps;
      announce(world.plane.flaps ? 'Flaps down.' : 'Flaps up.');
    }
    if (actions & ACTION_BRAKE && screen === 'play') {
      world.plane.airbrake = !world.plane.airbrake;
      announce(world.plane.airbrake ? 'Airbrake out.' : 'Airbrake in.');
    }
  }

  /** One step of the title screen's attract flight: the autopilot flies the valley behind the menu. */
  function stepTitle() {
    const controls = autopilot(world);
    world.plane.throttle = controls.throttle;
    world.plane.flaps = controls.flaps;
    stepWorld(world, { pitch: controls.pitch, roll: controls.roll }, 0);
    if (world.phase === 'done') resetWorld(world, MISSIONS[0]);
  }

  function step() {
    const events = stepWorld(world, input.stick(), input.throttleDelta(STEP));
    handleEvents(events);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === 'title' || screen === 'play') {
      while (accumulator >= STEP && (screen === 'title' || screen === 'play')) {
        if (screen === 'title') stepTitle();
        else step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    audio.update(world.plane.throttle, world.plane.speed);
    renderer.draw(world, screen, best, now / 1000);
  }

  // Leaving the tab pauses a running game rather than letting the valley fly by unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'play') {
      screen = 'paused';
      announce('Paused.');
    }
  });

  announce('Kestrel Run. Press 1, 2 or 3 to pick a sortie, or click to fly.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
