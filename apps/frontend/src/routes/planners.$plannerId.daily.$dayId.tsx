import { createFileRoute, useLoaderData } from '@tanstack/react-router';
import Daily from '../components/daily/Daily.tsx';
import { getDb } from '../db/index.ts';
import { loadDailyPage } from '../domain/pages.ts';
import type { TemplateRecord } from '../domain/types.ts';

export const Route = createFileRoute('/planners/$plannerId/daily/$dayId')({
  loader: async ({ params }) => {
    const db = await getDb();
    const page = await loadDailyPage(db, params.plannerId, params.dayId);
    return {
      template: processTemplateAssets(page.template),
      dayData: page.dayData,
      page_id: page.page_id,
      planner_id: page.planner_id,
      tldraw_snapshots: page.tldraw_snapshots,
    };
  },
  pendingComponent: () => <div>Loading daily view...</div>,
  errorComponent: ({ error }) => (
    <div className="p-4 text-red-500">Error loading daily page: {(error instanceof Error ? error.message : String(error))}</div>
  ),
  component: DailyComponent
});

function DailyComponent() {
  const { template, dayData, page_id, planner_id, tldraw_snapshots } = useLoaderData({ from: Route.id });

  return (
    <Daily
      template={template}
      dayData={dayData}
      page_id={page_id}
      plannerId={planner_id}
      tldraw_snapshots={tldraw_snapshots}
    />
  );
}

const processTemplateAssets = (template: TemplateRecord): TemplateRecord => {
  if (!template?.content) return template;
  const processed = JSON.parse(
    JSON.stringify(template.content)
      .replace(/apps\/frontend\/public/g, '')
  );
  return { ...template, content: processed };
};
