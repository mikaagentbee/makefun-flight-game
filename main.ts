// Kestrel Run — the hand-in program (Node 22, standard library only).
//
// The game is plain static files in game/ beside this file: game/index.html and
// its ES modules, no library and no network request. This program copies game/
// and screenshots/ into /output and writes /output/dossier.json, the summary
// the judge reads, with the vendored make.fun library in vendor/.
//
// Serve the game locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

/** The directory this file lives in, and the output directory to fill. */
const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** Copy a directory from the repository into /output, creating it first. */
function copyIntoOutput(name) {
  const source = join(repoRoot, name);
  if (!existsSync(source)) return;
  mkdirSync(join(outputDir, name), { recursive: true });
  cpSync(source, join(outputDir, name), { recursive: true });
}

function handIn() {
  mkdirSync(outputDir, { recursive: true });
  copyIntoOutput('game');
  copyIntoOutput('screenshots');

  // The scorer's own caps (reference/gate.json): only text_max_bytes shapes the
  // bytes; the others refuse an entry the scorer would refuse (more than 4
  // screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of
  // game files, in all, or a path under game/ over 1000 bytes: game/ counts
  // beside /output's own 1000-entry cap, its screenshots/ and dossier.json).
  const dossierOptions = {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  };
  writeFileSync(join(outputDir, 'dossier.json'), buildDossier(outputDir, dossierOptions));
}

handIn();
