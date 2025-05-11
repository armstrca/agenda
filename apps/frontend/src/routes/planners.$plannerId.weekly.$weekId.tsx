import { createFileRoute } from '@tanstack/react-router';
import React from 'react';
import WeeklyLeft from '../components/weekly/WeeklyLeft';
import WeeklyRight from '../components/weekly/WeeklyRight';
import { PageTemplate } from '../types/types';
import { useLoaderData } from '@tanstack/react-router';
import { loadPages, IndexArgs, IndexReply } from './../utils/ipc';

export const Route = createFileRoute('/planners/$plannerId/weekly/$weekId')({
  loader: async ({ params }) => {
    try {
      const args: IndexArgs = {
        planner_id: params.plannerId,
        week_id: params.weekId,
        pageType: 'weekly',
      };

      // 2. Invoke the Go sidecar via Tauri IPC:
      const data: IndexReply = await loadPages(args);

      const [weekNumber, year, side] = params.weekId.split('_');

      return {
        template: processTemplateAssets(data.template as PageTemplate),
        weekData: {
          ...data.weekData,
          weekNumber: parseInt(weekNumber),
          year: parseInt(year),
          side: side,
          mainDates: data.weekData?.mainDates ?? [],
          endDate: data.weekData?.endDate ?? null,
        },
        page_id: data.page_id,
        planner_id: data.planner_id,
        tldraw_snapshots: data.tldraw_snapshots
      };
    } catch (error) {
      throw error;
    }
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
    weekNumber: weekData.weekNumber,
    year: weekData.year,
    holidays: weekData.holidays ?? {},
    moonPhases: weekData.moonPhases ?? {}
  };

  return weekData.side === 'r' ? (
    <WeeklyRight {...commonProps} />
  ) : (
    <WeeklyLeft {...commonProps} />
  );
}


// Helper to replace asset placeholders
const processTemplateAssets = (template: PageTemplate) => {
  if (!template?.content) return template;
  const processed = JSON.parse(
    JSON.stringify(template.content)
      .replace(/apps\/frontend\/public/g, '')
  );
  return { ...template, content: processed };
};