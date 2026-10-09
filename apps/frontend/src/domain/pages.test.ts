import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { SqlJsDatabase } from '../db/adapters/sqljs.ts';
import { createTestDb } from '../db/testing.ts';
import seed from './__fixtures__/seed.json';
import { formatWeekId, resolveWeek } from './calendar/weeks.ts';
import { daysInclusive, firstOfMonth, lastOfMonth, todayISO } from './dates.ts';
import { upsertEntry } from './entries.ts';
import { isId } from './ids.ts';
import { currentMonthId, currentWeekId, findOrCreatePage, getPage, loadMonthlyPage, loadWeeklyPage } from './pages.ts';
import { createPlanner, plannerWeekStartIndex, requirePlanner } from './planners.ts';
import { saveSnapshot } from './snapshots.ts';
import { deleteTemplate, saveTemplate } from './templates.ts';
import { seedFixturePlanner } from './testing.ts';
import type { PageType, TemplateType, WeekData } from './types.ts';

// ---------------------------------------------------------------------------------------------
// Golden fixtures captured from the Rust build, one folder per week-start variant. Read with fs
// rather than import so one loop can walk every file. `template.content` is stripped in the
// fixtures; the seed holds it. `page_id`s in the fixtures are not stable and are not compared.
// ---------------------------------------------------------------------------------------------

interface FixtureTemplate {
  id: string;
  name: string;
  template_type: string;
  is_default: boolean;
  user_id: string;
  planner_id: string;
  content: unknown;
}

interface FixtureData {
  page_id: string;
  planner_id: string;
  plannerEntries: Record<string, unknown>;
  tldraw_snapshots: unknown[];
  template: FixtureTemplate;
  weekData?: WeekData;
}

interface Fixture {
  variant: string;
  weekStart: string;
  request: { command: string; payload: { planner_id: string; week_id?: string; month_id?: string } };
  response: { success: boolean; data?: FixtureData; error?: string };
}

interface FixtureCase {
  name: string;
  variant: string;
  fixture: Fixture;
}

const FIXTURES_DIR = fileURLToPath(new URL('./__fixtures__/', import.meta.url));

function loadFixtures(prefix: 'weekly_' | 'monthly_'): FixtureCase[] {
  const cases: FixtureCase[] = [];
  for (const entry of readdirSync(FIXTURES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const folder = join(FIXTURES_DIR, entry.name);
    for (const file of readdirSync(folder).sort()) {
      if (!file.startsWith(prefix) || !file.endsWith('.json')) continue;
      const fixture = JSON.parse(readFileSync(join(folder, file), 'utf8')) as Fixture;
      cases.push({ name: `${entry.name}/${file}`, variant: entry.name, fixture });
    }
  }
  return cases;
}

const weeklyCases = loadFixtures('weekly_').filter((c) => c.fixture.response.success && c.fixture.response.data);
const monthlyCases = loadFixtures('monthly_').filter((c) => c.fixture.response.success && c.fixture.response.data);

function seedTemplate(templateType: TemplateType): (typeof seed.templates)[number] {
  const template = seed.templates.find((t) => t.template_type === templateType);
  if (!template) throw new Error(`seed has no ${templateType} template`);
  return template;
}

/** The template record the loaders must return for a seeded planner. */
function expectedTemplateRecord(templateType: TemplateType, plannerId: string, profileId: string) {
  const template = seedTemplate(templateType);
  return {
    id: template.id,
    name: template.name,
    template_type: templateType,
    is_default: true,
    planner_id: plannerId,
    user_id: profileId,
    content: template.content,
  };
}

/**
 * weekData minus everything that depends on the holiday library: the holidays map itself and the
 * per-day holidays arrays. Those are asserted structurally in the test instead.
 */
function withoutHolidays(weekData: WeekData): Record<string, unknown> {
  const copy: Record<string, unknown> = {
    ...weekData,
    templateData: weekData.templateData.map((day) => ({ ...day, holidays: [] })),
    lastDayData: { ...weekData.lastDayData, holidays: [] },
  };
  delete copy.holidays;
  return copy;
}

async function errorMessage(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('expected the promise to reject');
}

type PageCountRow = { n: number };
type StoredPageRow = { id: string; period_identifier: string; page_date: string; page_template_id: string; profile_id: string };

async function pageRowCount(db: SqlJsDatabase, plannerId: string): Promise<number> {
  const rows = await db.select<PageCountRow>('SELECT COUNT(*) AS n FROM pages WHERE planner_id = ?', [plannerId]);
  return rows[0].n;
}

async function storedPages(db: SqlJsDatabase, plannerId: string, pageType: PageType, periodIdentifier: string): Promise<StoredPageRow[]> {
  return db.select<StoredPageRow>(
    `SELECT id, period_identifier, page_date, page_template_id, profile_id FROM pages
     WHERE planner_id = ? AND page_type = ? AND period_identifier = ? AND deleted_at IS NULL`,
    [plannerId, pageType, periodIdentifier],
  );
}

const DOC = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }] };

describe('pages', () => {
  let db: SqlJsDatabase;

  beforeEach(async () => {
    db = await createTestDb();
  });

  afterEach(async () => {
    await db.close();
  });

  // -------------------------------------------------------------------------------------------
  // 1. Weekly parity against every successful fixture in every variant folder
  // -------------------------------------------------------------------------------------------

  describe('loadWeeklyPage parity', () => {
    expect(weeklyCases.length).toBeGreaterThan(0);

    for (const { name, variant, fixture } of weeklyCases) {
      it(`matches the Rust build for ${name}`, async () => {
        const { profileId, plannerId } = await seedFixturePlanner(db, { weekStart: fixture.weekStart });
        const payload = fixture.request.payload;
        const expected = fixture.response.data;
        if (!expected?.weekData || payload.week_id === undefined) throw new Error(`${name} is not a weekly fixture`);
        expect(payload.planner_id).toBe(plannerId);

        const result = await loadWeeklyPage(db, payload.planner_id, payload.week_id);

        // (a) Everything in weekData except the holiday names.
        expect(withoutHolidays(result.weekData)).toEqual(withoutHolidays(expected.weekData));

        // (b) Holidays: structurally sound, inside the week, and (Monday variant) a subset of the
        //     keys the Rust side produced with every US subdivision merged in.
        const { holidays, weekStart, endDate, templateData, lastDayData } = result.weekData;
        const missingFromFixture: string[] = [];
        for (const [date, names] of Object.entries(holidays)) {
          expect(date >= weekStart && date <= endDate, `${date} outside [${weekStart}, ${endDate}]`).toBe(true);
          expect(names.length).toBeGreaterThan(0);
          for (const holidayName of names) {
            expect(typeof holidayName).toBe('string');
            expect(holidayName.length).toBeGreaterThan(0);
          }
          if (variant === 'mon' && !(date in expected.weekData.holidays)) missingFromFixture.push(date);
        }
        expect.soft(
          missingFromFixture,
          `${name}: holiday dates emitted here but absent from the Rust fixture`,
        ).toEqual([]);
        for (const day of [...templateData, lastDayData]) {
          expect(day.holidays).toEqual(holidays[day.entryDate] ?? []);
        }

        // (c) The template for the requested side, content from the seed.
        const expectedType: TemplateType = result.weekData.side === 'l' ? 'weekly_left' : 'weekly_right';
        expect(result.template).toEqual(expectedTemplateRecord(expectedType, plannerId, profileId));
        expect(expected.template.id).toBe(result.template.id);
        expect(expected.template.template_type).toBe(expectedType);

        // (d), (e)
        expect(result.plannerEntries).toEqual({});
        expect(result.tldraw_snapshots).toEqual([]);
        expect(result.planner_id).toBe(plannerId);
        expect(isId(result.page_id)).toBe(true);

        // (f) Idempotent: the same page comes back, stored once under the normalised id.
        const again = await loadWeeklyPage(db, payload.planner_id, payload.week_id);
        expect(again.page_id).toBe(result.page_id);
        expect(again).toEqual(result);

        const { weekNumber, year, side } = result.weekData;
        const rows = await storedPages(db, plannerId, 'weekly', formatWeekId(weekNumber, year, side));
        expect(rows).toEqual([
          {
            id: result.page_id,
            period_identifier: formatWeekId(weekNumber, year, side),
            page_date: result.weekData.weekStart,
            page_template_id: result.template.id,
            profile_id: profileId,
          },
        ]);
        expect(await pageRowCount(db, plannerId)).toBe(1);
      });
    }
  });

  // -------------------------------------------------------------------------------------------
  // 2. Monthly
  // -------------------------------------------------------------------------------------------

  describe('loadMonthlyPage', () => {
    expect(monthlyCases.length).toBeGreaterThan(0);

    for (const { name, fixture } of monthlyCases) {
      it(`builds the month the Rust build returned for ${name}`, async () => {
        const { profileId, plannerId } = await seedFixturePlanner(db, { weekStart: fixture.weekStart });
        const payload = fixture.request.payload;
        const expected = fixture.response.data;
        if (!expected || payload.month_id === undefined) throw new Error(`${name} is not a monthly fixture`);

        const result = await loadMonthlyPage(db, payload.planner_id, payload.month_id);

        expect(result.template).toEqual(expectedTemplateRecord('monthly', plannerId, profileId));
        expect(expected.template.id).toBe(result.template.id);

        const month = Number(payload.month_id.slice(0, 2));
        const year = Number(payload.month_id.slice(3));
        const first = firstOfMonth(year, month);
        const last = lastOfMonth(year, month);
        const days = daysInclusive(first, last);

        expect(result.monthData.month).toBe(month);
        expect(result.monthData.year).toBe(year);
        expect(result.monthData.days).toEqual(days);
        expect(Object.keys(result.monthData.moonPhases)).toEqual(days);
        expect(result.monthData.moonPhases[first].emoji).not.toBe('');
        for (const date of Object.keys(result.monthData.holidays)) {
          expect(date >= first && date <= last, `${date} outside ${payload.month_id}`).toBe(true);
          expect(result.monthData.holidays[date].length).toBeGreaterThan(0);
        }

        expect(result.plannerEntries).toEqual({});
        expect(result.tldraw_snapshots).toEqual([]);
        expect(result.planner_id).toBe(plannerId);
        expect(isId(result.page_id)).toBe(true);

        const again = await loadMonthlyPage(db, payload.planner_id, payload.month_id);
        expect(again).toEqual(result);
        expect(await storedPages(db, plannerId, 'monthly', payload.month_id)).toEqual([
          {
            id: result.page_id,
            period_identifier: payload.month_id,
            page_date: first,
            page_template_id: result.template.id,
            profile_id: profileId,
          },
        ]);
        expect(await pageRowCount(db, plannerId)).toBe(1);
      });
    }

    it('accepts a one-digit month and stores the page under the two-digit id (divergence from Rust)', async () => {
      // The Rust build rejected "4_2025"; the fixture records that so the divergence stays visible.
      const rustFixture = JSON.parse(
        readFileSync(join(FIXTURES_DIR, 'mon', 'monthly_4_2025_onedigit.json'), 'utf8'),
      ) as Fixture;
      expect(rustFixture.response.success).toBe(false);
      expect(rustFixture.response.error).toContain('invalid month_id format');

      const { plannerId } = await seedFixturePlanner(db);
      const result = await loadMonthlyPage(db, plannerId, '4_2025');
      expect(result.monthData.month).toBe(4);
      expect(result.monthData.year).toBe(2025);
      expect(result.monthData.days[0]).toBe('2025-04-01');
      expect(result.monthData.days).toHaveLength(30);

      const rows = await storedPages(db, plannerId, 'monthly', '04_2025');
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(result.page_id);
      expect(rows[0].page_date).toBe('2025-04-01');

      const canonical = await loadMonthlyPage(db, plannerId, '04_2025');
      expect(canonical.page_id).toBe(result.page_id);
      expect(await pageRowCount(db, plannerId)).toBe(1);
    });

    it('uses the planner settings for holidays and emits moon phases for the whole month', async () => {
      const planner = await createPlanner(db, {
        name: 'gb',
        planner_settings: { holiday_countries: ['gb'] },
      });
      const result = await loadMonthlyPage(db, planner.id, '12_2025');
      expect(result.monthData.holidays['2025-12-25']).toContain('Christmas Day');
      expect(result.monthData.holidays['2025-12-26']).toContain('Boxing Day');
      expect(Object.keys(result.monthData.moonPhases)).toHaveLength(31);
    });
  });

  // -------------------------------------------------------------------------------------------
  // 3. Errors
  // -------------------------------------------------------------------------------------------

  describe('errors', () => {
    const UNKNOWN_PLANNER = '00000000-0000-4000-8000-00000000dead';

    it('rejects a malformed week id with the Rust message', async () => {
      const { plannerId } = await seedFixturePlanner(db);
      expect(await errorMessage(loadWeeklyPage(db, plannerId, 'x_2025_l'))).toBe('invalid week_id format');
      expect(await errorMessage(loadWeeklyPage(db, plannerId, '40_2025'))).toBe('invalid week_id format');
      expect(await errorMessage(loadWeeklyPage(db, plannerId, '40_2025_x'))).toBe('invalid week_id format');
      expect(await pageRowCount(db, plannerId)).toBe(0);
    });

    it('rejects a malformed month id with the Rust message', async () => {
      const { plannerId } = await seedFixturePlanner(db);
      expect(await errorMessage(loadMonthlyPage(db, plannerId, 'x_2025'))).toBe('invalid month_id format');
      expect(await errorMessage(loadMonthlyPage(db, plannerId, '13_2025'))).toBe('invalid month_id format');
      expect(await errorMessage(loadMonthlyPage(db, plannerId, '10_2025_l'))).toBe('invalid month_id format');
      expect(await pageRowCount(db, plannerId)).toBe(0);
    });

    it('rejects an unknown planner', async () => {
      await seedFixturePlanner(db);
      expect(await errorMessage(loadWeeklyPage(db, UNKNOWN_PLANNER, '40_2025_l'))).toBe('planner not found');
      expect(await errorMessage(loadMonthlyPage(db, UNKNOWN_PLANNER, '10_2025'))).toBe('planner not found');
    });

    it('rejects a malformed planner id before anything else', async () => {
      expect(await errorMessage(loadWeeklyPage(db, 'not-a-uuid', '40_2025_l'))).toBe(
        'invalid planner_id (expected UUID)',
      );
      expect(await errorMessage(loadMonthlyPage(db, 'not-a-uuid', '10_2025'))).toBe(
        'invalid planner_id (expected UUID)',
      );
      // The planner check comes first: a bad week id on a bad planner reports the planner.
      expect(await errorMessage(loadWeeklyPage(db, 'not-a-uuid', 'x_2025_l'))).toBe(
        'invalid planner_id (expected UUID)',
      );
    });

    it('reports the missing default template per page type and creates no page', async () => {
      const bare = await createPlanner(db, { name: 'bare', seedDefaultTemplates: false });
      expect(await errorMessage(loadWeeklyPage(db, bare.id, '40_2025_l'))).toBe('Default template not found');
      expect(await errorMessage(loadWeeklyPage(db, bare.id, '40_2025_r'))).toBe('Default template not found');
      expect(await errorMessage(loadMonthlyPage(db, bare.id, '10_2025'))).toBe('Default monthly template not found');
      expect(await pageRowCount(db, bare.id)).toBe(0);
    });

    it('needs only the default of the requested side', async () => {
      const planner = await createPlanner(db, { name: 'left only', seedDefaultTemplates: false });
      const left = seedTemplate('weekly_left');
      await saveTemplate(db, {
        planner_id: planner.id,
        name: left.name,
        template_type: 'weekly_left',
        is_default: true,
        content: left.content,
      });
      const page = await loadWeeklyPage(db, planner.id, '40_2025_l');
      expect(page.template.template_type).toBe('weekly_left');
      expect(await errorMessage(loadWeeklyPage(db, planner.id, '40_2025_r'))).toBe('Default template not found');
    });
  });

  // -------------------------------------------------------------------------------------------
  // 4. Round trip through the repositories
  // -------------------------------------------------------------------------------------------

  describe('round trip', () => {
    it('returns the week entries grouped by date and the snapshot as document_data', async () => {
      const { plannerId } = await seedFixturePlanner(db);
      const first = await loadWeeklyPage(db, plannerId, '41_2025_l');
      expect(first.weekData.weekStart).toBe('2025-10-06');
      expect(first.weekData.endDate).toBe('2025-10-12');

      const tuesday = await upsertEntry(db, {
        page_id: first.page_id,
        tiptap_id: '2',
        entry_date: '2025-10-07',
        content: DOC,
      });
      const alsoTuesday = await upsertEntry(db, {
        page_id: first.page_id,
        tiptap_id: '3',
        entry_date: '2025-10-07',
        content: { type: 'doc', content: [] },
      });
      await upsertEntry(db, {
        page_id: first.page_id,
        tiptap_id: '9',
        entry_date: '2025-10-20',
        content: { type: 'doc', content: [] },
      });
      const document = { store: { 'shape:a': { x: 1, y: 2 } }, schema: { schemaVersion: 2 } };
      const snapshot = await saveSnapshot(db, { page_id: first.page_id, document });

      const page = await loadWeeklyPage(db, plannerId, '41_2025_l');
      expect(page.page_id).toBe(first.page_id);
      expect(page.plannerEntries).toEqual({
        '2025-10-07': [
          { id: tuesday.id, content: DOC, entry_date: '2025-10-07', updated_at: tuesday.updated_at },
          {
            id: alsoTuesday.id,
            content: { type: 'doc', content: [] },
            entry_date: '2025-10-07',
            updated_at: alsoTuesday.updated_at,
          },
        ],
      });
      expect(page.tldraw_snapshots).toEqual([
        { id: snapshot.id, document_data: document, schema: null, updated_at: snapshot.updated_at },
      ]);

      // The right page of the same week is a different page with its own entries and drawing.
      const right = await loadWeeklyPage(db, plannerId, '41_2025_r');
      expect(right.page_id).not.toBe(first.page_id);
      expect(right.plannerEntries).toEqual({});
      expect(right.tldraw_snapshots).toEqual([]);
    });

    it('returns the month entries grouped by date and excludes dates outside the month', async () => {
      const { plannerId } = await seedFixturePlanner(db);
      const first = await loadMonthlyPage(db, plannerId, '10_2025');
      const inside = await upsertEntry(db, {
        page_id: first.page_id,
        tiptap_id: '31',
        entry_date: '2025-10-31',
        content: DOC,
      });
      await upsertEntry(db, {
        page_id: first.page_id,
        tiptap_id: '32',
        entry_date: '2025-11-01',
        content: DOC,
      });
      const document = { store: {}, schema: {} };
      const snapshot = await saveSnapshot(db, { page_id: first.page_id, document, schema: { v: 1 } });

      const page = await loadMonthlyPage(db, plannerId, '10_2025');
      expect(page.plannerEntries).toEqual({
        '2025-10-31': [{ id: inside.id, content: DOC, entry_date: '2025-10-31', updated_at: inside.updated_at }],
      });
      expect(page.tldraw_snapshots).toEqual([
        { id: snapshot.id, document_data: document, schema: { v: 1 }, updated_at: snapshot.updated_at },
      ]);
    });
  });

  // -------------------------------------------------------------------------------------------
  // getPage / findOrCreatePage
  // -------------------------------------------------------------------------------------------

  describe('getPage and findOrCreatePage', () => {
    const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

    it('returns null for an unknown page and the exact Page shape for a created one', async () => {
      const { profileId, plannerId, templateIds } = await seedFixturePlanner(db);
      expect(await getPage(db, '00000000-0000-4000-8000-00000000dead')).toBeNull();

      const loaded = await loadWeeklyPage(db, plannerId, '0_2025_l');
      const page = await getPage(db, loaded.page_id);
      expect(page).toStrictEqual({
        id: loaded.page_id,
        planner_id: plannerId,
        profile_id: profileId,
        page_template_id: templateIds.weekly_left,
        page_type: 'weekly',
        period_identifier: '52_2024_l',
        page_date: '2024-12-23',
        created_at: expect.stringMatching(TIMESTAMP),
        updated_at: expect.stringMatching(TIMESTAMP),
        version: 1,
      });
    });

    it('creates the page once when two callers race for the same period', async () => {
      const { plannerId } = await seedFixturePlanner(db);
      const planner = await requirePlanner(db, plannerId);
      const input = {
        planner,
        page_type: 'monthly' as const,
        period_identifier: '10_2025',
        page_date: '2025-10-01',
        template_type: 'monthly' as const,
        missingTemplateMessage: 'Default monthly template not found',
      };
      const [a, b] = await Promise.all([findOrCreatePage(db, input), findOrCreatePage(db, input)]);
      expect(a.page.id).toBe(b.page.id);
      expect(a.template.id).toBe(b.template.id);
      expect(await pageRowCount(db, plannerId)).toBe(1);
    });

    it('keeps rendering with the planner default when the pinned template is deleted', async () => {
      const { plannerId, templateIds } = await seedFixturePlanner(db);
      const first = await loadWeeklyPage(db, plannerId, '40_2025_l');
      expect(first.template.id).toBe(templateIds.weekly_left);

      const replacement = await saveTemplate(db, {
        planner_id: plannerId,
        name: 'New left',
        template_type: 'weekly_left',
        is_default: true,
        content: seedTemplate('weekly_left').content,
      });
      // The page stays pinned to its original template while that template is alive.
      const pinned = await loadWeeklyPage(db, plannerId, '40_2025_l');
      expect(pinned.page_id).toBe(first.page_id);
      expect(pinned.template.id).toBe(templateIds.weekly_left);

      await deleteTemplate(db, templateIds.weekly_left);
      const fallen = await loadWeeklyPage(db, plannerId, '40_2025_l');
      expect(fallen.page_id).toBe(first.page_id);
      expect(fallen.template.id).toBe(replacement.id);
      expect(fallen.template.name).toBe('New left');

      await deleteTemplate(db, replacement.id);
      expect(await errorMessage(loadWeeklyPage(db, plannerId, '40_2025_l'))).toBe('Default template not found');
    });

    it('revives a soft-deleted page for the period instead of failing', async () => {
      const { plannerId } = await seedFixturePlanner(db);
      const first = await loadWeeklyPage(db, plannerId, '40_2025_l');
      await db.execute('UPDATE pages SET deleted_at = ? WHERE id = ?', ['2026-01-01T00:00:00.000Z', first.page_id]);
      expect(await getPage(db, first.page_id)).toBeNull();

      const revived = await loadWeeklyPage(db, plannerId, '40_2025_l');
      expect(revived.page_id).toBe(first.page_id);
      const page = await getPage(db, first.page_id);
      expect(page?.version).toBe(2);
      expect(await pageRowCount(db, plannerId)).toBe(1);
    });

    it('rejects a malformed page_date', async () => {
      const { plannerId } = await seedFixturePlanner(db);
      const planner = await requirePlanner(db, plannerId);
      await expect(
        findOrCreatePage(db, {
          planner,
          page_type: 'monthly',
          period_identifier: '10_2025',
          page_date: '2025-10-1',
          template_type: 'monthly',
          missingTemplateMessage: 'Default monthly template not found',
        }),
      ).rejects.toThrow('invalid page_date');
    });
  });

  // -------------------------------------------------------------------------------------------
  // 5. "This week" / "this month"
  // -------------------------------------------------------------------------------------------

  describe('currentWeekId and currentMonthId', () => {
    it('names the ISO week for a Monday-start planner', async () => {
      const planner = await createPlanner(db, {
        name: 'mon',
        planner_settings: { metadata: { default_styles: { 'week-start-day': 'Mon' } } },
      });
      expect(currentWeekId(planner, '2025-10-09')).toBe('41_2025_l');
      expect(currentWeekId(planner, '2025-10-09', 'r')).toBe('41_2025_r');
      expect(currentWeekId(planner, '2024-12-30')).toBe('1_2025_l');
      expect(currentWeekId(planner, '2025-01-05')).toBe('1_2025_l');
    });

    it('names a page that contains the date for a Sunday-start planner', async () => {
      const planner = await createPlanner(db, {
        name: 'sun',
        planner_settings: { metadata: { default_styles: { 'week-start-day': 'Sun' } } },
      });
      const id = currentWeekId(planner, '2025-01-05');
      const week = resolveWeek(id, plannerWeekStartIndex(planner));
      expect(week.mainDates).toContain('2025-01-05');
      expect(week.weekStart).toBe('2025-01-05');

      const page = await loadWeeklyPage(db, planner.id, id);
      expect(page.weekData.mainDates).toContain('2025-01-05');
    });

    it('defaults to today and to the left side', async () => {
      const planner = await createPlanner(db, { name: 'today' });
      const id = currentWeekId(planner);
      expect(id.endsWith('_l')).toBe(true);
      expect(resolveWeek(id, plannerWeekStartIndex(planner)).mainDates).toContain(todayISO());
      expect(currentMonthId()).toBe(`${todayISO().slice(5, 7)}_${todayISO().slice(0, 4)}`);
    });

    it('formats the month id with a two-digit month', () => {
      expect(currentMonthId('2025-10-09')).toBe('10_2025');
      expect(currentMonthId('2025-04-01')).toBe('04_2025');
      expect(currentMonthId('2025-12-31')).toBe('12_2025');
    });
  });
});
