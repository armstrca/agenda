import { createFileRoute } from '@tanstack/react-router';
import React from 'react';
import WeeklyLeft from '../components/weekly/WeeklyLeft';
import WeeklyRight from '../components/weekly/WeeklyRight';
import { PageTemplate } from '../types/types';
import { useLoaderData } from '@tanstack/react-router';
import { loadPages, IndexArgs, IndexReply } from './../utils/ipc';

export const Route = createFileRoute('/planners/$plannerId/weekly/$weekId')({
  loader: async ({ params }) => {
    console.debug("Loading weekly page with params:", params);
    const [, , side] = params.weekId.split('_');
    const pageType = side === 'r' ? 'weekly_right' : 'weekly_left';

    try {
      const args: IndexArgs = {
        planner_id: params.plannerId,
        week_id: params.weekId,
        pageType,
      };

      const data = await loadPages(args);
      console.log("Pages index response:", JSON.stringify(data));

      const [weekNumber, year] = params.weekId.split('_');

      if (!data.template) throw new Error("Missing template data");
      if (!data.weekData) throw new Error("Missing week data");

      return {
        template: processTemplateAssets(data.template as PageTemplate),
        weekData: data.weekData,
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
    moonPhases: weekData.moonPhases ?? {},
    templateData: weekData.templateData,
    weekStart: weekData.weekStart,
    currentMonthName: weekData.currentMonthName,
    leftCalendar: weekData.leftCalendar ?? {},
    rightCalendar: weekData.rightCalendar ?? {},
    lastDayData: weekData.lastDayData ?? {},
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