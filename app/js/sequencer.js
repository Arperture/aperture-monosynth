// 32-step sequencer — UI state machine and bridge to the worklet clock.
//
// Data model: 32 steps of { on, note, vel, tie, locks: {paramId: value} | null }.
// A step that is off is a REST. A step with `tie` continues the previous
// step's note without retriggering (the LED between the two steps lights).
// `vel` is the recorded velocity of the note that filled the step.
// The worklet owns playback timing (sample-accurate); this module owns
// editing, record modes, page view, LED painting, and persistence.
//
// Flows (Minilogue-XD-inspired):
//   · click a step        -> toggle note/rest (keeps its stored note)
//   · alt-click a step    -> toggle its TIE (continues the previous note)
//   · click a tie LED     -> toggle the tie of the step it leads into
//   · shift-click a step  -> clear the step entirely (note + tie + locks)
//   · REC armed, stopped  -> step record: played notes (with velocity) fill the
//                            cursor step and advance; clicking a step moves the
//                            cursor; knob moves p-lock the cursor step
//   · REC armed, playing  -> realtime record: notes + velocity land on the
//                            current step; knob moves record motion locks
//   · bar LEDs            -> click to view bar 1/2; view auto-follows while playing

const LS_KEY = 'aperture.sequence';
const LS_BANK = (bank) => `aperture.seqBank.${bank}`;
const LS_BANK_INIT = 'aperture.seqBank.init';
export const BANK_SIZE = 128;
export const SEQ_BANKS = ['A', 'B', 'C', 'D'];
const DEFAULT_NOTE = 45; // A2
const DEFAULT_VEL = 0.8;

// One-time migration: the old flat 'aperture.seqBank' array becomes bank A.
export function ensureSeqBanksInit() {
  if (localStorage.getItem(LS_BANK_INIT)) return;
  try {
    const old = JSON.parse(localStorage.getItem('aperture.seqBank'));
    if (Array.isArray(old) && old.length === BANK_SIZE) {
      const migrated = old.map((s, i) => (s ? { name: `Seq ${String(i + 1).padStart(3, '0')}`, ...s } : null));
      localStorage.setItem(LS_BANK('A'), JSON.stringify(migrated));
    }
  } catch { /* nothing to migrate */ }
  localStorage.setItem(LS_BANK_INIT, '1');
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const midiToName = (n) => `${NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 1}`;
export { NOTE_NAMES };

export class Sequencer {
  /**
   * @param {object} io
   *   send(msg)                    -> worklet port
   *   paintStep(i16, state)        -> widget LED painter, state: {play, active, cursor}
   *   paintBar(bar, state)         -> {view, play, playing}
   *   paintTransport({playing, rec})
   *   paintBpm(bpm)
   */
  constructor(io) {
    this.io = io;
    this.steps = Array.from({ length: 32 }, () => ({
      on: false, note: DEFAULT_NOTE, vel: DEFAULT_VEL, tie: false, locks: null,
    }));
    this.playing = false;
    this.recArmed = false;
    this.cursor = 0;        // step-record position
    this.playPos = -1;      // playhead from the worklet
    this.viewPage = 0;      // 0 = steps 1-16, 1 = steps 17-32
    this.bpm = 120;
    this.len = 32;          // 16 or 32 steps
    this.lastNote = DEFAULT_NOTE;
    this.saveTimer = null;

    this.load();
  }

  blankStep() {
    return { on: false, note: DEFAULT_NOTE, vel: DEFAULT_VEL, tie: false, locks: null };
  }

  // ---- persistence ------------------------------------------------------

  load() {
    try {
      const d = JSON.parse(localStorage.getItem(LS_KEY));
      if (d && Array.isArray(d.steps) && d.steps.length === 32) {
        this.steps = d.steps.map((s) => ({
          on: !!s.on,
          note: s.note ?? DEFAULT_NOTE,
          vel: s.vel ?? DEFAULT_VEL,
          tie: !!s.tie,
          locks: s.locks || null,
        }));
      }
      if (d && d.bpm) this.bpm = d.bpm;
      if (d && (d.len === 16 || d.len === 32)) this.len = d.len;
    } catch { /* fresh start */ }
  }

  saveSoon() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      localStorage.setItem(LS_KEY, JSON.stringify({ steps: this.steps, bpm: this.bpm, len: this.len }));
    }, 300);
  }

  // ---- worklet sync -------------------------------------------------------

  pushAll() {
    this.io.send({ t: 'seqSteps', steps: this.steps });
    this.io.send({ t: 'bpm', v: this.bpm });
    this.io.send({ t: 'seqLen', v: this.len });
  }

  pushStep(i) {
    this.io.send({ t: 'seqStepData', i, step: this.steps[i] });
    this.saveSoon();
  }

  // ---- transport ------------------------------------------------------------

  togglePlay() {
    if (this.playing) {
      this.io.send({ t: 'seqCmd', cmd: 'stop' });
    } else {
      this.pushAll();
      this.io.send({ t: 'seqCmd', cmd: 'start' });
    }
  }

  toggleRec() {
    this.recArmed = !this.recArmed;
    this.io.paintTransport({ playing: this.playing, rec: this.recArmed });
    this.repaintPage();
  }

  setTempoNorm(v) {
    this.bpm = Math.round(40 + 200 * v);
    this.io.send({ t: 'bpm', v: this.bpm });
    this.io.paintBpm(this.bpm);
    this.saveSoon();
  }

  onSeqState(playing) {
    this.playing = playing;
    if (!playing) this.playPos = -1;
    this.io.paintTransport({ playing, rec: this.recArmed });
    this.repaintPage();
    this.repaintBars();
  }

  onWorkletStep(i) {
    const prev = this.playPos;
    this.playPos = i;
    // auto-follow the playing bar
    const page = Math.floor(i / 16);
    if (page !== this.viewPage) {
      this.viewPage = page;
      this.repaintPage();
    } else {
      if (prev >= 0 && Math.floor(prev / 16) === this.viewPage) this.paintOne(prev % 16);
      this.paintOne(i % 16);
    }
    this.repaintBars();
  }

  // ---- editing -----------------------------------------------------------------

  abs(i16) { return this.viewPage * 16 + i16; }

  stepClicked(i16, shiftKey, altKey) {
    const i = this.abs(i16);
    const st = this.steps[i];
    if (shiftKey) {
      this.steps[i] = { on: false, note: DEFAULT_NOTE, vel: DEFAULT_VEL, tie: false, locks: null };
    } else if (altKey) {
      st.tie = !st.tie;
    } else if (this.recArmed && !this.playing) {
      this.cursor = i;
    } else {
      st.on = !st.on;              // note <-> rest
      if (st.on && st.note == null) st.note = this.lastNote;
    }
    this.pushStep(i);
    this.repaintPage();
  }

  // Toggle the tie of the step this gap leads into (LED between i16 and i16+1).
  tieClicked(i16) {
    const i = (this.abs(i16) + 1) % this.len;
    this.steps[i].tie = !this.steps[i].tie;
    this.pushStep(i);
    this.repaintPage();
  }

  // ---- step editing (context menu) ----------------------------------------

  setStepNote(i, midiNote) {
    const st = this.steps[i];
    st.note = midiNote;
    st.on = true;
    this.lastNote = midiNote;
    this.pushStep(i);
    this.repaintPage();
  }

  setStepVel(i, v127) {
    this.steps[i].vel = Math.max(0, Math.min(127, v127)) / 127;
    this.pushStep(i);
  }

  setStepTie(i, tie) {
    this.steps[i].tie = !!tie;
    this.pushStep(i);
    this.repaintPage();
  }

  // Panel snapshot: every engine parameter locked to this step; values latch
  // at playback until a later step changes them.
  snapshotStep(i, panelState) {
    this.steps[i].locks = { ...panelState };
    this.pushStep(i);
    this.repaintPage();
  }

  clearStep(i) {
    this.steps[i] = this.blankStep();
    this.pushStep(i);
    this.repaintPage();
  }

  // ---- length / init / bank -------------------------------------------------

  setLen(len) {
    this.len = len === 16 ? 16 : 32;
    if (this.len === 16) {
      this.cursor %= 16;
      if (this.viewPage === 1) this.viewPage = 0;
    }
    this.io.send({ t: 'seqLen', v: this.len });
    this.io.paintSeqLen(this.len);
    this.repaintPage();
    this.repaintBars();
    this.saveSoon();
  }

  initAll() {
    this.steps = Array.from({ length: 32 }, () => this.blankStep());
    this.cursor = 0;
    this.pushAll();
    this.repaintPage();
    this.repaintBars();
    this.saveSoon();
  }

  loadBank(bank) {
    try {
      const b = JSON.parse(localStorage.getItem(LS_BANK(bank)));
      if (Array.isArray(b) && b.length === BANK_SIZE) return b;
    } catch { /* fresh bank */ }
    return Array.from({ length: BANK_SIZE }, () => null);
  }

  saveSlot(bank, n, name) {
    const arr = this.loadBank(bank);
    arr[n] = { name, steps: this.steps, bpm: this.bpm, len: this.len };
    localStorage.setItem(LS_BANK(bank), JSON.stringify(arr));
  }

  clearSlot(bank, n) {
    const arr = this.loadBank(bank);
    arr[n] = null;
    localStorage.setItem(LS_BANK(bank), JSON.stringify(arr));
  }

  loadSlot(bank, n) {
    const d = this.loadBank(bank)[n];
    if (!d) return false;
    this.steps = d.steps.map((s) => ({ ...this.blankStep(), ...s }));
    this.bpm = d.bpm || 120;
    this.len = d.len === 16 ? 16 : 32;
    this.cursor = 0;
    if (this.viewPage === 1 && this.len === 16) this.viewPage = 0;
    this.pushAll();
    this.io.paintSeqLen(this.len);
    this.io.paintBpm(this.bpm);
    this.repaintAll();
    this.saveSoon();
    return true;
  }

  // A note was played (any source). Recording (note + velocity) is a side effect.
  noteInput(note, vel = DEFAULT_VEL) {
    this.lastNote = note;
    if (!this.recArmed) return;
    if (this.playing) {
      if (this.playPos >= 0) {
        const st = this.steps[this.playPos];
        st.on = true;
        st.note = note;
        st.vel = vel;
        this.pushStep(this.playPos);
        if (Math.floor(this.playPos / 16) === this.viewPage) this.paintOne(this.playPos % 16);
      }
    } else {
      const st = this.steps[this.cursor];
      st.on = true;
      st.note = note;
      st.vel = vel;
      this.pushStep(this.cursor);
      this.cursor = (this.cursor + 1) % this.len;
      const page = Math.floor(this.cursor / 16);
      if (page !== this.viewPage) this.viewPage = page;
      this.repaintPage();
      this.repaintBars();
    }
  }

  // A panel control moved (id, normalized value). Records a p-lock when armed.
  knobMoved(id, v) {
    if (!this.recArmed) return;
    const i = this.playing ? this.playPos : this.cursor;
    if (i < 0) return;
    const st = this.steps[i];
    if (!st.locks) st.locks = {};
    st.locks[id] = v;
    this.pushStep(i);
    if (Math.floor(i / 16) === this.viewPage) this.paintOne(i % 16);
  }

  barClicked(bar) {
    if (bar === this.viewPage) return;
    if (bar === 1 && this.len === 16) return; // bar 2 disabled in 16-step mode
    this.viewPage = bar;
    this.repaintPage();
    this.repaintBars();
  }

  // ---- painting -------------------------------------------------------------------

  paintOne(i16) {
    const i = this.abs(i16);
    const st = this.steps[i];
    this.io.paintStep(i16, {
      play: this.playing && this.playPos === i,
      active: st.on,
      locked: !!(st.locks && Object.keys(st.locks).length),
      cursor: this.recArmed && !this.playing && this.cursor === i,
    });
    // tie LED sits in the gap after this step; it shows the NEXT step's tie
    const nxt = this.steps[(i + 1) % 32];
    this.io.paintTie(i16, nxt.on && nxt.tie);
  }

  repaintPage() {
    for (let i = 0; i < 16; i++) this.paintOne(i);
  }

  repaintBars() {
    const playBar = this.playPos >= 0 ? Math.floor(this.playPos / 16) : -1;
    for (let b = 0; b < 2; b++) {
      this.io.paintBar(b, {
        view: this.viewPage === b,
        play: this.playing && playBar === b,
        playing: this.playing,
        disabled: b === 1 && this.len === 16,
      });
    }
  }

  repaintAll() {
    this.repaintPage();
    this.repaintBars();
    this.io.paintTransport({ playing: this.playing, rec: this.recArmed });
    this.io.paintBpm(this.bpm);
    this.io.paintSeqLen(this.len);
  }
}
