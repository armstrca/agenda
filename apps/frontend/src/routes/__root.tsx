import { createRootRoute, Link, Outlet } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';

export const Route = createRootRoute({
  component: () => (
    <>
      {/* <div className="p-2 flex gap-2">
        <Link to="/" className="[&.active]:font-bold">Home</Link>
        <Link to="/about" className="[&.active]:font-bold">About</Link>
        <Link to="/weekly/$weekId" params={{ weekId: '13_2025', plannerId: 'f117015e-3f0f-47c4-a86c-0646dfe34d74' }} className="[&.active]:font-bold">Weekly</Link>
      </div> */}
      {/* <hr /> */}
      <Outlet />
      {/* <TanStackRouterDevtools /> */}
    </>
  ),
  errorComponent: ({ error }) => (
    <div>
      <h1>You screwed up</h1>
      <p>{error.message}</p>
    </div>
  ),
});
