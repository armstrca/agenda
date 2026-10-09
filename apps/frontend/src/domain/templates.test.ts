import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { SqlJsDatabase } from '../db/adapters/sqljs.ts';
import { createTestDb } from '../db/testing.ts';
import { newId } from './ids.ts';
import { createPlanner } from './planners.ts';
import { createProfile } from './profiles.ts';
import {
  BUNDLED_DEFAULT_TEMPLATES,
  bundledDefaultTemplate,
  deleteTemplate,
  findDefaultTemplate,
  getTemplate,
  isTemplateType,
  listTemplates,
  saveTemplate,
  seedDefaultTemplates,
  toTemplateRecord,
  validateTemplateContent,
} from './templates.ts';
import { TEMPLATE_TYPES, type Planner, type TemplateContent } from './types.ts';

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const OBJECT_MESSAGE = 'invalid template structure: content must be a JSON object';
const SHAPE_MESSAGE = 'invalid template structure: content.metadata must be an object and content.structure an array';

const CONTENT: TemplateContent = {
  metadata: { type: 'weekly_left', base_dimensions: { width: 960, height: 1440 } },
  structure: [{ component: 'div', class: 'planner-container' }],
};

describe('templates', () => {
  let db: SqlJsDatabase;
  let planner: Planner;

  beforeEach(async () => {
    db = await createTestDb();
    planner = await createPlanner(db, { name: 'P', seedDefaultTemplates: false });
  });

  afterEach(async () => {
    await db.close();
  });

  const input = (overrides: Partial<Parameters<typeof saveTemplate>[1]> = {}) => ({
    planner_id: planner.id,
    name: 'T',
    template_type: 'weekly_left',
    is_default: false,
    content: CONTENT,
    ...overrides,
  });

  it('validates template content, with the Rust message for non-objects', () => {
    for (const bad of [null, undefined, 'x', 5, [], true]) {
      expect(() => validateTemplateContent(bad)).toThrow(OBJECT_MESSAGE);
    }
    for (const bad of [{}, { metadata: {} }, { structure: [] }, { metadata: [], structure: [] }, { metadata: {}, structure: {} }]) {
      expect(() => validateTemplateContent(bad)).toThrow(SHAPE_MESSAGE);
    }
    expect(() => validateTemplateContent(CONTENT)).not.toThrow();
    expect(() => validateTemplateContent({ metadata: {}, structure: [] })).not.toThrow();
  });

  it('knows the allowed template types', () => {
    for (const type of TEMPLATE_TYPES) expect(isTemplateType(type)).toBe(true);
    expect(isTemplateType('bogus')).toBe(false);
    expect(isTemplateType('Weekly_left')).toBe(false);
    expect(isTemplateType(undefined)).toBe(false);
  });

  it('ships three valid bundled defaults, one per page-building type', () => {
    expect(BUNDLED_DEFAULT_TEMPLATES.map(b => b.template_type)).toEqual(['weekly_left', 'weekly_right', 'monthly']);
    for (const bundled of BUNDLED_DEFAULT_TEMPLATES) {
      expect(bundled.name.length).toBeGreaterThan(0);
      expect(() => validateTemplateContent(bundled.content)).not.toThrow();
    }
    expect(bundledDefaultTemplate('monthly')?.name).toBe('Default Monthly');
    expect(bundledDefaultTemplate('daily')).toBeNull();
  });

  it('creates a template and returns exactly the PageTemplate shape', async () => {
    const template = await saveTemplate(db, input({ name: '  Left  ' }));
    expect(template).toStrictEqual({
      id: expect.any(String),
      planner_id: planner.id,
      profile_id: planner.profile_id,
      name: 'Left',
      template_type: 'weekly_left',
      is_default: false,
      content: CONTENT,
      schema_version: 1,
      created_at: expect.stringMatching(TIMESTAMP),
      updated_at: template.created_at,
      version: 1,
    });
    expect(template.content).not.toBe(CONTENT);
    expect(await getTemplate(db, template.id)).toStrictEqual(template);
    expect(await listTemplates(db, planner.id)).toStrictEqual([template]);

    const raw = await db.select('SELECT is_default, content, deleted_at FROM page_templates WHERE id = ?', [
      template.id,
    ]);
    expect(raw).toEqual([{ is_default: 0, content: JSON.stringify(CONTENT), deleted_at: null }]);
  });

  it('rejects bad input with exact messages and writes nothing', async () => {
    await expect(saveTemplate(db, input({ template_type: 'bogus' }))).rejects.toThrow('invalid template_type: bogus');
    await expect(saveTemplate(db, input({ template_type: undefined as unknown as string }))).rejects.toThrow(
      'invalid template_type: undefined',
    );
    await expect(saveTemplate(db, input({ content: 'nope' }))).rejects.toThrow(OBJECT_MESSAGE);
    await expect(saveTemplate(db, input({ content: [] }))).rejects.toThrow(OBJECT_MESSAGE);
    await expect(saveTemplate(db, input({ content: null }))).rejects.toThrow(OBJECT_MESSAGE);
    await expect(saveTemplate(db, input({ content: { metadata: {} } }))).rejects.toThrow(SHAPE_MESSAGE);
    await expect(saveTemplate(db, input({ name: '  ' }))).rejects.toThrow('name must be present');
    await expect(saveTemplate(db, input({ planner_id: newId() }))).rejects.toThrow('planner not found');
    await expect(saveTemplate(db, input({ planner_id: 'nope' }))).rejects.toThrow('invalid planner_id (expected UUID)');
    await expect(saveTemplate(db, input({ profile_id: newId() }))).rejects.toThrow('profile not found');
    await expect(saveTemplate(db, input({ profile_id: 'nope' }))).rejects.toThrow('invalid profile_id (expected UUID)');
    await expect(saveTemplate(db, input({ id: 'nope' }))).rejects.toThrow('invalid id (expected UUID)');
    await expect(saveTemplate(db, input({ schema_version: 0 }))).rejects.toThrow('schema_version must be a positive integer');
    await expect(saveTemplate(db, input({ schema_version: 1.5 }))).rejects.toThrow('schema_version must be a positive integer');
    expect(await listTemplates(db, planner.id)).toEqual([]);
  });

  it('accepts every allowed template type, including the editor-only extra type', async () => {
    for (const type of TEMPLATE_TYPES) {
      const saved = await saveTemplate(db, input({ name: type, template_type: type }));
      expect(saved.template_type).toBe(type);
    }
    expect((await listTemplates(db, planner.id)).map(t => t.template_type).sort()).toEqual([...TEMPLATE_TYPES].sort());
  });

  it('refuses a soft-deleted planner', async () => {
    await db.execute('UPDATE planners SET deleted_at = ? WHERE id = ?', ['2026-01-01T00:00:00.000Z', planner.id]);
    await expect(saveTemplate(db, input())).rejects.toThrow('planner not found');
  });

  it('upserts by id: a second save with the same id updates in place with version 2', async () => {
    const first = await saveTemplate(db, input({ name: 'v1' }));
    const next: TemplateContent = { metadata: { type: 'weekly_right' }, structure: [] };
    const second = await saveTemplate(db, {
      id: first.id,
      planner_id: planner.id,
      name: 'v2',
      template_type: 'weekly_right',
      is_default: false,
      content: next,
      schema_version: 2,
    });
    expect(second).toStrictEqual({
      ...first,
      name: 'v2',
      template_type: 'weekly_right',
      content: next,
      schema_version: 2,
      updated_at: expect.stringMatching(TIMESTAMP),
      version: 2,
    });
    expect(await listTemplates(db, planner.id)).toStrictEqual([second]);

    // A fresh id, even with identical fields, is a new row.
    const third = await saveTemplate(db, input({ id: newId(), name: 'v2', template_type: 'weekly_right', content: next }));
    expect(third.id).not.toBe(first.id);
    expect(third.version).toBe(1);
    expect(await listTemplates(db, planner.id)).toHaveLength(2);
  });

  it('uses the planner profile unless another live profile is named', async () => {
    const other = await createProfile(db, { name: 'Other' });
    const mine = await saveTemplate(db, input({ template_type: 'custom' }));
    const theirs = await saveTemplate(db, input({ template_type: 'custom', profile_id: other.id }));
    const unset = await saveTemplate(db, input({ template_type: 'custom', profile_id: null }));
    expect(mine.profile_id).toBe(planner.profile_id);
    expect(theirs.profile_id).toBe(other.id);
    expect(unset.profile_id).toBe(planner.profile_id);
  });

  it("refuses to rewrite another planner's template through its id", async () => {
    const other = await createPlanner(db, { name: 'Other', seedDefaultTemplates: false });
    const theirs = await saveTemplate(db, input({ planner_id: other.id, template_type: 'custom', name: 'theirs' }));
    await expect(
      saveTemplate(db, input({ id: theirs.id, template_type: 'custom', name: 'mine' })),
    ).rejects.toThrow('template belongs to another planner');
    expect(await getTemplate(db, theirs.id)).toStrictEqual(theirs);
    expect(await listTemplates(db, planner.id)).toEqual([]);
  });

  it('a new default demotes the previous default of that type only', async () => {
    const other = await createPlanner(db, { name: 'Other', seedDefaultTemplates: false });
    const othersLeft = await saveTemplate(db, input({ planner_id: other.id, name: 'other left', is_default: true }));
    const oldLeft = await saveTemplate(db, input({ name: 'old left', is_default: true }));
    const monthly = await saveTemplate(db, input({ name: 'monthly', template_type: 'monthly', is_default: true }));
    const plainLeft = await saveTemplate(db, input({ name: 'plain left' }));
    expect((await findDefaultTemplate(db, planner.id, 'weekly_left'))?.id).toBe(oldLeft.id);

    const newLeft = await saveTemplate(db, input({ name: 'new left', is_default: true }));
    expect(newLeft.is_default).toBe(true);
    expect((await findDefaultTemplate(db, planner.id, 'weekly_left'))?.id).toBe(newLeft.id);

    // The old default was demoted in a tracked update; nothing else moved.
    expect(await getTemplate(db, oldLeft.id)).toStrictEqual({
      ...oldLeft,
      is_default: false,
      updated_at: newLeft.updated_at,
      version: 2,
    });
    expect(await findDefaultTemplate(db, planner.id, 'monthly')).toStrictEqual(monthly);
    expect(await getTemplate(db, plainLeft.id)).toStrictEqual(plainLeft);
    expect(await findDefaultTemplate(db, other.id, 'weekly_left')).toStrictEqual(othersLeft);

    // Saving a non-default template demotes nothing; re-saving the default keeps it the default.
    await saveTemplate(db, input({ name: 'another plain left' }));
    expect((await findDefaultTemplate(db, planner.id, 'weekly_left'))?.id).toBe(newLeft.id);
    const resaved = await saveTemplate(db, input({ id: newLeft.id, name: 'new left v2', is_default: true }));
    expect(resaved.version).toBe(2);
    expect((await findDefaultTemplate(db, planner.id, 'weekly_left'))?.id).toBe(newLeft.id);
    expect((await getTemplate(db, oldLeft.id))?.version).toBe(2);
  });

  it('findDefaultTemplate ignores deleted defaults and prefers the most recently updated', async () => {
    expect(await findDefaultTemplate(db, planner.id, 'weekly_left')).toBeNull();

    const a = await saveTemplate(db, input({ name: 'a', is_default: true }));
    await deleteTemplate(db, a.id);
    expect(await findDefaultTemplate(db, planner.id, 'weekly_left')).toBeNull();
    expect(await findDefaultTemplate(db, planner.id, 'weekly_right')).toBeNull();

    const b = await saveTemplate(db, input({ name: 'b', is_default: true }));
    const c = await saveTemplate(db, input({ name: 'c', is_default: true }));
    expect((await findDefaultTemplate(db, planner.id, 'weekly_left'))?.id).toBe(c.id);

    // Two live defaults, as a crash between saveTemplate's two statements could leave: the most
    // recently updated one wins.
    await db.execute('UPDATE page_templates SET is_default = 1, updated_at = ? WHERE id = ?', [
      '2099-01-01T00:00:00.000Z',
      b.id,
    ]);
    expect((await findDefaultTemplate(db, planner.id, 'weekly_left'))?.id).toBe(b.id);
    await db.execute('UPDATE page_templates SET updated_at = ? WHERE id = ?', ['2099-01-02T00:00:00.000Z', c.id]);
    expect((await findDefaultTemplate(db, planner.id, 'weekly_left'))?.id).toBe(c.id);
  });

  it('soft-deletes a template and revives it with the same id on the next save', async () => {
    const template = await saveTemplate(db, input({ name: 'gone' }));
    await deleteTemplate(db, template.id);
    expect(await getTemplate(db, template.id)).toBeNull();
    expect(await listTemplates(db, planner.id)).toEqual([]);
    expect(await db.select('SELECT deleted_at, version FROM page_templates WHERE id = ?', [template.id])).toEqual([
      { deleted_at: expect.stringMatching(TIMESTAMP), version: 2 },
    ]);

    // Deleting again is a no-op; a malformed id is refused.
    await deleteTemplate(db, template.id);
    expect(await db.select('SELECT version FROM page_templates WHERE id = ?', [template.id])).toEqual([{ version: 2 }]);
    await expect(deleteTemplate(db, 'nope')).rejects.toThrow('invalid id (expected UUID)');

    const revived = await saveTemplate(db, input({ id: template.id, name: 'back' }));
    expect(revived).toStrictEqual({
      ...template,
      name: 'back',
      updated_at: expect.stringMatching(TIMESTAMP),
      version: 3,
    });
    expect(await db.select('SELECT deleted_at FROM page_templates WHERE id = ?', [template.id])).toEqual([
      { deleted_at: null },
    ]);
    expect(await listTemplates(db, planner.id)).toStrictEqual([revived]);
  });

  it('seeds the bundled defaults once and fills in a missing type later', async () => {
    const seeded = await seedDefaultTemplates(db, planner.id, planner.profile_id);
    expect(seeded.map(t => t.template_type)).toEqual(['weekly_left', 'weekly_right', 'monthly']);
    expect(seeded.map(t => t.name)).toEqual(BUNDLED_DEFAULT_TEMPLATES.map(b => b.name));
    expect(seeded.map(t => t.content)).toEqual(BUNDLED_DEFAULT_TEMPLATES.map(b => b.content));
    for (const template of seeded) {
      expect(template.is_default).toBe(true);
      expect(template.planner_id).toBe(planner.id);
      expect(template.profile_id).toBe(planner.profile_id);
      expect(template.schema_version).toBe(1);
      expect(template.version).toBe(1);
    }

    // Idempotent.
    expect(await seedDefaultTemplates(db, planner.id, planner.profile_id)).toEqual([]);
    expect(await listTemplates(db, planner.id)).toHaveLength(3);

    // A deleted default is replaced by a fresh row of that type only.
    await deleteTemplate(db, seeded[2].id);
    const again = await seedDefaultTemplates(db, planner.id, planner.profile_id);
    expect(again.map(t => t.template_type)).toEqual(['monthly']);
    expect(again[0].id).not.toBe(seeded[2].id);
    expect(await listTemplates(db, planner.id)).toHaveLength(3);

    // A user-made default of a type counts as present.
    await deleteTemplate(db, again[0].id);
    const custom = await saveTemplate(db, input({ name: 'My monthly', template_type: 'monthly', is_default: true }));
    expect(await seedDefaultTemplates(db, planner.id, planner.profile_id)).toEqual([]);
    expect((await findDefaultTemplate(db, planner.id, 'monthly'))?.id).toBe(custom.id);
  });

  it('seeding rejects unknown planners', async () => {
    await expect(seedDefaultTemplates(db, newId(), planner.profile_id)).rejects.toThrow('planner not found');
    await expect(seedDefaultTemplates(db, 'nope', planner.profile_id)).rejects.toThrow(
      'invalid planner_id (expected UUID)',
    );
    expect(await db.select('SELECT count(*) AS n FROM page_templates')).toEqual([{ n: 0 }]);
  });

  it('toTemplateRecord carries the profile id as user_id', async () => {
    const template = await saveTemplate(db, input({ name: 'Rec', is_default: true }));
    expect(toTemplateRecord(template)).toStrictEqual({
      id: template.id,
      name: 'Rec',
      template_type: 'weekly_left',
      is_default: true,
      user_id: planner.profile_id,
      planner_id: planner.id,
      content: CONTENT,
    });
  });
});
