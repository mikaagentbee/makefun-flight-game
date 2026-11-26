// Every sound the game makes is synthesised in the browser: an engine hum that
// follows the throttle, wind that follows the speed, and short blips for rings,
// touchdowns and trouble. No audio files, no network, and silence until the
// player first presses a key or clicks (browsers demand the gesture).

/** Create the sound board. Call `unlock()` from a user gesture; all other calls are safe any time. */
export function createAudio() {
  let context = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let windGain = null;
  let windFilter = null;
  let muted = false;

  function ensure() {
    if (context) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      // Engine: two detuned saws through a low pass, quiet until it is told to run.
      engineOsc = context.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineOsc2 = context.createOscillator();
      engineOsc2.type = 'sawtooth';
      engineOsc2.frequency.value = 58;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      const engineFilter = context.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineOsc.connect(engineFilter);
      engineOsc2.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(context.destination);
      engineOsc.start();
      engineOsc2.start();
      // Wind: looped noise through a band pass, louder and higher with speed.
      const noiseLength = context.sampleRate * 2;
      const noiseBuffer = context.createBuffer(1, noiseLength, context.sampleRate);
      const noiseData = noiseBuffer.getChannelData(0);
      for (let index = 0; index < noiseLength; index += 1) noiseData[index] = Math.random() * 2 - 1;
      const noise = context.createBufferSource();
      noise.buffer = noiseBuffer;
      noise.loop = true;
      windFilter = context.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 700;
      windFilter.Q.value = 0.6;
      windGain = context.createGain();
      windGain.gain.value = 0;
      noise.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(context.destination);
      noise.start();
      return true;
    } catch {
      return false;
    }
  }

  /** Start the audio context from a user gesture; safe to call more than once. */
  function unlock() {
    if (ensure() && context.state === 'suspended') context.resume().catch(() => {});
  }

  /** Keep the engine and wind following the plane: throttle 0..1, speed m/s. */
  function update(throttle, speed) {
    if (!context || muted) return;
    const now = context.currentTime;
    const engineLevel = 0.05 + throttle * 0.06;
    engineGain.gain.setTargetAtTime(engineLevel, now, 0.1);
    engineOsc.frequency.setTargetAtTime(48 + throttle * 70, now, 0.1);
    engineOsc2.frequency.setTargetAtTime(51 + throttle * 73, now, 0.1);
    const windLevel = Math.min(0.16, (speed / 96) * 0.16);
    windGain.gain.setTargetAtTime(windLevel, now, 0.15);
    windFilter.frequency.setTargetAtTime(400 + speed * 9, now, 0.15);
  }

  /** A short tone: frequency, seconds, and a sine or triangle voice. */
  function blip(frequency, duration, type = 'sine', volume = 0.12) {
    if (!ensure() || muted) return;
    try {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = type;
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(volume, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
      osc.connect(gain);
      gain.connect(context.destination);
      osc.start();
      osc.stop(context.currentTime + duration);
    } catch {
      // Sound is garnish: a failure here never stops the game.
    }
  }

  return {
    unlock,
    update,
    /** Two-note chime when a ring is threaded. */
    ring() {
      blip(880, 0.18, 'sine', 0.14);
      setTimeout(() => blip(1318, 0.28, 'sine', 0.14), 90);
    },
    /** A low thud for a touchdown. */
    thud() {
      blip(90, 0.25, 'triangle', 0.2);
    },
    /** A scrape: a short buzz of warning. */
    scrape() {
      blip(180, 0.3, 'sawtooth', 0.1);
    },
    /** A crash: noise and a falling tone. */
    crash() {
      blip(70, 0.8, 'sawtooth', 0.22);
      setTimeout(() => blip(45, 0.9, 'triangle', 0.2), 120);
    },
    /** A stall warning: two sharp beeps. */
    stall() {
      blip(1200, 0.1, 'square', 0.07);
      setTimeout(() => blip(1200, 0.1, 'square', 0.07), 160);
    },
    /** A fanfare for a finished sortie. */
    fanfare() {
      [523, 659, 784, 1047].forEach((note, index) => {
        setTimeout(() => blip(note, 0.35, 'triangle', 0.13), index * 130);
      });
    },
    mute() {
      muted = true;
      if (engineGain) engineGain.gain.value = 0;
      if (windGain) windGain.gain.value = 0;
    },
  };
}
