import { createFileRoute } from '@tanstack/react-router';
import Monthly from '../components/monthly/Monthly';
import { PageTemplate } from '../types/types';
import { useLoaderData } from '@tanstack/react-router';
import { loadPages } from './../utils/ipc';

export const Route = createFileRoute('/planners/$plannerId/monthly/$monthId')({
  loader: async ({ params }) => {
    const data: { holidays?: object; moonPhases?: object; days?: object;[key: string]: any } = await loadPages({
      planner_id: params.plannerId,
      month_id: params.monthId,
      pageType: 'monthly'
    });


    const [month, year] = params.monthId.split('_');

    return {
      template: processTemplateAssets(data.template as PageTemplate),
      monthData: {
        month: parseInt(month),
        year: parseInt(year),
        holidays: data?.holidays || {},
        moonPhases: data?.moonPhases || {},
        days: data?.days || []
      },
      page_id: data.page_id,
      planner_id: data.planner_id,
      tldraw_snapshots: data.tldraw_snapshots
    };
  },
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

const processTemplateAssets = (template: PageTemplate) => {
  if (!template?.content) return template;
  const processed = JSON.parse(
    JSON.stringify(template.content)
      .replace(/apps\/frontend\/public/g, '')
  );
  return { ...template, content: processed };
};