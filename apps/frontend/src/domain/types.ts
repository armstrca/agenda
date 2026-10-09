/**
 * Domain types shared by the repositories, the page builders and the React routes.
 *
 * Two layers live here:
 *   1. Entities as the app sees them (JSON columns already parsed, booleans real booleans).
 *   2. The page-load result shapes. These deliberately keep the key names the React components
 *      already read (`page_id`, `tldraw_snapshots`, `weekData`, `user_id` on templates, …) so the
 *      renderers do not change during the port. Rename later if you like, but in one sweep.
 */

import type { ISODate } from './dates.ts';

// ---------------------------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------------------------

/** The well-known profile created by migration 0001. */
export const DEFAULT_PROFILE_ID = '00000000-0000-4000-8000-000000000001';

export interface Profile {
  id: string;
  name: string;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  version: number;
}

/**
 * planner_settings as written by the create-planner form and read by the page builders.
 * Everything is optional; unknown keys are preserved untouched.
 */
export interface PlannerSettings {
  /** ISO-3166 alpha-2 codes, any case ("us", "GB"). "uk" is accepted as an alias for "GB". */
  holiday_countries?: string[];
  /** Optional sub-national regions as "CC-RR" ("US-IL"). Only these states' holidays are added. */
  holiday_regions?: string[];
  metadata?: {
    default_styles?: {
      /** "Mon" … "Sun". Anything else means Monday. */
      'week-start-day'?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface Planner {
  id: string;
  profile_id: string;
  name: string;
  description: string | null;
  planner_settings: PlannerSettings;
  created_at: string;
  updated_at: string;
  version: number;
}

export const TEMPLATE_TYPES = [
  'daily', 'weekly', 'monthly', 'custom', 'weekly_left', 'weekly_right', 'extra',
] as const;
export type TemplateType = (typeof TEMPLATE_TYPES)[number];

/** The `content` JSON of a page template: `{ metadata, structure }`. Kept loose on purpose. */
export interface TemplateContent {
  metadata: {
    type?: string;
    svgBackground?: string;
    default_styles?: Record<string, unknown>;
    base_dimensions?: { width: number; height: number };
    [key: string]: unknown;
  };
  structure: unknown[];
  [key: string]: unknown;
}

export interface PageTemplate {
  id: string;
  planner_id: string;
  profile_id: string;
  name: string;
  template_type: TemplateType;
  is_default: boolean;
  content: TemplateContent;
  schema_version: number;
  created_at: string;
  updated_at: string;
  version: number;
}

export type PageType = 'weekly' | 'monthly' | 'daily';

export interface Page {
  id: string;
  planner_id: string;
  profile_id: string;
  page_template_id: string;
  page_type: PageType;
  /** "MM_YYYY" for monthly, "W_YYYY_l" / "W_YYYY_r" (week not zero-padded) for weekly, "YYYY-MM-DD" for daily. */
  period_identifier: string;
  /** First day of the period. */
  page_date: ISODate;
  created_at: string;
  updated_at: string;
  version: number;
}

/** A TipTap document (`editor.getJSON()`), or whatever JSON the editor produced. */
export type EntryContent = Record<string, unknown>;

export interface PlannerEntry {
  id: string;
  page_id: string;
  planner_id: string;
  profile_id: string;
  /** The editor slot on the page ("1" … "7" on weekly pages, "1" … "42" on monthly, "1" … "24" on daily). */
  tiptap_id: string;
  entry_date: ISODate;
  content: EntryContent;
  created_at: string;
  updated_at: string;
  version: number;
}

/** The `document` half of tldraw's `getSnapshot(store)`: `{ store, schema }`. */
export type TldrawDocument = Record<string, unknown>;

export interface TldrawSnapshot {
  id: string;
  page_id: string;
  planner_id: string;
  profile_id: string;
  document: TldrawDocument;
  schema: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  version: number;
}

// ---------------------------------------------------------------------------------------------
// Page-load results (shapes the routes and renderers consume today)
// ---------------------------------------------------------------------------------------------

/** The template as the loaders hand it to the renderers. `user_id` carries the profile id. */
export interface TemplateRecord {
  id: string;
  name: string;
  template_type: TemplateType;
  is_default: boolean;
  user_id: string;
  planner_id: string;
  content: TemplateContent;
}

export interface EntryRecord {
  id: string;
  content: EntryContent;
  entry_date: ISODate;
  updated_at: string;
}

/** Entries for the loaded period grouped by day: `{ "2025-10-06": [ … ] }`. */
export type GroupedEntries = Record<ISODate, EntryRecord[]>;

/** Snapshot as the TLDraw component reads it (`tldraw_snapshots[0].document_data`). */
export interface SnapshotRecord {
  id: string;
  document_data: TldrawDocument;
  schema: Record<string, unknown> | null;
  updated_at: string;
}

/** Per-day moon info. `emoji` is "" on days whose phase did not change from the previous day. */
export interface MoonPhaseInfo {
  emoji: string;
  alt: string;
  aria_label: string;
}

export type MoonPhaseMap = Record<ISODate, MoonPhaseInfo>;

/** `{ "2025-07-04": ["Independence Day"] }`, de-duplicated, only dates that have holidays. */
export type HolidayMap = Record<ISODate, string[]>;

/** One day as the weekly templates render it. */
export interface WeekDayData {
  entryDate: ISODate;
  day_number: number;
  /** "Monday" */
  day_name: string;
  holidays: string[];
  /** Emoji, or "" when the phase did not change that day. */
  moon_phase: string;
  /** "October 2025" */
  month_year: string;
}

/** A 6x7 mini month grid. Keys are "1" … "42"; 0 marks a blank cell. */
export interface CalendarMonthData {
  /** "October 2025" */
  month: string;
  buttonData: Record<string, number>;
}

export interface WeekData {
  weekNumber: number;
  year: number;
  side: 'l' | 'r';
  /** The seven dates of the week, ascending. */
  mainDates: ISODate[];
  endDate: ISODate;
  holidays: HolidayMap;
  moonPhases: MoonPhaseMap;
  /** First six days. */
  templateData: WeekDayData[];
  /** Seventh day. */
  lastDayData: WeekDayData;
  weekStart: ISODate;
  /** Full name of the month containing the END date. */
  currentMonthName: string;
  /** Seven single letters from the week-start day, e.g. ["M","T","W","T","F","S","S"]. */
  daysOrder: string[];
  /** The month containing the end date. */
  leftCalendar: CalendarMonthData;
  /** The month after the end date's month. */
  rightCalendar: CalendarMonthData;
  weeksInYear: number;
  nextWeekId: string;
  prevWeekId: string;
}

export interface WeeklyPage {
  template: TemplateRecord;
  plannerEntries: GroupedEntries;
  tldraw_snapshots: SnapshotRecord[];
  weekData: WeekData;
  page_id: string;
  planner_id: string;
}

/** One day as the daily template renders it: the weekly day fields plus where prev/next go. */
export interface DayData extends WeekDayData {
  nextDayId: string;
  prevDayId: string;
}

export interface DailyPage {
  template: TemplateRecord;
  plannerEntries: GroupedEntries;
  tldraw_snapshots: SnapshotRecord[];
  dayData: DayData;
  page_id: string;
  planner_id: string;
}

export interface MonthData {
  /** 1-based. */
  month: number;
  year: number;
  holidays: HolidayMap;
  moonPhases: MoonPhaseMap;
  /** Every date of the month, ascending. */
  days: ISODate[];
}

export interface MonthlyPage {
  template: TemplateRecord;
  plannerEntries: GroupedEntries;
  tldraw_snapshots: SnapshotRecord[];
  monthData: MonthData;
  page_id: string;
  planner_id: string;
}
