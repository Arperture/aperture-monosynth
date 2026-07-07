// Reusable naming dialog — a small noir modal that resolves to the typed
// name (trimmed) or null if cancelled. Replaces the browser prompt() so the
// save flow matches the instrument's look and works inside Electron.

let overlay = null;
let input = null;
let titleEl = null;
let okBtn = null;
let resolver = null;

function build() {
  overlay = document.createElement('div');
  overlay.id = 'modal-overlay';
  overlay.innerHTML = `
    <div id="modal-dialog" role="dialog" aria-modal="true">
      <div id="modal-title"></div>
      <input id="modal-input" type="text" autocomplete="off" spellcheck="false" maxlength="24" />
      <div id="modal-buttons">
        <button id="modal-cancel" type="button">Cancel</button>
        <button id="modal-ok" type="button">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  titleEl = overlay.querySelector('#modal-title');
  input = overlay.querySelector('#modal-input');
  okBtn = overlay.querySelector('#modal-ok');

  const done = (val) => {
    overlay.classList.remove('show');
    const r = resolver;
    resolver = null;
    if (r) r(val);
  };

  okBtn.addEventListener('click', () => done(input.value.trim() || null));
  overlay.querySelector('#modal-cancel').addEventListener('click', () => done(null));
  overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) done(null); });
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();                       // don't trigger panel keyboard shortcuts
    if (e.code === 'Enter') done(input.value.trim() || null);
    else if (e.code === 'Escape') done(null);
  });
}

/**
 * @param {{title?:string, value?:string, okText?:string}} opts
 * @returns {Promise<string|null>}
 */
export function promptName({ title = 'Name', value = '', okText = 'Save' } = {}) {
  if (!overlay) build();
  if (resolver) resolver(null); // supersede any open dialog

  titleEl.textContent = title;
  okBtn.textContent = okText;
  input.value = value;
  overlay.classList.add('show');
  // focus + select after the show transition starts
  requestAnimationFrame(() => { input.focus(); input.select(); });

  return new Promise((res) => { resolver = res; });
}
