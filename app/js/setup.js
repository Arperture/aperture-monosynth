// Setup screen — a modal overlay for choosing the MIDI input (from Core MIDI)
// and the audio output device. Reachable from the strip's SETUP button and,
// in Electron, from the top menu bar (Aperture ▸ Setup…). Selections persist
// via the io hooks (localStorage) and re-apply on the live engine.

export class Setup {
  /**
   * @param {object} io
   *   listMidiInputs() -> [{id,name}]
   *   getMidiInput()   -> id | 'omni'
   *   setMidiInput(id)
   *   listAudioOutputs() -> Promise<[{id,name}]>
   *   getAudioOutput() -> deviceId | ''
   *   setAudioOutput(id) -> Promise
   *   audioInfo() -> { sampleRate:number|null, sinkSupported:boolean }
   */
  constructor(io) {
    this.io = io;

    const el = document.createElement('div');
    el.id = 'setup-overlay';
    el.innerHTML = `
      <div id="setup-panel" role="dialog" aria-modal="true">
        <div class="setup-head">
          <span class="setup-title">SETUP</span>
          <button id="setup-close" title="Close">✕</button>
        </div>
        <div class="setup-row">
          <label for="setup-midi">MIDI INPUT</label>
          <select id="setup-midi"></select>
        </div>
        <div class="setup-row">
          <label for="setup-audio">AUDIO OUTPUT</label>
          <select id="setup-audio"></select>
        </div>
        <div class="setup-note" id="setup-note"></div>
      </div>
    `;
    document.body.appendChild(el);
    this.el = el;
    this.midiSel = el.querySelector('#setup-midi');
    this.audioSel = el.querySelector('#setup-audio');
    this.note = el.querySelector('#setup-note');

    el.querySelector('#setup-close').addEventListener('click', () => this.close());
    el.addEventListener('pointerdown', (e) => { if (e.target === el) this.close(); });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.isOpen()) this.close();
    });

    this.midiSel.addEventListener('change', () => this.io.setMidiInput(this.midiSel.value));
    this.audioSel.addEventListener('change', async () => {
      await this.io.setAudioOutput(this.audioSel.value);
    });
  }

  isOpen() { return this.el.classList.contains('show'); }

  async open() {
    // MIDI inputs
    const inputs = this.io.listMidiInputs();
    const midiSel = this.io.getMidiInput();
    this.midiSel.innerHTML = '';
    const omni = document.createElement('option');
    omni.value = 'omni';
    omni.textContent = inputs.length ? 'All devices (Omni)' : 'All devices (Omni) — none connected';
    this.midiSel.appendChild(omni);
    for (const i of inputs) {
      const o = document.createElement('option');
      o.value = i.id;
      o.textContent = i.name;
      this.midiSel.appendChild(o);
    }
    this.midiSel.value = midiSel;

    // Audio outputs
    const info = this.io.audioInfo();
    this.audioSel.innerHTML = '';
    const def = document.createElement('option');
    def.value = '';
    def.textContent = 'System Default';
    this.audioSel.appendChild(def);
    if (info.sinkSupported) {
      const outs = await this.io.listAudioOutputs();
      for (const o of outs) {
        if (!o.id || o.id === 'default') continue;
        const opt = document.createElement('option');
        opt.value = o.id;
        opt.textContent = o.name;
        this.audioSel.appendChild(opt);
      }
      this.audioSel.disabled = false;
      this.audioSel.value = this.io.getAudioOutput() || '';
    } else {
      this.audioSel.disabled = true;
    }

    const sr = info.sampleRate ? `${(info.sampleRate / 1000).toFixed(1)} kHz` : 'engine off';
    this.note.textContent = info.sinkSupported
      ? `Engine: ${sr}. Output routing applies immediately.`
      : `Engine: ${sr}. Output device routing is unavailable in this build — uses the system default.`;

    this.el.classList.add('show');
  }

  close() {
    this.el.classList.remove('show');
  }
}
