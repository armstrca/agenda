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
    const reply = await invoke<IndexReply>('pages_index', {
        method: 'Pages.Index',
        params: [args],
    });
    if (reply.error) throw new Error(reply.error);
    return reply;
}
