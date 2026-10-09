import { createFileRoute, useLoaderData } from '@tanstack/react-router';
import Monthly from '../components/monthly/Monthly.tsx';
import { getDb } from '../db/index.ts';
import { loadMonthlyPage } from '../domain/pages.ts';
import type { TemplateRecord } from '../domain/types.ts';

export const Route = createFileRoute('/planners/$plannerId/monthly/$monthId')({
  loader: async ({ params }) => {
    const db = await getDb();
    const page = await loadMonthlyPage(db, params.plannerId, params.monthId);
    return {
      template: processTemplateAssets(page.template),
      monthData: page.monthData,
      page_id: page.page_id,
      planner_id: page.planner_id,
      tldraw_snapshots: page.tldraw_snapshots,
    };
  },
  pendingComponent: () => <div>Loading monthly view...</div>,
  errorComponent: ({ error }) => (
    <div className="p-4 text-red-500">Error loading monthly page: {error.message}</div>
  ),
  component: MonthlyComponent
});

function MonthlyComponent() {
  const { template, monthData, page_id, planner_id, tldraw_snapshots } = useLoaderData({ from: Route.id });

  return (
    <Monthly
      template={template}
      {...monthData}
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
