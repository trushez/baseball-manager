// Save files: export a saved game to a file and bring one back, so a career can be kept safe or moved.
import { h, toast } from './dom.js';
import { exportSave, importSave } from '../save.js';

/** Download a saved game as a .bmsave file. */
export async function downloadSave(name) {
  try {
    const { file, bytes } = await exportSave(name);
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
    const a = h('a', { href: url, download: file });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`Exported "${name}" as ${file}.`);
  } catch (e) { toast(`Could not export: ${e.message}`); }
}

/** An Import button: pick a .bmsave file and it joins the saved games. */
export function importButton(onDone) {
  const input = h('input', { type: 'file', accept: '.bmsave,.json', style: { display: 'none' }, onChange: async () => {
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    try { const name = await importSave(new Uint8Array(await f.arrayBuffer())); toast(`Imported "${name}".`); onDone?.(name); } catch (e) { toast(`Could not import: ${e.message}`); }
  } });
  return h('span', {}, input, h('button', { class: 'cm-btn', onClick: () => input.click() }, 'Import save file'));
}
