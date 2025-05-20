// src/utils/ipc.ts
import { invoke } from '@tauri-apps/api/core';

export type IndexArgs = {
    planner_id: string;
    month_id?: string;
    week_id?: string;
    page_id?: string;
    pageType: string;
};

export interface CalendarMonthData {
    month: string; // e.g. "June 2025"
    buttonData: Record<number, number>; // buttonId -> day_number (0 or empty for blanks)
}

export interface WeeklyDayData {
    page_id: string;
    month_year: string;
    day_number: number;
    day_name: string;
    moon_phase: string;
    entryDate: string;
    week_day_abbr: string;
    holidays: string[];
}

export interface WeekData {
    weekNumber: number;
    year: number;
    mainDates: string[];
    templateData: WeeklyDayData[];
    holidays: Record<string, string[]>;
    moonPhases: Record<string, { emoji: string; alt: string; ariaLabel: string }>;
    side: string;
    weekStart: string;
    currentMonthName: string;
    daysOrder: string[];
    leftCalendar: CalendarMonthData;
    rightCalendar: CalendarMonthData;
    lastDayData: WeeklyDayData;
}

export interface IndexReply {
    template: Record<string, any>;
    plannerEntries: Record<string, { id: string; content: string; entryDate: string; updatedAt: string }[]>;
    weekData?: WeekData;
    error?: string;
    page_id: string;
    planner_id: string;
    tldraw_snapshots: Record<string, any>;
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
