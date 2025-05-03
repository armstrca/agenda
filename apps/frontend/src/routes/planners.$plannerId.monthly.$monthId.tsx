import { createFileRoute } from '@tanstack/react-router';
import Monthly from '../components/monthly/Monthly';
import { PageTemplate } from '../types/types';
import { useLoaderData } from '@tanstack/react-router';

export const Route = createFileRoute('/planners/$plannerId/monthly/$monthId')({
  loader: async ({ params }) => {
    const response = await fetch(
      `http://localhost:3001/api/planners/${params.plannerId}/pages?month_id=${params.monthId}&page_type=monthly`,
      { credentials: 'include' }
    );

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const data = await response.json();
    console.log('API Response:', data); // Add this to debug

    const [month, year] = params.monthId.split('_');

    return {
      template: processTemplateAssets(data.template),
      monthData: {
        ...data.monthData,
        month: parseInt(month),
        year: parseInt(year)
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