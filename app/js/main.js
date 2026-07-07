// Boot: build the panel, wire widgets -> audio engine, hook up MIDI,
// computer keyboard, presets, the sequencer bridge, and the power control
// (AudioContext lifecycle). Stereo engine with per-channel analysers for QA.

import { buildUnit, VIEW_W, VIEW_H } from './panel.js';
import { PanelUI } from './widgets.js';
import { PARAM_BY_ID, defaultState } from './params.js';
import { initMidi } from './midi.js';
import { MidiLearn } from './midi-learn.js';
import { Qwerty } from './qwerty.js';
import { Sequencer, BANK_SIZE, SEQ_BANKS, ensureSeqBanksInit } from './sequencer.js';
import { StepMenu } from './step-menu.js';
import { promptName } from './modal.js';
import {
  loadPanelState, savePanelState,
  LIBS, LIB_SIZE, loadPatchLib, savePatchSlot, clearPatchSlot, ensurePatchLibsInit,
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
    send({ t: 'on', n: note, v: vel }); // velocity steers VEL→CUTOFF when enabled
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
  onMidiLearn() { learn.toggle(); },
  onLearnPick(id, shift) { learn.pick(id, shift); },
  onSeqLen(len) { seq.setLen(len); },
  onStepMenu(i16, x, y) { stepMenu.show(seq.abs(i16), x, y); },
});

const learn = new MidiLearn(ui);
window.__apertureLearn = learn; // QA hook

// ---- sequencer ------------------------------------------------------------------

const seq = new Sequencer({
  send,
  paintStep: (i16, st) => ui.paintStep(i16, st),
  paintTie: (i16, lit) => ui.paintTie(i16, lit),
  paintBar: (b, st) => { ui.paintBar(b, st); ui.paintStepNumbers(seq.viewPage); },
  paintTransport: (st) => ui.paintTransport(st),
  paintBpm: (bpm) => ui.paintBpm(bpm),
  paintSeqLen: (len) => ui.paintSeqLen(len),
});

// snapshot captures every engine param (seq-owned knobs like tempo excluded)
function panelSnapshot() {
  const snap = {};
  for (const [id, v] of Object.entries(state)) {
    if (!PARAM_BY_ID[id]?.seq) snap[id] = v;
  }
  return snap;
}

const stepMenu = new StepMenu({
  getStep: (i) => seq.steps[i],
  setNote: (i, midi) => seq.setStepNote(i, midi),
  setVel: (i, v127) => seq.setStepVel(i, v127),
  setTie: (i, on) => seq.setStepTie(i, on),
  snapshot: (i) => seq.snapshotStep(i, panelSnapshot()),
  clearStep: (i) => seq.clearStep(i),
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

function handleCC(cc, v127) {
  if (learn.onCC(cc)) return;          // consumed while MIDI learn is armed
  const param = learn.resolve(cc);     // custom assignments layered over defaults
  if (!param) return;
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

// ---- patch libraries (A/B/C/D, 128 named slots each) -----------------------------

ensurePatchLibsInit();

const patchLibSel = document.getElementById('patch-lib');
const patchSlotSel = document.getElementById('patch-slot');

for (const lib of LIBS) {
  const o = document.createElement('option');
  o.value = lib;
  o.textContent = lib;
  patchLibSel.appendChild(o);
}

function slotLabel(i, entry) {
  const n = String(i + 1).padStart(3, '0');
  return entry ? `${n} · ${entry.name}` : `${n} · empty`;
}

function refreshPatchSlots(keep) {
  const arr = loadPatchLib(patchLibSel.value);
  const cur = keep ?? patchSlotSel.value ?? '0';
  patchSlotSel.innerHTML = '';
  for (let i = 0; i < LIB_SIZE; i++) {
    const o = document.createElement('option');
    o.value = i;
    o.textContent = slotLabel(i, arr[i]);
    patchSlotSel.appendChild(o);
  }
  patchSlotSel.value = cur;
}

patchLibSel.addEventListener('change', () => refreshPatchSlots('0'));

function applyPatch(patch) {
  state = { ...defaultState(), ...patch };
  ui.applyState(state, true);
  persistSoon();
}

document.getElementById('patch-save').addEventListener('click', async () => {
  const lib = patchLibSel.value;
  const n = +patchSlotSel.value;
  const existing = loadPatchLib(lib)[n];
  const name = await promptName({
    title: `SAVE PATCH → LIBRARY ${lib} · ${String(n + 1).padStart(3, '0')}`,
    value: existing ? existing.name : '',
  });
  if (!name) return;
  savePatchSlot(lib, n, name, state);
  refreshPatchSlots(String(n));
});

document.getElementById('patch-load').addEventListener('click', () => {
  const slot = loadPatchLib(patchLibSel.value)[+patchSlotSel.value];
  if (slot) applyPatch(slot.state);
});

document.getElementById('patch-clear').addEventListener('click', () => {
  clearPatchSlot(patchLibSel.value, +patchSlotSel.value);
  refreshPatchSlots();
});

document.getElementById('patch-init').addEventListener('click', () => {
  applyPatch(defaultState());
});

refreshPatchSlots('0');

// ---- sequence banks (A/B/C/D, 128 named slots each) -------------------------------

ensureSeqBanksInit();

const seqBankSel = document.getElementById('seq-banksel');
const slotSel = document.getElementById('seq-slot');

for (const bank of SEQ_BANKS) {
  const o = document.createElement('option');
  o.value = bank;
  o.textContent = bank;
  seqBankSel.appendChild(o);
}

function refreshSeqSlots(keep) {
  const arr = seq.loadBank(seqBankSel.value);
  const cur = keep ?? slotSel.value ?? '0';
  slotSel.innerHTML = '';
  for (let i = 0; i < BANK_SIZE; i++) {
    const o = document.createElement('option');
    o.value = i;
    o.textContent = slotLabel(i, arr[i]);
    slotSel.appendChild(o);
  }
  slotSel.value = cur;
}

seqBankSel.addEventListener('change', () => refreshSeqSlots('0'));

document.getElementById('seq-save').addEventListener('click', async () => {
  const bank = seqBankSel.value;
  const n = +slotSel.value;
  const existing = seq.loadBank(bank)[n];
  const name = await promptName({
    title: `SAVE SEQUENCE → BANK ${bank} · ${String(n + 1).padStart(3, '0')}`,
    value: existing ? existing.name : '',
  });
  if (!name) return;
  seq.saveSlot(bank, n, name);
  refreshSeqSlots(String(n));
});

document.getElementById('seq-load').addEventListener('click', () => {
  seq.loadSlot(seqBankSel.value, +slotSel.value);
});

document.getElementById('seq-clear').addEventListener('click', () => {
  seq.clearSlot(seqBankSel.value, +slotSel.value);
  refreshSeqSlots();
});

// INIT clears the working sequence — two clicks within 2 s to confirm
const seqInitBtn = document.getElementById('seq-init');
let initArmTimer = null;
seqInitBtn.addEventListener('click', () => {
  if (seqInitBtn.classList.contains('confirm')) {
    clearTimeout(initArmTimer);
    seqInitBtn.classList.remove('confirm');
    seqInitBtn.textContent = 'Init';
    seq.initAll();
  } else {
    seqInitBtn.classList.add('confirm');
    seqInitBtn.textContent = 'Sure?';
    initArmTimer = setTimeout(() => {
      seqInitBtn.classList.remove('confirm');
      seqInitBtn.textContent = 'Init';
    }, 2000);
  }
});

refreshSeqSlots('0');

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
