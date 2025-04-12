import { createFileRoute } from '@tanstack/react-router';
import React from 'react';
import WeeklyLeft from '../components/weekly/WeeklyLeft';
import { Page, PageTemplate } from '../types/types';
import { useLoaderData } from '@tanstack/react-router';

export const Route = createFileRoute('/weekly/$weekId')({
  loader: async ({ params }) => {
    try {
      const response = await fetch(
        `http://localhost:3001/api/planners/38e012ec-0ab2-4fbe-8e68-8a75e4716a35/pages?week_id=${params.weekId}&page_type=weekly`,
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (!data.template || !data.weekData || !data.page_id) {
        throw new Error('Invalid response structure');
      }

      return {
        template: processTemplateAssets(data.template),
        weekData: {
          ...data.weekData,
          mainDates: data.weekData.mainDates.map((dateStr: string) => new Date(dateStr))
        },
        page_id: data.page_id
      };
    } catch (error) {
      // console.error('Loader error:', error);
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
  const { template, weekData, page_id } = useLoaderData({ from: Route.id });

  return (
    <WeeklyLeft
      template={template}
      {...weekData}
      page_id={page_id}
    />
  );
}

// Helper to replace asset placeholders
const processTemplateAssets = (template: PageTemplate) => {
  if (!template?.content) return template;
  const assetBase = template.content.metadata?.asset_base_url || '';
  const processed = JSON.parse(
    JSON.stringify(template.content)
      .replace(/\$\{asset_base_url\}/g, assetBase)
  );
  return { ...template, content: processed };
};