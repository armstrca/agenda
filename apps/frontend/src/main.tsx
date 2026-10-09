// main.tsx
import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen.ts';
import { getDb } from './db/index.ts';
// The only web font the stylesheet uses, bundled so the app never needs Google Fonts.
import '@fontsource/aref-ruqaa/400.css';
import '@fontsource/aref-ruqaa/700.css';

export const router = createRouter({
  routeTree,
  defaultPendingComponent: () => <div>Loading...</div>,
  defaultErrorComponent: ({ error }: { error: Error }) => <div>Error: {error.message}</div>
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById('root')!;

async function boot() {
  if (rootElement.innerHTML) return;
  const root = ReactDOM.createRoot(rootElement);
  try {
    // Open (and migrate) the database before the first route loads, so a storage problem shows up
    // here instead of inside a route loader. Inside Tauri this is the SQLite file through the SQL
    // plugin; in a plain browser it is sql.js persisted to IndexedDB.
    await getDb();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    root.render(<div style={{ padding: 16 }}>Could not open the planner database: {message}</div>);
    return;
  }
  root.render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>
  );
}

void boot();
