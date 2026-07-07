// Aperture voice engine — mono voice descended from the Prodigy recreation:
// 2 VCOs (polyBLEP, hard sync) + SUB oscillator -> mixer -> 4-pole tanh ladder
// (with audio-rate sub->cutoff "growl" FM) -> VCA, dual ADSR envelopes,
// 4-shape LFO (sine/tri/unipolar square/S&H) routed via the mod wheel,
// linear constant-rate glide, low-note priority, single triggering.
// Plus: sample-accurate 32-step sequencer clock and a stereo FX chain
// (mod fx -> delay -> reverb). Voice runs 2x oversampled; FX run at base rate.

/* eslint-disable no-plusplus */

// ---- voicing constants -------------------------------------- TUNE BY EAR --
const TUNE_RANGE_ST = 2.5;
const PITCH_WHEEL_ST = 7;
const INTERVAL_ST = 7;
const OSC_MOD_DEPTH_ST = 4;
const FILTER_MOD_OCT = 3;
const CONTOUR_OCT = 5.5;
const GROWL_OCT = 2.5;            // sub->cutoff FM span at full MOD AMOUNT
const GLIDE_MIN_S_PER_OCT = 0.008;
const GLIDE_MAX_S_PER_OCT = 2.5;
const LFO_MIN_HZ = 0.3, LFO_MAX_HZ = 30;
const CUT_MIN_HZ = 12, CUT_MAX_HZ = 16000;
const ENV_MIN_S = 0.001, ENV_MAX_S = 10.0; // A/D/R slider range
const ATTACK_OVERSHOOT = 1.17;
const EMPHASIS_MAX_K = 4.15;
const LADDER_DRIVE = 0.72;
const OSC1_PULSE_DUTY = 0.10;
const OSC2_SQUARE_DUTY = 0.50;
const KBD_TRACK_CENTER = 44.5;
const OUT_GAIN = 2.0;
const LOW_NOTE_PRIORITY = true;

const CONTROL_INTERVAL = 16;
const LN2 = Math.LN2;
const TWO_PI = Math.PI * 2;

// ---- FX constants ------------------------------------------- TUNE BY EAR --
const MODFX_RATE_MIN = 0.05, MODFX_RATE_MAX = 8;   // Hz
const DLY_MIN_S = 0.03, DLY_MAX_S = 1.2;
const DLY_MAX_FB = 0.75;
const DLY_SYNC_DIVS = [0.25, 1 / 3, 0.5, 0.75, 1, 1.5, 2]; // beats: 16th, 8T, 8th, 8., 1/4, 1/4., 1/2
const REV_WET_MAX = 0.85;

// ---- sequencer --------------------------------------------------------------
const SEQ_STEPS = 32;
const SEQ_GATE = 0.7;             // fraction of a step

// ---- helpers ---------------------------------------------------------------

function ftanh(x) {
  if (x > 3) return 1;
  if (x < -3) return -1;
  const x2 = x * x;
  return (x * (27 + x2)) / (27 + 9 * x2);
}

function midiHz(n) {
  return 440 * Math.pow(2, (n - 69) / 12);
}

// One oscillator: naive wave + 1-sample-delayed polyBLEP edge correction.
class Osc {
  constructor() {
    this.t = 0;
    this.dt = 0.001;
    this.wave = 0;       // 0 saw, 1 tri, 2 pulse
    this.duty = 0.5;
    this.prevOut = 0;
    this.tri = 0;
    this.wrapped = false;
    this.wrapFrac = 0;
  }

  step(syncFrac) {
    const dtPrev = this.dt;
    const tPrev = this.t;
    let t = this.t + this.dt;

    let edgeCorrPrev = 0;
    let edgeCorrCur = 0;
    const applyEdge = (frac, h) => {
      const a = frac;
      edgeCorrCur += -(h / 2) * (2 * a - a * a - 1);
      edgeCorrPrev += -(h / 2) * (a * a);
    };

    const isPulse = this.wave !== 0;
    const duty = this.wave === 1 ? 0.5 : this.duty;

    this.wrapped = false;

    if (t >= 1) {
      t -= 1;
      this.wrapped = true;
      this.wrapFrac = t / this.dt;
      if (this.wave === 0) applyEdge(this.wrapFrac, 2);
      else applyEdge(this.wrapFrac, -2);
    }
    if (isPulse && !this.wrapped && tPrev < duty && t >= duty) {
      applyEdge((t - duty) / this.dt, 2);
    }

    if (syncFrac != null) {
      const oldNaive = this.rawAt(t, duty);
      const tNew = syncFrac * this.dt;
      const newNaive = this.rawAt(tNew, duty);
      const h = oldNaive - newNaive;
      if (Math.abs(h) > 1e-4) applyEdge(syncFrac, h);
      t = tNew;
      this.wrapped = true;
      this.wrapFrac = syncFrac;
    }

    this.t = t;

    const raw = this.rawAt(t, duty);
    const outPrev = this.prevOut + edgeCorrPrev;
    this.prevOut = raw + edgeCorrCur;

    if (this.wave === 1) {
      this.tri = this.tri * 0.9995 + 4 * dtPrev * outPrev;
      return this.tri;
    }
    if (this.wave === 2) return outPrev - (2 * duty - 1);
    return outPrev;
  }

  rawAt(t, duty) {
    if (this.wave === 0) return 2 * t - 1;
    return t < duty ? 1 : -1;
  }
}

// Full ADSR envelope, RC-exponential segments, retrigger-from-current-level.
class Env {
  constructor() {
    this.v = 0;
    this.stage = 0; // 0 idle, 1 attack, 2 decay/sustain, 3 release
    this.aCoef = 0.01;
    this.dCoef = 0.001;
    this.rCoef = 0.001;
    this.sustain = 0.5;
  }
  gateOn() { this.stage = 1; }
  gateOff() { if (this.stage !== 0) this.stage = 3; }
  step() {
    switch (this.stage) {
      case 1:
        this.v += (ATTACK_OVERSHOOT - this.v) * this.aCoef;
        if (this.v >= 1) { this.v = 1; this.stage = 2; }
        break;
      case 2:
        this.v += (this.sustain - this.v) * this.dCoef;
        break;
      case 3:
        this.v += -this.v * this.rCoef;
        if (this.v < 1e-5) { this.v = 0; this.stage = 0; }
        break;
      default:
        break;
    }
    return this.v;
  }
}

// ---- FX blocks (base rate, stereo) -----------------------------------------

// linear-interp read from a ring buffer, delay in (fractional) samples
function ringRead(buf, writeIdx, delay) {
  const len = buf.length;
  let pos = writeIdx - delay;
  pos = ((pos % len) + len) % len;
  const i0 = pos | 0;
  const frac = pos - i0;
  const i1 = (i0 + 1) % len;
  return buf[i0] * (1 - frac) + buf[i1] * frac;
}

// MOD FX: 0 chorus, 1 flanger, 2 phaser
class ModFX {
  constructor(fs) {
    this.fs = fs;
    this.buf = new Float32Array(1 << 13);
    this.w = 0;
    this.lfo = 0;
    this.apL = new Float32Array(4);
    this.apR = new Float32Array(4);
    this.phFbL = 0; this.phFbR = 0;
  }

  apCoef(f) {
    const t = Math.tan(Math.PI * Math.min(f, this.fs * 0.45) / this.fs);
    return (t - 1) / (t + 1);
  }

  process(x, type, rateHz, depth, out) {
    this.lfo += rateHz / this.fs;
    if (this.lfo >= 1) this.lfo -= 1;
    const s = Math.sin(TWO_PI * this.lfo);
    const c = Math.cos(TWO_PI * this.lfo);

    if (type === 2) {
      // phaser: 4 swept first-order allpasses per channel, quadrature L/R
      const sweep = Math.min(1, depth * 1.2);
      const aL = this.apCoef(300 * Math.pow(6, 0.5 + 0.5 * s * sweep));
      const aR = this.apCoef(300 * Math.pow(6, 0.5 + 0.5 * c * sweep));
      const fbAmt = 0.45 * depth;

      let yl = x + this.phFbL * fbAmt;
      for (let i = 0; i < 4; i++) {
        const t = this.apL[i];
        const y = aL * yl + t;
        this.apL[i] = yl - aL * y;
        yl = y;
      }
      this.phFbL = yl;

      let yr = x + this.phFbR * fbAmt;
      for (let i = 0; i < 4; i++) {
        const t = this.apR[i];
        const y = aR * yr + t;
        this.apR[i] = yr - aR * y;
        yr = y;
      }
      this.phFbR = yr;

      const mix = 0.5 * depth + 0.2;
      out[0] = x * (1 - mix * 0.5) + yl * mix;
      out[1] = x * (1 - mix * 0.5) + yr * mix;
      return;
    }

    // chorus / flanger share the modulated delay line
    let base, dep, fbAmt;
    if (type === 1) { // flanger
      base = 0.0030 * this.fs;
      dep = 0.0024 * this.fs * depth;
      fbAmt = 0.6 * depth;
    } else { // chorus
      base = 0.014 * this.fs;
      dep = 0.007 * this.fs * depth;
      fbAmt = 0;
    }
    const tapL = ringRead(this.buf, this.w, base + dep * (0.5 + 0.5 * s) + 1);
    const tapR = ringRead(this.buf, this.w, base + dep * (0.5 + 0.5 * c) + 1);
    this.buf[this.w] = x + tapL * fbAmt;
    this.w = (this.w + 1) % this.buf.length;
    const wet = type === 1 ? 0.5 + 0.3 * depth : 0.45 + 0.35 * depth;
    out[0] = x * (1 - wet * 0.4) + tapL * wet;
    out[1] = x * (1 - wet * 0.4) + tapR * wet;
  }
}

// DELAY: 0 stereo, 1 pingpong, 2 tape
class StereoDelay {
  constructor(fs) {
    this.fs = fs;
    const n = Math.ceil(fs * (DLY_MAX_S + 0.1));
    this.bufL = new Float32Array(n);
    this.bufR = new Float32Array(n);
    this.w = 0;
    this.timeCur = fs * 0.3;
    this.lpL = 0; this.lpR = 0;
    this.wow = 0;
  }

  process(xl, xr, type, timeS, depth, out) {
    const target = Math.min(timeS * this.fs, this.bufL.length - 4);
    this.timeCur += (target - this.timeCur) * 0.0004;
    let readT = this.timeCur;
    if (type === 2) {
      this.wow += 0.9 / this.fs;
      if (this.wow >= 1) this.wow -= 1;
      readT *= 1 + 0.0022 * Math.sin(TWO_PI * this.wow);
    }

    let dl = ringRead(this.bufL, this.w, readT);
    let dr = ringRead(this.bufR, this.w, readT);

    const fb = Math.min(DLY_MAX_FB, depth * 0.9);
    const wet = Math.min(1, depth * 1.3) * 0.55;

    if (type === 2) {
      this.lpL += (dl - this.lpL) * 0.25;
      this.lpR += (dr - this.lpR) * 0.25;
      dl = this.lpL; dr = this.lpR;
    }

    if (type === 1) {
      // pingpong: input enters the left line, lines cross-feed
      this.bufL[this.w] = (xl + xr) * 0.5 + dr * fb;
      this.bufR[this.w] = dl * fb;
    } else {
      this.bufL[this.w] = xl + dl * fb;
      this.bufR[this.w] = xr + dr * fb;
    }
    this.w = (this.w + 1) % this.bufL.length;

    out[0] = xl + dl * wet;
    out[1] = xr + dr * wet;
  }
}

// REVERB: Dattorro-style plate tank. type 0 = plate (bright), 1 = hall (darker/longer).
class DelayLine {
  constructor(n) { this.buf = new Float32Array(n); this.i = 0; this.n = n; }
  read(off) {
    let p = this.i - off;
    p = ((p % this.n) + this.n) % this.n;
    return this.buf[p | 0];
  }
  tail() { return this.buf[this.i]; }
  push(v) { this.buf[this.i] = v; this.i = (this.i + 1) % this.n; }
}

class Allpass {
  constructor(n, g) { this.dl = new DelayLine(n); this.g = g; }
  process(x) {
    // lattice allpass: v[n] = x + g·v[n-N]; y = v[n-N] - g·v[n]
    const vOld = this.dl.tail();
    const vNew = x + this.g * vOld;
    this.dl.push(vNew);
    return vOld - this.g * vNew;
  }
  read(off) { return this.dl.read(off); }
}

class PlateReverb {
  constructor(fs) {
    this.fs = fs;
    const k = fs / 29761;
    const L = (n) => Math.max(2, Math.round(n * k));
    this.k = k;
    this.pre = new DelayLine(L(1400));
    this.inLp = 0;
    this.ap1 = new Allpass(L(142), 0.75);
    this.ap2 = new Allpass(L(107), 0.75);
    this.ap3 = new Allpass(L(379), 0.625);
    this.ap4 = new Allpass(L(277), 0.625);
    this.apA = new Allpass(L(672), 0.7);
    this.dA1 = new DelayLine(L(4453));
    this.dampA = 0;
    this.apA2 = new Allpass(L(1800), 0.5);
    this.dA2 = new DelayLine(L(3720));
    this.apB = new Allpass(L(908), 0.7);
    this.dB1 = new DelayLine(L(4217));
    this.dampB = 0;
    this.apB2 = new Allpass(L(2656), 0.5);
    this.dB2 = new DelayLine(L(3163));
  }

  process(xl, xr, type, timeV, depth, out) {
    const decay = 0.55 + 0.42 * timeV + (type === 1 ? 0.02 : 0);
    const dampC = type === 1 ? 0.45 : 0.22;
    const x = (xl + xr) * 0.5;

    this.pre.push(x);
    const preOff = Math.min((type === 1 ? 0.028 : 0.011) * this.fs, this.pre.n - 2);
    let v = this.pre.read(preOff);
    this.inLp += (v - this.inLp) * 0.7;
    v = this.inLp;
    v = this.ap1.process(v);
    v = this.ap2.process(v);
    v = this.ap3.process(v);
    v = this.ap4.process(v);

    const fbB = this.dB2.tail() * decay;
    const fbA = this.dA2.tail() * decay;

    const a = this.apA.process(v + fbB);
    this.dA1.push(a);
    this.dampA += (this.dA1.tail() - this.dampA) * (1 - dampC);
    this.dA2.push(this.apA2.process(this.dampA * decay));

    const b = this.apB.process(v + fbA);
    this.dB1.push(b);
    this.dampB += (this.dB1.tail() - this.dampB) * (1 - dampC);
    this.dB2.push(this.apB2.process(this.dampB * decay));

    const k = this.k;
    const T = (n) => Math.round(n * k);
    let yl = this.dA1.read(T(266)) + this.dA1.read(T(2974))
      - this.apA2.read(T(1913)) + this.dA2.read(T(1996))
      - this.dB1.read(T(1990)) - this.apB2.read(T(187)) - this.dB2.read(T(1066));
    let yr = this.dB1.read(T(353)) + this.dB1.read(T(3627))
      - this.apB2.read(T(1228)) + this.dB2.read(T(2673))
      - this.dA1.read(T(2111)) - this.apA2.read(T(335)) - this.dA2.read(T(121));

    const wet = depth * depth * REV_WET_MAX;
    out[0] = xl + yl * 0.55 * wet;
    out[1] = xr + yr * 0.55 * wet;
  }
}

// ---- the processor ----------------------------------------------------------

class ApertureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.fsOS = sampleRate * 2;

    this.p = {
      tune: 0.5, glide: 0, modRate: 0.45, modAmount: 0, modShape: 0, oscMod: 0,
      osc2Mod: 0,
      osc1Octave: 1, sync: 0, osc1Wave: 0,
      osc2Octave: 1, osc2Interval: 0.5, osc2Wave: 0,
      subOctave: 0,
      mixOsc1: 0.8, mixOsc2: 0.8, mixSub: 0,
      filterMod: 0, masterVolume: 0.75, kbdTracking: 2,
      contourAmount: 0.35, cutoff: 0.7, emphasis: 0.25,
      fAttack: 0.05, fDecay: 0.45, fSustain: 0.4, fRelease: 0.2,
      lAttack: 0.03, lDecay: 0.5, lSustain: 0.85, lRelease: 0.25,
      modFxOn: 0, modFxType: 0, modFxTime: 0.35, modFxDepth: 0.5,
      dlyOn: 0, dlySync: 0, dlyType: 0, dlyTime: 0.45, dlyDepth: 0.4,
      revOn: 0, revType: 0, revTime: 0.5, revDepth: 0.35,
    };
    this.s = { ...this.p };
    this.INSTANT = new Set([
      'oscMod', 'osc2Mod', 'modShape', 'osc1Octave', 'sync', 'osc1Wave', 'osc2Octave',
      'osc2Wave', 'subOctave', 'filterMod', 'kbdTracking',
      'modFxOn', 'modFxType', 'dlyOn', 'dlySync', 'dlyType', 'revOn', 'revType',
    ]);

    this.pitchWheel = 0;
    this.modWheel = 0;

    this.osc1 = new Osc();
    this.osc2 = new Osc();
    this.sub = new Osc();
    this.sub.wave = 2; this.sub.duty = 0.5;
    this.envF = new Env();
    this.envL = new Env();

    this.heldNotes = [];
    this.gate = false;
    this.targetNote = 60;
    this.glideNote = 60;
    this.glideRate = 1e9;

    this.lfoPhase = 0;
    this.lfoVal = 0;
    this.shVal = 0;

    this.l1 = 0; this.l2 = 0; this.l3 = 0; this.l4 = 0; this.l4prev = 0;

    this.d = {
      f1: 110, f2: 110, cutHz: 1000, k: 0, g1: 0.6, g2: 0.6, gSub: 0,
      vol: 0.5, lfoInc: 0, growl: 0, gBase: 0.1,
      modFxRate: 1, dlyTimeS: 0.3,
    };

    this.hb = new Float32Array(8);
    this.hbIdx = 0;
    this.dcX = 0; this.dcY = 0;
    this.controlCounter = 0;
    this.noiseSeed = 22222;

    this.modFx = new ModFX(sampleRate);
    this.delay = new StereoDelay(sampleRate);
    this.reverb = new PlateReverb(sampleRate);
    this.fxBufA = [0, 0];
    this.fxBufB = [0, 0];

    this.seq = {
      steps: Array.from({ length: SEQ_STEPS }, () => ({ on: false, note: 45, vel: 0.8, tie: false, locks: null })),
      playing: false, bpm: 120, pos: -1, counter: 0, spb: 0,
      gateCounter: 0, curNote: -1,
    };
    this.seqVelTarget = 1;
    this.seqVel = 1;

    this.port.onmessage = (e) => this.onMessage(e.data);
  }

  onMessage(m) {
    switch (m.t) {
      case 'p':
        this.p[m.id] = m.v;
        if (this.INSTANT.has(m.id)) this.s[m.id] = m.v;
        break;
      case 'on':
        this.seqVelTarget = 1; // live playing stays velocity-insensitive (heritage)
        this.noteOn(m.n);
        break;
      case 'off': this.noteOff(m.n); break;
      case 'pw': this.pitchWheel = m.v; break;
      case 'mw': this.modWheel = m.v; break;
      case 'panic':
        this.heldNotes.length = 0;
        this.gate = false;
        this.envF.gateOff(); this.envL.gateOff();
        break;
      case 'seqSteps':
        this.seq.steps = m.steps;
        break;
      case 'seqStepData':
        this.seq.steps[m.i] = m.step;
        break;
      case 'bpm':
        this.seq.bpm = Math.max(40, Math.min(240, m.v));
        break;
      case 'seqCmd':
        if (m.cmd === 'start') {
          this.seq.pos = -1; this.seq.counter = 0; this.seq.playing = true;
        } else if (m.cmd === 'continue') {
          this.seq.playing = true;
        } else if (m.cmd === 'stop') {
          this.seq.playing = false;
          if (this.seq.curNote >= 0) { this.noteOff(this.seq.curNote); this.seq.curNote = -1; }
        }
        this.port.postMessage({ t: 'seqState', playing: this.seq.playing });
        break;
      case 'dump':
        this.port.postMessage({
          t: 'dump',
          glideNote: this.glideNote, targetNote: this.targetNote,
          glideRate: this.glideRate,
          held: [...this.heldNotes], gate: this.gate,
          cutHz: this.d.cutHz, envL: this.envL.v, envF: this.envF.v,
          seq: { playing: this.seq.playing, pos: this.seq.pos, bpm: this.seq.bpm },
          growl: this.d.growl,
        });
        break;
      default:
        break;
    }
  }

  priorityNote() {
    if (this.heldNotes.length === 0) return null;
    if (LOW_NOTE_PRIORITY) return Math.min(...this.heldNotes);
    return this.heldNotes[this.heldNotes.length - 1];
  }

  noteOn(n) {
    if (!this.heldNotes.includes(n)) this.heldNotes.push(n);
    const wasGate = this.gate;
    this.gate = true;
    this.targetNote = this.priorityNote();
    if (!wasGate) {
      this.envF.gateOn();
      this.envL.gateOn();
    }
  }

  noteOff(n) {
    const i = this.heldNotes.indexOf(n);
    if (i >= 0) this.heldNotes.splice(i, 1);
    if (this.heldNotes.length === 0) {
      this.gate = false;
      this.envF.gateOff();
      this.envL.gateOff();
    } else {
      this.targetNote = this.priorityNote();
    }
  }

  applyLocks(locks) {
    for (const id in locks) {
      const v = locks[id];
      this.p[id] = v;
      if (this.INSTANT.has(id)) this.s[id] = v;
    }
    this.port.postMessage({ t: 'locks', locks });
  }

  updateControl() {
    const p = this.p, s = this.s;

    const a = 0.28;
    for (const id of [
      'tune', 'glide', 'modRate', 'modAmount', 'osc2Interval',
      'mixOsc1', 'mixOsc2', 'mixSub', 'masterVolume',
      'contourAmount', 'cutoff', 'emphasis',
      'fAttack', 'fDecay', 'fSustain', 'fRelease',
      'lAttack', 'lDecay', 'lSustain', 'lRelease',
      'modFxTime', 'modFxDepth', 'dlyTime', 'dlyDepth', 'revTime', 'revDepth',
    ]) s[id] += (p[id] - s[id]) * a;

    if (p.glide <= 0.005) {
      this.glideRate = 1e9;
    } else {
      const tOct = GLIDE_MIN_S_PER_OCT * Math.pow(GLIDE_MAX_S_PER_OCT / GLIDE_MIN_S_PER_OCT, s.glide);
      this.glideRate = 12 / tOct;
    }

    const lfoHz = LFO_MIN_HZ * Math.pow(LFO_MAX_HZ / LFO_MIN_HZ, s.modRate);
    this.d.lfoInc = lfoHz / (sampleRate / CONTROL_INTERVAL);

    const coef = (sec) => 1 - Math.exp(-1 / (Math.max(sec, 1e-4) * this.fsOS));
    const segS = (v) => ENV_MIN_S * Math.pow(ENV_MAX_S / ENV_MIN_S, v);
    this.envF.aCoef = coef(segS(s.fAttack) / 1.23);
    this.envL.aCoef = coef(segS(s.lAttack) / 1.23);
    this.envF.dCoef = coef(segS(s.fDecay));
    this.envL.dCoef = coef(segS(s.lDecay));
    this.envF.sustain = s.fSustain;
    this.envL.sustain = s.lSustain;
    this.envF.rCoef = coef(segS(s.fRelease));
    this.envL.rCoef = coef(segS(s.lRelease));

    // LFO: 0 sine, 1 tri, 2 square (unipolar, authentic quirk), 3 S&H
    this.lfoPhase += this.d.lfoInc;
    if (this.lfoPhase >= 1) {
      this.lfoPhase -= 1;
      this.noiseSeed = (this.noiseSeed * 196314165 + 907633515) >>> 0;
      this.shVal = (this.noiseSeed / 4294967296) * 2 - 1;
    }
    const shape = s.modShape | 0;
    if (shape === 0) this.lfoVal = Math.sin(TWO_PI * this.lfoPhase);
    else if (shape === 1) this.lfoVal = 1 - 4 * Math.abs(this.lfoPhase - 0.5);
    else if (shape === 2) this.lfoVal = this.lfoPhase < 0.5 ? 1 : 0;
    else this.lfoVal = this.shVal;

    const mw = Math.min(1, this.modWheel * 1.25);

    const dtCtl = CONTROL_INTERVAL / sampleRate;
    const dn = this.targetNote - this.glideNote;
    const maxStep = this.glideRate * dtCtl;
    if (Math.abs(dn) <= maxStep) this.glideNote = this.targetNote;
    else this.glideNote += Math.sign(dn) * maxStep;

    const tune = (s.tune - 0.5) * 2 * TUNE_RANGE_ST;
    const pwSt = this.pitchWheel * PITCH_WHEEL_ST;
    const oscModSt = s.oscMod ? mw * OSC_MOD_DEPTH_ST * this.lfoVal : 0;
    const interval = (s.osc2Interval - 0.5) * 2 * INTERVAL_ST;

    // OSC 2 MOD: LFO routed to oscillator 2 alone (beating, or LFO sync sweeps)
    const osc2ModSt = s.osc2Mod ? mw * OSC_MOD_DEPTH_ST * this.lfoVal : 0;

    const syncOn = s.sync >= 1;
    const n1 = this.glideNote + tune + oscModSt + (syncOn ? 0 : pwSt);
    const n2 = this.glideNote + tune + oscModSt + osc2ModSt + pwSt + interval;

    const OCT1 = [0.25, 0.5, 1];
    const OCT2 = [0.5, 1, 2];
    this.d.f1 = midiHz(n1) * OCT1[s.osc1Octave | 0];
    this.d.f2 = midiHz(n2) * OCT2[s.osc2Octave | 0];
    const subMult = (s.subOctave | 0) === 0 ? 0.5 : 0.25; // -1 / -2 octaves vs OSC1
    const fSub = this.d.f1 * subMult;

    this.osc1.dt = Math.min(0.45, this.d.f1 / this.fsOS);
    this.osc2.dt = Math.min(0.45, this.d.f2 / this.fsOS);
    this.sub.dt = Math.min(0.45, fSub / this.fsOS);
    this.osc1.wave = s.osc1Wave | 0;
    this.osc2.wave = s.osc2Wave | 0;
    this.osc1.duty = OSC1_PULSE_DUTY;
    this.osc2.duty = OSC2_SQUARE_DUTY;

    const track = (s.kbdTracking | 0) === 0 ? 0 : (s.kbdTracking | 0) === 1 ? 0.5 : 1;
    const trackOct = (track * (this.glideNote - KBD_TRACK_CENTER)) / 12;
    const fModOct = s.filterMod ? mw * FILTER_MOD_OCT * this.lfoVal : 0;
    const contourOct = CONTOUR_OCT * s.contourAmount * this.envF.v;
    const baseHz = CUT_MIN_HZ * Math.pow(CUT_MAX_HZ / CUT_MIN_HZ, s.cutoff);
    let hz = baseHz * Math.pow(2, trackOct + fModOct + contourOct);
    hz = Math.min(Math.max(hz, 5), this.fsOS * 0.22);
    this.d.cutHz = hz;
    this.d.gBase = 1 - Math.exp((-TWO_PI * hz) / this.fsOS);

    this.seqVel += (this.seqVelTarget - this.seqVel) * 0.28; // per-step velocity (sequencer accent)

    this.d.growl = s.modAmount * s.modAmount * GROWL_OCT;
    this.d.k = EMPHASIS_MAX_K * s.emphasis;
    this.d.g1 = s.mixOsc1 * s.mixOsc1;
    this.d.g2 = s.mixOsc2 * s.mixOsc2;
    this.d.gSub = s.mixSub * s.mixSub;
    this.d.vol = s.masterVolume * s.masterVolume;

    this.d.modFxRate = MODFX_RATE_MIN * Math.pow(MODFX_RATE_MAX / MODFX_RATE_MIN, s.modFxTime);
    if (s.dlySync >= 1) {
      // TIME knob picks a musical division of the sequencer tempo
      const div = DLY_SYNC_DIVS[Math.min(DLY_SYNC_DIVS.length - 1, Math.floor(s.dlyTime * DLY_SYNC_DIVS.length))];
      this.d.dlyTimeS = Math.min(DLY_MAX_S, Math.max(DLY_MIN_S, (div * 60) / this.seq.bpm));
    } else {
      this.d.dlyTimeS = DLY_MIN_S * Math.pow(DLY_MAX_S / DLY_MIN_S, s.dlyTime);
    }
  }

  seqTick() {
    const q = this.seq;
    if (!q.playing) return;
    if (q.counter <= 0) {
      q.pos = (q.pos + 1) % SEQ_STEPS;
      q.spb = Math.round((sampleRate * 15) / q.bpm);
      q.counter = q.spb;
      const st = q.steps[q.pos];
      const tieContinues = st && st.on && st.tie && q.curNote >= 0;
      if (tieContinues) {
        // tied step: previous note holds through, no retrigger — locks still apply
        if (st.locks) this.applyLocks(st.locks);
      } else {
        if (q.curNote >= 0) { this.noteOff(q.curNote); q.curNote = -1; }
        if (st && st.on) {
          if (st.locks) this.applyLocks(st.locks);
          this.seqVelTarget = 0.25 + 0.75 * (st.vel != null ? st.vel : 0.8);
          this.noteOn(st.note);
          q.curNote = st.note;
        }
      }
      if (q.curNote >= 0) {
        // hold the full step when the NEXT step ties into this note
        const nxt = q.steps[(q.pos + 1) % SEQ_STEPS];
        q.gateCounter = (nxt && nxt.on && nxt.tie) ? 0 : Math.round(q.spb * SEQ_GATE);
      } else {
        q.gateCounter = 0; // rest
      }
      this.port.postMessage({ t: 'step', i: q.pos });
    }
    q.counter--;
    if (q.gateCounter > 0) {
      q.gateCounter--;
      if (q.gateCounter === 0 && q.curNote >= 0) {
        this.noteOff(q.curNote);
        q.curNote = -1;
      }
    }
  }

  process(inputs, outputs) {
    const outL = outputs[0][0];
    const outR = outputs[0].length > 1 ? outputs[0][1] : null;
    if (!outL) return true;

    const HB0 = -0.0322, HB2 = 0.2833;
    const d = this.d;

    for (let i = 0; i < outL.length; i++) {
      if (this.controlCounter <= 0) {
        this.updateControl();
        this.controlCounter = CONTROL_INTERVAL;
      }
      this.controlCounter--;

      this.seqTick();

      const k = d.k;
      const growlOn = d.growl > 0.002;

      for (let os = 0; os < 2; os++) {
        const s1 = this.osc1.step(null);
        const syncFrac = (this.p.sync >= 1 && this.osc1.wrapped) ? this.osc1.wrapFrac : null;
        const s2 = this.osc2.step(syncFrac);
        const sSub = this.sub.step(null);

        this.envF.step();
        const lEnv = this.envL.step();

        this.noiseSeed = (this.noiseSeed * 196314165 + 907633515) >>> 0;
        const noise = ((this.noiseSeed / 4294967296) - 0.5) * 2e-5;

        const x = (s1 * d.g1 + s2 * d.g2 + sSub * d.gSub) * 0.42 * LADDER_DRIVE + noise;

        // growl: audio-rate sub -> cutoff FM
        let g = d.gBase;
        if (growlOn) {
          const fcInst = Math.min(d.cutHz * Math.exp(LN2 * d.growl * sSub), this.fsOS * 0.22);
          g = 1 - Math.exp((-TWO_PI * fcInst) / this.fsOS);
        }

        const fb = 0.5 * (this.l4 + this.l4prev);
        const inV = ftanh(x - k * fb);
        this.l1 += g * (inV - ftanh(this.l1));
        this.l2 += g * (ftanh(this.l1) - ftanh(this.l2));
        this.l3 += g * (ftanh(this.l2) - ftanh(this.l3));
        this.l4prev = this.l4;
        this.l4 += g * (ftanh(this.l3) - ftanh(this.l4));

        const vca = this.l4 * lEnv * this.seqVel * OUT_GAIN;

        this.hb[this.hbIdx & 7] = vca;
        this.hbIdx++;
      }

      const n = this.hbIdx - 1;
      const at = (j) => this.hb[(n - j) & 7];
      const y0 = HB0 * (at(0) + at(6)) + HB2 * (at(2) + at(4)) + 0.5 * at(3);

      const yd = y0 - this.dcX + 0.9989 * this.dcY;
      this.dcX = y0; this.dcY = yd;

      // ---- stereo FX chain (base rate) ----
      let l = yd, r = yd;
      if (this.s.modFxOn >= 1) {
        this.modFx.process(yd, this.s.modFxType | 0, d.modFxRate, this.s.modFxDepth, this.fxBufA);
        l = this.fxBufA[0]; r = this.fxBufA[1];
      }
      if (this.s.dlyOn >= 1) {
        this.delay.process(l, r, this.s.dlyType | 0, d.dlyTimeS, this.s.dlyDepth, this.fxBufB);
        l = this.fxBufB[0]; r = this.fxBufB[1];
      }
      if (this.s.revOn >= 1) {
        this.reverb.process(l, r, this.s.revType | 0, this.s.revTime, this.s.revDepth, this.fxBufA);
        l = this.fxBufA[0]; r = this.fxBufA[1];
      }

      outL[i] = ftanh(l * d.vol);
      if (outR) outR[i] = ftanh(r * d.vol);
    }

    return true;
  }
}

registerProcessor('aperture-processor', ApertureProcessor);
