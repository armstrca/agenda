import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SqlJsDatabase } from '../db/adapters/sqljs.ts';
import { createTestDb } from '../db/testing.ts';
import { isId, newId } from './ids.ts';
import {
  createPlanner,
  deletePlanner,
  getPlanner,
  listPlanners,
  plannerWeekStartIndex,
  requirePlanner,
  updatePlanner,
} from './planners.ts';
import { createProfile } from './profiles.ts';
import { BUNDLED_DEFAULT_TEMPLATES, findDefaultTemplate, listTemplates } from './templates.ts';
import { DEFAULT_PROFILE_ID, type Planner, type PlannerSettings } from './types.ts';

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function plannerWith(settings: PlannerSettings): Planner {
  return {
    id: newId(),
    profile_id: DEFAULT_PROFILE_ID,
    name: 'n',
    description: null,
    planner_settings: settings,
    created_at: '2026-10-08T12:00:00.000Z',
    updated_at: '2026-10-08T12:00:00.000Z',
    version: 1,
  };
}

describe('planners', () => {
  let db: SqlJsDatabase;

  beforeEach(async () => {
    db = await createTestDb();
  });

  afterEach(async () => {
    vi.useRealTimers();
    await db.close();
  });

  it('creates a planner with defaults and returns exactly the Planner shape', async () => {
    const planner = await createPlanner(db, { name: '  Example  ' });
    expect(planner).toStrictEqual({
      id: expect.any(String),
      profile_id: DEFAULT_PROFILE_ID,
      name: 'Example',
      description: null,
      planner_settings: {},
      created_at: expect.stringMatching(TIMESTAMP),
      updated_at: planner.created_at,
      version: 1,
    });
    expect(isId(planner.id)).toBe(true);
    expect(await getPlanner(db, planner.id)).toStrictEqual(planner);
    expect(await requirePlanner(db, planner.id)).toStrictEqual(planner);
    expect(await listPlanners(db)).toStrictEqual([planner]);
  });

  it('stores description, settings, an explicit profile and a supplied id', async () => {
    const profile = await createProfile(db, { name: 'Calvin' });
    const id = newId();
    const settings: PlannerSettings = {
      holiday_countries: ['us'],
      metadata: { default_styles: { 'week-start-day': 'Sun' } },
    };
    const planner = await createPlanner(db, {
      id,
      name: 'Mine',
      description: 'notes',
      planner_settings: settings,
      profile_id: profile.id,
      seedDefaultTemplates: false,
    });
    expect(planner.id).toBe(id);
    expect(planner.profile_id).toBe(profile.id);
    expect(planner.description).toBe('notes');
    expect(planner.planner_settings).toEqual(settings);
    // Parsed from the row, not the caller's object.
    expect(planner.planner_settings).not.toBe(settings);

    const raw = await db.select('SELECT planner_settings, deleted_at FROM planners WHERE id = ?', [id]);
    expect(raw).toEqual([{ planner_settings: JSON.stringify(settings), deleted_at: null }]);
  });

  it('validates its input and writes nothing on failure', async () => {
    await expect(createPlanner(db, { name: ' ' })).rejects.toThrow('name must be present');
    await expect(createPlanner(db, { name: undefined as unknown as string })).rejects.toThrow('name must be present');
    await expect(
      createPlanner(db, { name: 'x', planner_settings: [] as unknown as PlannerSettings }),
    ).rejects.toThrow('planner_settings must be a JSON object');
    await expect(
      createPlanner(db, { name: 'x', planner_settings: 'Mon' as unknown as PlannerSettings }),
    ).rejects.toThrow('planner_settings must be a JSON object');
    await expect(
      createPlanner(db, { name: 'x', planner_settings: null as unknown as PlannerSettings }),
    ).rejects.toThrow('planner_settings must be a JSON object');
    await expect(createPlanner(db, { name: 'x', profile_id: newId() })).rejects.toThrow('profile not found');
    await expect(createPlanner(db, { name: 'x', profile_id: 'nope' })).rejects.toThrow(
      'invalid profile_id (expected UUID)',
    );
    await expect(createPlanner(db, { name: 'x', id: 'nope' })).rejects.toThrow('invalid id (expected UUID)');
    await expect(createPlanner(db, { name: 'x', description: 5 as unknown as string })).rejects.toThrow(
      'description must be a string',
    );

    expect(await listPlanners(db)).toEqual([]);
    expect(await db.select('SELECT count(*) AS n FROM page_templates')).toEqual([{ n: 0 }]);
  });

  it('seeds exactly one default template per bundled type', async () => {
    const planner = await createPlanner(db, { name: 'Seeded' });
    const templates = await listTemplates(db, planner.id);
    expect(templates.map(t => t.template_type).sort()).toEqual(['daily', 'monthly', 'weekly_left', 'weekly_right']);

    for (const template of templates) {
      expect(template.is_default).toBe(true);
      expect(template.planner_id).toBe(planner.id);
      expect(template.profile_id).toBe(planner.profile_id);
      const bundled = BUNDLED_DEFAULT_TEMPLATES.find(b => b.template_type === template.template_type);
      expect(template.name).toBe(bundled?.name);
      expect(template.content).toEqual(bundled?.content);
      expect(await findDefaultTemplate(db, planner.id, template.template_type)).toStrictEqual(template);
    }
  });

  it('does not seed when asked not to', async () => {
    const planner = await createPlanner(db, { name: 'Bare', seedDefaultTemplates: false });
    expect(await listTemplates(db, planner.id)).toEqual([]);
    expect(await findDefaultTemplate(db, planner.id, 'weekly_left')).toBeNull();
    expect(await db.select('SELECT count(*) AS n FROM page_templates')).toEqual([{ n: 0 }]);
  });

  it('seeds each planner its own four templates', async () => {
    const a = await createPlanner(db, { name: 'A' });
    const b = await createPlanner(db, { name: 'B' });
    expect(await listTemplates(db, a.id)).toHaveLength(4);
    expect(await listTemplates(db, b.id)).toHaveLength(4);
    expect(await db.select('SELECT count(*) AS n FROM page_templates WHERE is_default = 1')).toEqual([{ n: 8 }]);

    const aLeft = await findDefaultTemplate(db, a.id, 'weekly_left');
    const bLeft = await findDefaultTemplate(db, b.id, 'weekly_left');
    expect(aLeft?.planner_id).toBe(a.id);
    expect(bLeft?.planner_id).toBe(b.id);
    expect(aLeft?.id).not.toBe(bLeft?.id);
  });

  it('updates fields in one statement, bumping updated_at and version each time', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-08T12:00:00.000Z'));
    const planner = await createPlanner(db, { name: 'Before', seedDefaultTemplates: false });
    expect(planner.created_at).toBe('2026-10-08T12:00:00.000Z');

    vi.setSystemTime(new Date('2026-10-08T12:00:05.000Z'));
    const renamed = await updatePlanner(db, planner.id, { name: '  After  ' });
    expect(renamed).toStrictEqual({
      ...planner,
      name: 'After',
      updated_at: '2026-10-08T12:00:05.000Z',
      version: 2,
    });

    vi.setSystemTime(new Date('2026-10-08T12:00:09.000Z'));
    const settings: PlannerSettings = { metadata: { default_styles: { 'week-start-day': 'Sat' } } };
    const updated = await updatePlanner(db, planner.id, { description: 'd', planner_settings: settings });
    expect(updated).toStrictEqual({
      ...renamed,
      description: 'd',
      planner_settings: settings,
      updated_at: '2026-10-08T12:00:09.000Z',
      version: 3,
    });
    expect(await getPlanner(db, planner.id)).toStrictEqual(updated);

    vi.setSystemTime(new Date('2026-10-08T12:00:12.000Z'));
    const cleared = await updatePlanner(db, planner.id, { description: null });
    expect(cleared.description).toBeNull();
    expect(cleared.updated_at).toBe('2026-10-08T12:00:12.000Z');
    expect(cleared.version).toBe(4);

    // An empty patch writes nothing.
    vi.setSystemTime(new Date('2026-10-08T12:00:20.000Z'));
    expect(await updatePlanner(db, planner.id, {})).toStrictEqual(cleared);
    expect(await getPlanner(db, planner.id)).toStrictEqual(cleared);
  });

  it('rejects bad updates and leaves the row untouched', async () => {
    const planner = await createPlanner(db, { name: 'P', seedDefaultTemplates: false });
    await expect(updatePlanner(db, planner.id, { name: '' })).rejects.toThrow('name must be present');
    await expect(
      updatePlanner(db, planner.id, { planner_settings: null as unknown as PlannerSettings }),
    ).rejects.toThrow('planner_settings must be a JSON object');
    await expect(
      updatePlanner(db, planner.id, { planner_settings: [] as unknown as PlannerSettings }),
    ).rejects.toThrow('planner_settings must be a JSON object');
    await expect(updatePlanner(db, planner.id, { description: 1 as unknown as string })).rejects.toThrow(
      'description must be a string',
    );
    await expect(updatePlanner(db, newId(), { name: 'x' })).rejects.toThrow('planner not found');
    await expect(updatePlanner(db, 'nope', { name: 'x' })).rejects.toThrow('invalid planner_id (expected UUID)');
    expect(await getPlanner(db, planner.id)).toStrictEqual(planner);
  });

  it('requirePlanner distinguishes malformed ids from missing planners', async () => {
    await expect(requirePlanner(db, 'nope')).rejects.toThrow('invalid planner_id (expected UUID)');
    await expect(requirePlanner(db, '')).rejects.toThrow('invalid planner_id (expected UUID)');
    await expect(requirePlanner(db, newId())).rejects.toThrow('planner not found');
    expect(await getPlanner(db, newId())).toBeNull();
    expect(await getPlanner(db, 'nope')).toBeNull();
  });

  it('soft-deletes a planner, hiding it from list, get, require and update', async () => {
    const keep = await createPlanner(db, { name: 'Keep', seedDefaultTemplates: false });
    const gone = await createPlanner(db, { name: 'Gone', seedDefaultTemplates: false });

    await deletePlanner(db, gone.id);
    expect((await listPlanners(db)).map(p => p.id)).toEqual([keep.id]);
    expect(await getPlanner(db, gone.id)).toBeNull();
    await expect(requirePlanner(db, gone.id)).rejects.toThrow('planner not found');
    await expect(updatePlanner(db, gone.id, { name: 'x' })).rejects.toThrow('planner not found');
    expect(await db.select('SELECT deleted_at, version FROM planners WHERE id = ?', [gone.id])).toEqual([
      { deleted_at: expect.stringMatching(TIMESTAMP), version: 2 },
    ]);

    // Deleting again, or deleting a planner that never existed, is a no-op.
    await deletePlanner(db, gone.id);
    await deletePlanner(db, newId());
    expect(await db.select('SELECT version FROM planners WHERE id = ?', [gone.id])).toEqual([{ version: 2 }]);
    await expect(deletePlanner(db, 'nope')).rejects.toThrow('invalid planner_id (expected UUID)');
    expect(await getPlanner(db, keep.id)).toStrictEqual(keep);
  });

  it('reads the week-start day from planner_settings, defaulting to Monday', () => {
    expect(plannerWeekStartIndex(plannerWith({}))).toBe(0);
    expect(plannerWeekStartIndex(plannerWith({ metadata: {} }))).toBe(0);
    expect(plannerWeekStartIndex(plannerWith({ metadata: { default_styles: {} } }))).toBe(0);
    expect(plannerWeekStartIndex(plannerWith({ metadata: { default_styles: { 'week-start-day': 'Mon' } } }))).toBe(0);
    expect(plannerWeekStartIndex(plannerWith({ metadata: { default_styles: { 'week-start-day': 'Thu' } } }))).toBe(3);
    expect(plannerWeekStartIndex(plannerWith({ metadata: { default_styles: { 'week-start-day': 'Sun' } } }))).toBe(6);
    expect(
      plannerWeekStartIndex(plannerWith({ metadata: { default_styles: { 'week-start-day': 'Someday' } } })),
    ).toBe(0);
  });
});
