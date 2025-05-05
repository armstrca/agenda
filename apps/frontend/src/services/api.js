// apps/frontend/src/services/api.js
import { invoke } from '@tauri-apps/api/tauri';

/**
 * callBackend sends an IPC event+payload to the Artichoke sidecar
 * via Tauri’s invoke/command system and returns the parsed result.
 *
 * @param {string} event   - the IPC event name
 * @param {object} payload - the event payload
 * @returns {Promise<any>}
 */
export async function callBackend(event, payload) {
  const script = `
    require 'ipc_handler'
    puts IpcHandler.handle('${event}', ${JSON.stringify(payload)})
  `;
  try {
    const result = await invoke('run_ruby_script', { script });  // :contentReference[oaicite:0]{index=0}
    return JSON.parse(result);
  } catch (e) {
    console.error('IPC error', e);
    throw e;
  }
}
