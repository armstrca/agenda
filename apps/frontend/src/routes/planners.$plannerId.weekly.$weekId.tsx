import { createFileRoute, useLoaderData } from '@tanstack/react-router';
import WeeklyLeft from '../components/weekly/WeeklyLeft.tsx';
import WeeklyRight from '../components/weekly/WeeklyRight.tsx';
import { getDb } from '../db/index.ts';
import { loadWeeklyPage } from '../domain/pages.ts';
import type { TemplateRecord } from '../domain/types.ts';

export const Route = createFileRoute('/planners/$plannerId/weekly/$weekId')({
  loader: async ({ params }) => {
    const db = await getDb();
    const page = await loadWeeklyPage(db, params.plannerId, params.weekId);
    return {
      template: processTemplateAssets(page.template),
      weekData: page.weekData,
      page_id: page.page_id,
      planner_id: page.planner_id,
      tldraw_snapshots: page.tldraw_snapshots,
    };
  },
  pendingComponent: () => <div>Loading weekly view...</div>,
  errorComponent: ({ error }) => (
    <div className="p-4 text-red-500">
      Error loading weekly page: {error.message}
      <button
        onClick={() => window.location.reload()}
        className="ml-4 px-4 py-2 bg-blue-500 text-white rounded"
      >
        Retry
      </button>
    </div>
  ),
  component: WeeklyComponent
});

function WeeklyComponent() {
  const { template,
    weekData,
    page_id,
    planner_id,
    tldraw_snapshots
  } = useLoaderData({ from: Route.id });

  const commonProps = {
    template,
    ...weekData,
    page_id,
    plannerId: planner_id,
    tldraw_snapshots,
  };

  return weekData.side === 'r' ? (
    <WeeklyRight {...commonProps} />
  ) : (
    <WeeklyLeft {...commonProps} />
  );
}

// Templates saved by the old backend may still carry build-time asset paths; strip them to URLs.
const processTemplateAssets = (template: TemplateRecord): TemplateRecord => {
  if (!template?.content) return template;
  const processed = JSON.parse(
    JSON.stringify(template.content)
      .replace(/apps\/frontend\/public/g, '')
  );
  return { ...template, content: processed };
};
