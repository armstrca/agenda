import { createFileRoute } from '@tanstack/react-router';
import React from 'react';

export const Route = createFileRoute('/monthly/$monthId')({
  loader: async ({ params }: { params: { monthId: string; plannerId: string } }) => {
    const response = await fetch(`/api/planners/${params.plannerId}/pages?month_id=${params.monthId}&page_type=monthly`);
    if (!response.ok) {
      throw new Error('Failed to fetch monthly page data');
    }
    const data = await response.json();
    return { params, data };
  },
  component: ({ loaderData }) => {
    const { params, data } = loaderData;
    return (
      <div>
        <h1>Monthly Page for {params.monthId}</h1>
        <pre>{JSON.stringify(data, null, 2)}</pre>
      </div>
    );
  },
});
