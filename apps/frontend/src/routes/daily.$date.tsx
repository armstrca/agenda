import { createFileRoute } from '@tanstack/react-router';
import React from 'react';

export const Route = createFileRoute('/daily/$date')({
loader: async ({ params }: { params: { date: string; plannerId: string } }) => {
    const response = await fetch(`/api/planners/${params.plannerId}/pages?date=${params.date}&page_type=daily`);
    if (!response.ok) {
      throw new Error('Failed to fetch daily page data');
    }
    const data = await response.json();
    return { params, data };
  },
  component: ({ loaderData }) => {
    const { params, data } = loaderData;
    return (
      <div>
        <h1>Daily Page for {params.date}</h1>
        <pre>{JSON.stringify(data, null, 2)}</pre>
      </div>
    );
  },
});
