import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "../utils/isTauri";

const API_BASE = isTauri ? '' : 'http://localhost:3005';

async function getRequest(endpoint) {
    if (isTauri) {
        const command = JSON.stringify({
            endpoint,
            payload: {}
        });

        const response = await invoke('ipc_command', { command });
        return JSON.parse(response);
    } else {
        const response = await fetch(`${API_BASE}${endpoint}`);
        const contentType = response.headers.get('content-type');

        if (contentType && contentType.includes('application/json')) {
            return response.json();
        } else {
            const text = await response.text();
            throw new Error(`Expected JSON, but received: ${text}`);
        }
    }
}

export const apiClient = {
    get: getRequest
};

export const loadPages = async (args) => {
    if (isTauri) {
        return invoke('ipc_command', { command: JSON.stringify(args) });
    } else {
        const response = await fetch(`${API_BASE}/api/pages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(args)
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return response.json();
    }
};
