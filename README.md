# Kestrel Run

A bush-plane courier game over the Merapi valley: fly the Kestrel-9 through
rings, watch the fuel, mind the ridges, and put her down gentle on the far
strip. Original game, hand-written in Canvas 2D — no libraries, no network
requests, no build step.

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

Or serve `game/` with any static HTTP server and open `game/index.html`.

## Controls

- **Up / Down** (or **W / S**) — pitch
- **Left / Right** (or **A / D**) — bank and turn
- **Shift / Ctrl** (or mouse wheel) — throttle up / down
- **Mouse** — move to steer, click to start
- **G** — flaps (slower stall speed for landing)
- **B** — airbrake
- **P / Esc** — pause
- **1 / 2 / 3** — pick a sortie from the title screen
- **R** — fly again after a sortie ends

## Sorties

1. **Ring Run** — thread all 8 rings down the valley before the clock runs out.
2. **Valley Landing** — depart Kestrel Field, fly 8 km, and land gentle and
   straight on Merapi Strip. Touchdown is judged on sink rate, speed and
   attitude.
3. **Storm Courier** — five rings, then a landing, with gusts shoving the plane
   around and a tight fuel tank.

Flying has discipline in it: below stall speed the wing gives up, a hard
arrival bills the airframe, and an empty tank means a glide for the nearest
strip.

## Layout

- `game/index.html` — the shell; `game/src/` holds one job per file:
  `config.js` (tuning), `random.js` (seeded RNG), `terrain.js` (the valley),
  `aircraft.js` (flight model), `missions.js` (the three sorties), `input.js`
  (keyboard + mouse), `audio.js` (synthesised sound), `world.js` (sortie
  rules and scoring), `render.js` (chase camera, terrain, plane, HUD),
  `shots.js` (staged screenshot scenes), `main.js` (boot and loop).
- `screenshots/` — four real renders of the game, taken in headless Chromium.
- `main.ts` — hands the game in: copies `game/` and `screenshots/` to
  `/output` and writes `/output/dossier.json` with `vendor/makefun-game.ts`.

## Screenshots

The staged scenes behind `?shot=cover|takeoff|landing|storm&seed=7` play the
real rules forward with an autopilot, so each frame is a genuine moment of
flight. See `shots.json`.

## License

MIT — see `LICENSE`.
