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
const DEFAULT_NOTE = 45; // A2
const DEFAULT_VEL = 0.8;

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
    this.lastNote = DEFAULT_NOTE;
    this.saveTimer = null;

    this.load();
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
    } catch { /* fresh start */ }
  }

  saveSoon() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      localStorage.setItem(LS_KEY, JSON.stringify({ steps: this.steps, bpm: this.bpm }));
    }, 300);
  }

  // ---- worklet sync -------------------------------------------------------

  pushAll() {
    this.io.send({ t: 'seqSteps', steps: this.steps });
    this.io.send({ t: 'bpm', v: this.bpm });
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
    const i = (this.abs(i16) + 1) % 32;
    this.steps[i].tie = !this.steps[i].tie;
    this.pushStep(i);
    this.repaintPage();
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
      this.cursor = (this.cursor + 1) % 32;
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
      });
    }
  }

  repaintAll() {
    this.repaintPage();
    this.repaintBars();
    this.io.paintTransport({ playing: this.playing, rec: this.recArmed });
    this.io.paintBpm(this.bpm);
  }
}
