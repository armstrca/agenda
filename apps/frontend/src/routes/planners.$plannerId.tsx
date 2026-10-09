// apps/frontend/src/routes/planners.$plannerId.tsx
import { createFileRoute, Outlet } from '@tanstack/react-router'
import { getDb } from '../db/index.ts'
import { getPlanner } from '../domain/planners.ts'
import { isId } from '../domain/ids.ts'

// Loads the planner for every page under it, so shared UI (PageNavigation's "today" targets need
// the week-start day) can read it with useMatch. A malformed or unknown id yields null rather than
// an error: the page routes below report those with their own messages.
export const Route = createFileRoute('/planners/$plannerId')({
  loader: async ({ params }) => ({
    planner: isId(params.plannerId) ? await getPlanner(await getDb(), params.plannerId) : null,
  }),
  component: PlannerLayout
})

function PlannerLayout() {
  return (
    <>
      <Outlet />
    </>
  )
}
