// apps/frontend/src/routes/planners.$plannerId.tsx
import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/planners/$plannerId')({
  component: PlannerLayout
})

function PlannerLayout() {
  return (
    <>
      <Outlet />
    </>
  )
}