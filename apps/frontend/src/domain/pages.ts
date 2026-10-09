/**
 * Page builders: the find-or-build behind the weekly and monthly routes, ported from the Rust
 * `find_or_build_weekly` / `find_or_build_monthly` (apps/agenda_rust/src/models/pages.rs).
 *
 * Why it is shaped this way:
 *   - A page row is created lazily the first time a period is opened and stored under its
 *     NORMALISED id ("0_2025_l" lives as "52_2024_l", "4_2025" as "04_2025"), so every spelling of
 *     a period lands on one row. Creation is a single INSERT ... ON CONFLICT on the
 *     (planner_id, page_type, period_identifier) key followed by a re-select, because there is no
 *     transaction API: two callers racing to open the same period both end up on the same row.
 *     The ON CONFLICT clause also revives a soft-deleted row on that key (a plain INSERT OR IGNORE
 *     would leave the period unopenable forever once a row was deleted) and leaves a live row
 *     untouched.
 *   - The template is pinned to the page at creation (page_template_id), so changing the planner's
 *     default later does not re-skin pages that already exist. If the pinned template has since
 *     been deleted, the planner's current default of the same type is used for rendering without
 *     writing anything; with no default either, the Rust messages are kept because the routes show
 *     them verbatim ("Default template not found" / "Default monthly template not found").
 *   - The Rust monthly builder computed month_data and then never emitted it. This port returns it
 *     as `monthData`, the fix called for in TS_MIGRATION_PLAN.md, so the monthly route gets
 *     holidays and moon phases like the weekly one.
 *   - Calendar arithmetic lives in ./calendar and ./dates; this module only composes it, and every
 *     value it emits is one the golden fixtures under __fixtures__ pin down.
 */

import type { Database } from '../db/Database.ts';
import { calendarsForWeek, daysOrder } from './calendar/grids.ts';
import { holidaysBetween } from './calendar/holidays.ts';
import { formatMonthId, monthRange, parseMonthId } from './calendar/months.ts';
import { moonPhases } from './calendar/moon.ts';
import { resolveWeek, weekIdForDate, type WeekSide } from './calendar/weeks.ts';
import {
  assertISODate,
  dayName,
  dayOf,
  monthOf,
  monthYear,
  nowTimestamp,
  todayISO,
  yearOf,
  type ISODate,
} from './dates.ts';
import { entriesBetween } from './entries.ts';
import { newId } from './ids.ts';
import { plannerWeekStartIndex, requirePlanner } from './planners.ts';
import { listSnapshots } from './snapshots.ts';
import { findDefaultTemplate, getTemplate, toTemplateRecord } from './templates.ts';
import type {
  HolidayMap,
  MonthData,
  MonthlyPage,
  MoonPhaseMap,
  Page,
  PageTemplate,
  PageType,
  Planner,
  TemplateType,
  WeekData,
  WeekDayData,
  WeeklyPage,
} from './types.ts';

type PageRow = {
  id: string;
  planner_id: string;
  profile_id: string;
  page_template_id: string;
  page_type: string;
  period_identifier: string;
  page_date: string;
  created_at: string;
  updated_at: string;
  version: number;
};

const COLUMNS =
  'id, planner_id, profile_id, page_template_id, page_type, period_identifier, page_date, created_at, updated_at, version';

function toPage(row: PageRow): Page {
  return {
    id: row.id,
    planner_id: row.planner_id,
    profile_id: row.profile_id,
    page_template_id: row.page_template_id,
    page_type: row.page_type as PageType,
    period_identifier: row.period_identifier,
    page_date: row.page_date,
    created_at: row.created_at,
    updated_at: row.updated_at,
    version: row.version,
  };
}

export async function getPage(db: Database, id: string): Promise<Page | null> {
  const rows = await db.select<PageRow>(`SELECT ${COLUMNS} FROM pages WHERE id = ? AND deleted_at IS NULL`, [id]);
  return rows.length > 0 ? toPage(rows[0]) : null;
}

/** The live page for a period, by the key pages are unique on. */
async function findPage(
  db: Database,
  plannerId: string,
  pageType: PageType,
  periodIdentifier: string,
): Promise<Page | null> {
  const rows = await db.select<PageRow>(
    `SELECT ${COLUMNS} FROM pages
     WHERE planner_id = ? AND page_type = ? AND period_identifier = ? AND deleted_at IS NULL`,
    [plannerId, pageType, periodIdentifier],
  );
  return rows.length > 0 ? toPage(rows[0]) : null;
}

export interface FindOrCreatePageInput {
  planner: Planner;
  page_type: PageType;
  /** Already normalised ("52_2024_l", "04_2025"). */
  period_identifier: string;
  /** First day of the period. */
  page_date: ISODate;
  /** The default template type a new page is pinned to. */
  template_type: TemplateType;
  /** Thrown when the planner has no live default of `template_type` and one is needed. */
  missingTemplateMessage: string;
}

/**
 * The page for a period, created on first use, together with the template to render it with.
 * See the module header for the creation and template-fallback rules.
 */
export async function findOrCreatePage(
  db: Database,
  input: FindOrCreatePageInput,
): Promise<{ page: Page; template: PageTemplate }> {
  const { planner, page_type, period_identifier, template_type, missingTemplateMessage } = input;
  const pageDate = assertISODate(input.page_date, 'page_date');

  let page = await findPage(db, planner.id, page_type, period_identifier);
  let created: PageTemplate | null = null;
  if (page === null) {
    created = await findDefaultTemplate(db, planner.id, template_type);
    if (created === null) throw new Error(missingTemplateMessage);
    const now = nowTimestamp();
    await db.execute(
      `INSERT INTO pages
         (id, planner_id, profile_id, page_template_id, page_type, period_identifier, page_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(planner_id, page_type, period_identifier) DO UPDATE SET
         deleted_at = NULL,
         updated_at = excluded.updated_at,
         version = pages.version + 1
       WHERE pages.deleted_at IS NOT NULL`,
      [newId(), planner.id, planner.profile_id, created.id, page_type, period_identifier, pageDate, now, now],
    );
    // Re-select rather than trust the insert: a concurrent caller may have won the race, or a
    // soft-deleted row may have been revived, and either way that row is the page.
    page = await findPage(db, planner.id, page_type, period_identifier);
    if (page === null) throw new Error('page not found');
  }

  const template =
    created !== null && created.id === page.page_template_id
      ? created
      : await templateForPage(db, page, template_type, missingTemplateMessage);
  return { page, template };
}

/** The page's pinned template, or the planner's current default of that type if it is gone. */
async function templateForPage(
  db: Database,
  page: Page,
  templateType: TemplateType,
  missingTemplateMessage: string,
): Promise<PageTemplate> {
  const pinned = await getTemplate(db, page.page_template_id);
  if (pinned !== null) return pinned;
  const fallback = await findDefaultTemplate(db, page.planner_id, templateType);
  if (fallback === null) throw new Error(missingTemplateMessage);
  return fallback;
}

function weekDayData(date: ISODate, holidays: HolidayMap, phases: MoonPhaseMap): WeekDayData {
  return {
    entryDate: date,
    day_number: dayOf(date),
    day_name: dayName(date),
    holidays: holidays[date] ?? [],
    moon_phase: phases[date]?.emoji ?? '',
    month_year: monthYear(date),
  };
}

/**
 * Everything the weekly route renders for `weekId` ("W_YYYY_l" / "W_YYYY_r"), creating the page
 * on first visit. Errors, in order: 'invalid planner_id (expected UUID)', 'planner not found',
 * 'invalid week_id format', 'Default template not found'.
 */
export async function loadWeeklyPage(db: Database, plannerId: string, weekId: string): Promise<WeeklyPage> {
  const planner = await requirePlanner(db, plannerId);
  const weekStartIndex = plannerWeekStartIndex(planner);
  const week = resolveWeek(weekId, weekStartIndex);

  const { page, template } = await findOrCreatePage(db, {
    planner,
    page_type: 'weekly',
    period_identifier: week.normalizedWeekId,
    page_date: week.weekStart,
    template_type: week.side === 'l' ? 'weekly_left' : 'weekly_right',
    missingTemplateMessage: 'Default template not found',
  });

  const [plannerEntries, tldraw_snapshots] = await Promise.all([
    entriesBetween(db, page.id, week.weekStart, week.endDate),
    listSnapshots(db, page.id),
  ]);

  const holidays = holidaysBetween(week.weekStart, week.endDate, planner.planner_settings);
  const phases = moonPhases(week.mainDates);
  const days = week.mainDates.map((date) => weekDayData(date, holidays, phases));
  const { leftCalendar, rightCalendar, currentMonthName } = calendarsForWeek(week.endDate, weekStartIndex);

  const weekData: WeekData = {
    weekNumber: week.weekNumber,
    year: week.year,
    side: week.side,
    mainDates: week.mainDates,
    endDate: week.endDate,
    holidays,
    moonPhases: phases,
    templateData: days.slice(0, 6),
    lastDayData: days[6],
    weekStart: week.weekStart,
    currentMonthName,
    daysOrder: daysOrder(weekStartIndex),
    leftCalendar,
    rightCalendar,
    weeksInYear: week.weeksInYear,
    nextWeekId: week.nextWeekId,
    prevWeekId: week.prevWeekId,
  };

  return {
    template: toTemplateRecord(template),
    plannerEntries,
    tldraw_snapshots,
    weekData,
    page_id: page.id,
    planner_id: planner.id,
  };
}

/**
 * Everything the monthly route renders for `monthId` ("MM_YYYY", one-digit month accepted),
 * creating the page on first visit. Errors, in order: 'invalid planner_id (expected UUID)',
 * 'planner not found', 'invalid month_id format', 'Default monthly template not found'.
 */
export async function loadMonthlyPage(db: Database, plannerId: string, monthId: string): Promise<MonthlyPage> {
  const planner = await requirePlanner(db, plannerId);
  const { month, year, normalizedMonthId } = parseMonthId(monthId);
  const { start, end, dates } = monthRange(year, month);

  const { page, template } = await findOrCreatePage(db, {
    planner,
    page_type: 'monthly',
    period_identifier: normalizedMonthId,
    page_date: start,
    template_type: 'monthly',
    missingTemplateMessage: 'Default monthly template not found',
  });

  const [plannerEntries, tldraw_snapshots] = await Promise.all([
    entriesBetween(db, page.id, start, end),
    listSnapshots(db, page.id),
  ]);

  const monthData: MonthData = {
    month,
    year,
    holidays: holidaysBetween(start, end, planner.planner_settings),
    moonPhases: moonPhases(dates),
    days: dates,
  };

  return {
    template: toTemplateRecord(template),
    plannerEntries,
    tldraw_snapshots,
    monthData,
    page_id: page.id,
    planner_id: planner.id,
  };
}

/**
 * The weekly page id that shows `today` for this planner ("go to this week"). The planner's
 * week-start day moves the window, so the same date can be on different pages for different
 * planners; see weekIdForDate.
 */
export function currentWeekId(planner: Planner, today: ISODate = todayISO(), side: WeekSide = 'l'): string {
  return weekIdForDate(today, side, plannerWeekStartIndex(planner));
}

/** The monthly page id that shows `today` ("go to this month"). */
export function currentMonthId(today: ISODate = todayISO()): string {
  return formatMonthId(monthOf(today), yearOf(today));
}
