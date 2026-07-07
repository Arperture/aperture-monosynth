// Web MIDI input. Notes -> engine, pitch bend -> pitch wheel, CC1 -> mod wheel
// (reserved), all other CCs handed over raw (resolved via the learn map),
// realtime bytes drive the sequencer transport (0xFA/0xFB/0xFC). Velocity
// feeds sequencer recording.
//
// Device selection: the Setup screen can pick a specific Core MIDI input or
// "Omni" (all inputs). The choice persists in localStorage and re-applies on
// hot-plug (statechange).

const LS_INPUT = 'aperture.midiInput';

export async function initMidi({
  onNoteOn, onNoteOff, onPitchBend, onModWheel, onCC, onTransport, onStatus,
}) {
  const route = (data) => {
    const st = data[0];
    // realtime (single byte)
    if (st >= 0xf8) {
      if (st === 0xfa) onTransport('start');
      else if (st === 0xfb) onTransport('continue');
      else if (st === 0xfc) onTransport('stop');
      return;
    }
    const d1 = data[1], d2 = data[2];
    const type = st & 0xf0;
    if (type === 0x90 && d2 > 0) onNoteOn(d1, d2 / 127); // velocity feeds sequencer recording
    else if (type === 0x80 || (type === 0x90 && d2 === 0)) onNoteOff(d1);
    else if (type === 0xe0) {
      onPitchBend(((d2 << 7) | d1) / 8192 - 1);
    } else if (type === 0xb0) {
      if (d1 === 1) { onModWheel(d2 / 127); return; }
      if (d1 === 120 || d1 === 123) { onNoteOff(-1); return; }
      onCC(d1, d2); // raw controller number; resolved via the learn map
    }
  };

  const stub = {
    inject: route,
    listInputs: () => [],
    getSelected: () => 'omni',
    setInput: () => {},
  };

  if (!navigator.requestMIDIAccess) {
    onStatus(false, 'Web MIDI unavailable');
    return stub;
  }

  let access;
  try {
    access = await navigator.requestMIDIAccess({ sysex: false });
  } catch {
    onStatus(false, 'MIDI access denied');
    return stub;
  }

  let selected = localStorage.getItem(LS_INPUT) || 'omni';

  const apply = () => {
    const active = [];
    for (const input of access.inputs.values()) {
      const on = selected === 'omni' || input.id === selected;
      input.onmidimessage = on ? (e) => route(e.data) : null;
      if (on) active.push(input.name || 'MIDI input');
    }
    if (selected === 'omni') {
      onStatus(active.length > 0,
        active.length ? `Omni · ${active.length} device${active.length > 1 ? 's' : ''}` : 'no MIDI device');
    } else {
      const inp = [...access.inputs.values()].find((i) => i.id === selected);
      onStatus(!!inp, inp ? (inp.name || 'MIDI input') : 'device unavailable');
    }
  };

  access.onstatechange = apply;
  apply();

  return {
    inject: route,
    listInputs: () => [...access.inputs.values()].map((i) => ({ id: i.id, name: i.name || 'MIDI input' })),
    getSelected: () => selected,
    setInput: (id) => {
      selected = id || 'omni';
      localStorage.setItem(LS_INPUT, selected);
      apply();
    },
  };
}
