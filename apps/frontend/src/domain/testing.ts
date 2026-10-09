/**
 * Domain-level test support (not a test file, and not part of the public barrel).
 *
 * `seedFixturePlanner` writes the profile, planner and three default templates recorded in
 * __fixtures__/seed.json, with their original ids, so a test runs the TypeScript builders on
 * exactly the rows the Rust build produced the golden fixtures from. It goes through the real
 * repositories rather than raw INSERTs so the seed is also subject to their validation, and it
 * seeds nothing but what the fixture had (no bundled defaults). The one knob, `weekStart`,
 * mirrors how each fixture variant folder was captured: the same planner with its
 * `week-start-day` setting changed.
 */

import type { Database } from '../db/Database.ts';
import seed from './__fixtures__/seed.json';
import { createPlanner } from './planners.ts';
import { createProfile } from './profiles.ts';
import { saveTemplate } from './templates.ts';
import type { PlannerSettings } from './types.ts';

export interface SeedFixtureOptions {
  /** Overrides planner_settings.metadata.default_styles["week-start-day"] ("Mon" … "Sun"). */
  weekStart?: string;
}

export interface SeededFixture {
  profileId: string;
  plannerId: string;
  /** Template id by template_type: "weekly_left", "weekly_right", "monthly". */
  templateIds: Record<string, string>;
}

export async function seedFixturePlanner(db: Database, options: SeedFixtureOptions = {}): Promise<SeededFixture> {
  const profile = await createProfile(db, { id: seed.profile.id, name: seed.profile.name });

  // Deep copy so the override never leaks into the shared JSON module between tests.
  const settings = JSON.parse(JSON.stringify(seed.planner.planner_settings)) as PlannerSettings;
  if (options.weekStart !== undefined) {
    const metadata = (settings.metadata ??= {});
    const styles = (metadata.default_styles ??= {});
    styles['week-start-day'] = options.weekStart;
  }

  const planner = await createPlanner(db, {
    id: seed.planner.id,
    name: seed.planner.name,
    description: seed.planner.description,
    planner_settings: settings,
    profile_id: profile.id,
    seedDefaultTemplates: false,
  });

  const templateIds: Record<string, string> = {};
  for (const template of seed.templates) {
    const saved = await saveTemplate(db, {
      id: template.id,
      planner_id: planner.id,
      profile_id: profile.id,
      name: template.name,
      template_type: template.template_type,
      is_default: true,
      content: template.content,
    });
    templateIds[saved.template_type] = saved.id;
  }

  return { profileId: profile.id, plannerId: planner.id, templateIds };
}
