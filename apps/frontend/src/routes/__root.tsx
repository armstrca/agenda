import { createRootRoute, Link, Outlet } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';

export const Route = createRootRoute({
  component: () => (
    <>
      <Outlet />
    </>
  ),
  errorComponent: ({ error }) => (
    <div>
      <h1>You screwed up</h1>
      <p>{error.message}</p>
    </div>
  ),
});
