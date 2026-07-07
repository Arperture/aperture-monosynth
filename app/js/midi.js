// Web MIDI input: auto-connects every input, hot-plugs on statechange.
// Notes -> engine, pitch bend -> pitch wheel, CC1 -> mod wheel, every panel
// control answers to a CC (map in params.js / README chart), and MIDI
// realtime bytes drive the sequencer transport (0xFA start / 0xFB continue /
// 0xFC stop). Velocity ignored (heritage). Omni: all channels accepted.

import { CC_TO_PARAM } from './params.js';

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
      const param = CC_TO_PARAM[d1];
      if (param) onCC(param, d2);
    }
  };

  if (!navigator.requestMIDIAccess) {
    onStatus(false, 'Web MIDI unavailable');
    return { inject: route };
  }

  let access;
  try {
    access = await navigator.requestMIDIAccess({ sysex: false });
  } catch {
    onStatus(false, 'MIDI access denied');
    return { inject: route };
  }

  const wire = () => {
    const names = [];
    for (const input of access.inputs.values()) {
      names.push(input.name || 'MIDI input');
      input.onmidimessage = (e) => route(e.data);
    }
    if (names.length) onStatus(true, names.join(' · '));
    else onStatus(false, 'no MIDI device');
  };

  access.onstatechange = wire;
  wire();

  return { inject: route };
}
