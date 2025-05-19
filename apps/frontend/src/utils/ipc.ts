// src/utils/ipc.ts
import { invoke } from '@tauri-apps/api/core';

export type IndexArgs = {
    planner_id: string;
    month_id?: string;
    week_id?: string;
    page_id?: string;
    pageType: string;
};

export interface IndexReply {
    template: Record<string, any>;
    plannerEntries: Record<string, { id: string; content: string; entryDate: string; updatedAt: string }[]>;
    weekData?: {
        weekNumber: number;
        year: number;
        endDate: string;
        displayMonthYear: string;
        mainDates: string[];
        holidays: Record<string, string[]>;
        moonPhases: Record<string, { emoji: string; alt: string; ariaLabel: string }>;
        side: string;
    };
    error?: string;
    page_id: string;
    planner_id: string;
    tldraw_snapshots: Record<string, any>;
    // plus other fields: pageID, plannerID, tldrawSnapshots, monthData...
}

export async function loadPages(args: IndexArgs): Promise<IndexReply> {
    return ipcInvoke('pages_index', args);
}

export interface IPCMessage<T = any> {
    command: string;
    payload?: T;
}

const IPC_TIMEOUT_MS = 5000; // Increase this value (e.g., 5000ms = 5s) as needed

export const ipcInvoke = async (command: string, payload: any = {}) => {
  const timeoutPromise = new Promise<string>((_, reject) =>
    setTimeout(() => reject(new Error("Backend response timed out")), IPC_TIMEOUT_MS)
  );

  const invokePromise = invoke<string>('ipc_command', {
    command: JSON.stringify({ command, payload })
  });

  
  let response: string;
  try {
    response = await Promise.race([invokePromise, timeoutPromise]);
  } catch (err) {
    throw err;
  }

  if (!response || response.trim() === "") throw new Error("Empty response from backend");
  const parsed = JSON.parse(response);
  if (!parsed.success) throw new Error(parsed.error);
  const data = parsed.data || {};

  // Only shape the response for pages_index, otherwise return raw data
  if (command === 'pages_index') {
    return {
      template: data.template,
      plannerEntries: data.plannerEntries || {},
      tldraw_snapshots: data.tldraw_snapshots || {},
      weekData: data.weekData,
      page_id: data.page_id,
      planner_id: data.planner_id
    };
  } else {
    return data;
  }
};
