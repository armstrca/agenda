import { createRootRoute, Link, Outlet } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';

export const Route = createRootRoute({
  component: () => <Outlet />,
  errorComponent: ({ error }) => (
    <div className="p-4 text-red-500">
      Root Error Boundary: {error.message}
    </div>
  )
});