import { invoke } from "@tauri-apps/api/core";
import { ipcInvoke } from '../utils/ipc';

async function getRequest(endpoint) {
    const command = JSON.stringify({
        endpoint,
        payload: {}
    });

    const response = await invoke('ipc_command', { command });
    return JSON.parse(response);
}

export const apiClient = {
    getPlanners: () => ipcInvoke('get_planners'),
    getPlanner: (id) => ipcInvoke('get_planner', { id })
  };

export const loadPages = async (args) => {
    return invoke('ipc_command', { command: JSON.stringify(args) });
};
