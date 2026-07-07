// Boot: build the panel, wire widgets -> audio engine, hook up MIDI,
// computer keyboard, presets, the sequencer bridge, and the power control
// (AudioContext lifecycle). Stereo engine with per-channel analysers for QA.

import { buildUnit, VIEW_W, VIEW_H } from './panel.js';
import { PanelUI } from './widgets.js';
import { PARAM_BY_ID, defaultState } from './params.js';
import { initMidi } from './midi.js';
import { Qwerty } from './qwerty.js';
import { Sequencer } from './sequencer.js';
import {
  FACTORY, loadUserPresets, saveUserPresets, loadPanelState, savePanelState,
} from './presets.js';

const svg = document.getElementById('unit');
buildUnit(svg);

// ---- audio engine -----------------------------------------------------------

let ctx = null;
let node = null;
let analyser = null;   // post-mix (mono downmix)
let analyserL = null;
let analyserR = null;

async function ensureEngine() {
  if (ctx) return;
  ctx = new AudioContext({ latencyHint: 'interactive' });
  await ctx.audioWorklet.addModule('audio/aperture-processor.js');
  node = new AudioWorkletNode(ctx, 'aperture-processor', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
  });

  const splitter = ctx.createChannelSplitter(2);
  analyserL = ctx.createAnalyser();
  analyserR = ctx.createAnalyser();
  analyserL.fftSize = 8192;
  analyserR.fftSize = 8192;
  analyser = ctx.createAnalyser();
  analyser.fftSize = 8192;

  node.connect(splitter);
  splitter.connect(analyserL, 0);
  splitter.connect(analyserR, 1);
  node.connect(analyser);
  node.connect(ctx.destination);

  node.port.onmessage = (e) => onEngineMessage(e.data);

  for (const [id, v] of Object.entries(state)) send({ t: 'p', id, v });
  send({ t: 'pw', v: (ui.wheels.pitchWheel - 0.5) * 2 });
  send({ t: 'mw', v: ui.wheels.modWheel });
  seq.pushAll();

  window.__aperture = { ctx, node, analyser, analyserL, analyserR };
}

function send(msg) {
  if (node) node.port.postMessage(msg);
}

// engine -> UI messages (sequencer playhead, applied p-locks, QA dumps)
const dumpListeners = [];
function onEngineMessage(m) {
  switch (m.t) {
    case 'step':
      seq.onWorkletStep(m.i);
      break;
    case 'seqState':
      seq.onSeqState(m.playing);
      break;
    case 'locks':
      for (const [id, v] of Object.entries(m.locks)) {
        state[id] = v;
        ui.setParam(id, v, false); // engine already has it; just move the panel
      }
      break;
    case 'dump':
      for (const fn of dumpListeners.splice(0)) fn(m);
      window.__lastDump = m;
      break;
    default:
      break;
  }
}
window.__requestDump = () => new Promise((res) => { dumpListeners.push(res); send({ t: 'dump' }); });

// ---- panel state --------------------------------------------------------------

let state = { ...defaultState(), ...(loadPanelState() || {}) };
let persistTimer = null;

function persistSoon() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => savePanelState(state), 250);
}

const ui = new PanelUI(svg, {
  onParam(id, v) {
    const p = PARAM_BY_ID[id];
    if (p?.seq) {           // sequencer-owned knob (tempo)
      seq.setTempoNorm(v);
      return;
    }
    state[id] = v;
    send({ t: 'p', id, v });
    persistSoon();
    seq.knobMoved(id, v);   // records a p-lock when REC is armed
  },
  onNoteOn(note, vel = 0.8) {
    powerOnIfNeeded();
    send({ t: 'on', n: note });
    ui.setKeyLit(note, true);
    seq.noteInput(note, vel);   // records note + velocity when REC is armed
  },
  onNoteOff(note) {
    if (note === -1) send({ t: 'panic' });
    else send({ t: 'off', n: note });
    ui.setKeyLit(note, false);
  },
  onWheel(id, v) {
    if (id === 'pitchWheel') send({ t: 'pw', v: (v - 0.5) * 2 });
    else send({ t: 'mw', v });
  },
  onPower(on) { setPower(on); },
  onStepClick(i16, shift, alt) { seq.stepClicked(i16, shift, alt); },
  onTieClick(i16) { seq.tieClicked(i16); },
  onBarClick(bar) { seq.barClicked(bar); },
  onPlay() { powerOnIfNeeded(); seq.togglePlay(); },
  onRec() { seq.toggleRec(); },
});

// ---- sequencer ------------------------------------------------------------------

const seq = new Sequencer({
  send,
  paintStep: (i16, st) => ui.paintStep(i16, st),
  paintTie: (i16, lit) => ui.paintTie(i16, lit),
  paintBar: (b, st) => { ui.paintBar(b, st); ui.paintStepNumbers(seq.viewPage); },
  paintTransport: (st) => ui.paintTransport(st),
  paintBpm: (bpm) => ui.paintBpm(bpm),
});

async function setPower(on) {
  ui.setPower(on);
  if (on) {
    await ensureEngine();
    await ctx.resume();
  } else if (ctx) {
    if (seq.playing) seq.togglePlay();
    send({ t: 'panic' });
    await ctx.suspend();
  }
}

function powerOnIfNeeded() {
  if (!ui.powerOn) setPower(true);
}

// paint restored state
ui.applyState(state, false);
for (const w of ['pitchWheel', 'modWheel']) ui.setWheel(w, w === 'pitchWheel' ? 0.5 : 0, false);
ui.setKnob('seqTempo', (seq.bpm - 40) / 200, false);
seq.repaintAll();
ui.paintStepNumbers(0);

// ---- inputs -------------------------------------------------------------------

const octaveLabel = document.getElementById('octave-label');
const qwerty = new Qwerty({
  onNoteOn(n) { ui.h.onNoteOn(n); },
  onNoteOff(n) { ui.h.onNoteOff(n); },
  onOctaveChange(label) { octaveLabel.textContent = label; },
});
octaveLabel.textContent = qwerty.label();

function handleCC(param, v127) {
  if (param.type === 'knob' || param.type === 'slider') {
    let v = v127 / 127;
    if (param.detent && Math.abs(v - 0.5) < 0.02) v = 0.5;
    ui.setParam(param.id, v);
  } else {
    const idx = Math.min(param.positions - 1, Math.floor(v127 / (128 / param.positions)));
    ui.setParam(param.id, idx);
  }
}

initMidi({
  onNoteOn(n, vel) { ui.h.onNoteOn(n, vel); },
  onNoteOff(n) { ui.h.onNoteOff(n); },
  onPitchBend(v) { ui.setWheel('pitchWheel', v / 2 + 0.5); },
  onModWheel(v) { ui.setWheel('modWheel', v); },
  onCC: handleCC,
  onTransport(cmd) {
    powerOnIfNeeded();
    if (cmd === 'start') { seq.pushAll(); send({ t: 'seqCmd', cmd: 'start' }); }
    else if (cmd === 'continue') send({ t: 'seqCmd', cmd: 'continue' });
    else send({ t: 'seqCmd', cmd: 'stop' });
  },
  onStatus(connected, name) {
    document.getElementById('midi-led').classList.toggle('on', connected);
    const el = document.getElementById('midi-name');
    el.textContent = name;
    el.classList.toggle('on', connected);
  },
}).then((midi) => {
  window.__apertureMidiInject = midi.inject;
});

// ---- presets --------------------------------------------------------------------

const sel = document.getElementById('preset-select');

function refreshPresetList(selectName) {
  const user = loadUserPresets();
  sel.innerHTML = '';
  const gF = document.createElement('optgroup');
  gF.label = 'Factory';
  for (const p of FACTORY) {
    const o = document.createElement('option');
    o.value = `f:${p.name}`;
    o.textContent = p.name;
    gF.appendChild(o);
  }
  sel.appendChild(gF);
  if (user.length) {
    const gU = document.createElement('optgroup');
    gU.label = 'User';
    for (const p of user) {
      const o = document.createElement('option');
      o.value = `u:${p.name}`;
      o.textContent = p.name;
      gU.appendChild(o);
    }
    sel.appendChild(gU);
  }
  if (selectName) sel.value = selectName;
}

function applyPatch(patch) {
  state = { ...defaultState(), ...patch };
  ui.applyState(state, true);
  persistSoon();
}

sel.addEventListener('change', () => {
  const v = sel.value;
  if (v.startsWith('f:')) {
    const p = FACTORY.find((x) => x.name === v.slice(2));
    if (p) applyPatch(p.state);
  } else if (v.startsWith('u:')) {
    const p = loadUserPresets().find((x) => x.name === v.slice(2));
    if (p) applyPatch(p.state);
  }
});

document.getElementById('preset-init').addEventListener('click', () => {
  applyPatch(defaultState());
  refreshPresetList('f:Init');
});

document.getElementById('preset-saveas').addEventListener('click', () => {
  const name = prompt('Preset name:');
  if (!name) return;
  const user = loadUserPresets().filter((p) => p.name !== name);
  user.push({ name, state: { ...state } });
  saveUserPresets(user);
  refreshPresetList(`u:${name}`);
});

document.getElementById('preset-save').addEventListener('click', () => {
  const v = sel.value;
  if (!v.startsWith('u:')) {
    alert('Select a user preset to overwrite, or use Save As.');
    return;
  }
  const user = loadUserPresets();
  const p = user.find((x) => x.name === v.slice(2));
  if (p) {
    p.state = { ...state };
    saveUserPresets(user);
  }
});

document.getElementById('preset-delete').addEventListener('click', () => {
  const v = sel.value;
  if (!v.startsWith('u:')) return;
  saveUserPresets(loadUserPresets().filter((p) => p.name !== v.slice(2)));
  refreshPresetList('f:Init');
});

refreshPresetList('f:Init');

// ---- window scaling ---------------------------------------------------------------

function rescale() {
  const stripH = 50;
  const pad = 20;
  const scale = Math.min(
    (window.innerWidth - pad) / VIEW_W,
    (window.innerHeight - pad) / (VIEW_H + stripH),
  );
  document.getElementById('unit-wrap').style.setProperty('--unit-scale', String(scale));
}
window.addEventListener('resize', rescale);
rescale();
