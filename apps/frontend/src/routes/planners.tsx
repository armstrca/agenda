import { createFileRoute, Outlet } from '@tanstack/react-router'

// Layout route for /planners/*: the planner pages render inside the sized container.
export const Route = createFileRoute('/planners')({
  component: PlannersLayout,
})

function PlannersLayout() {
  return (
    <div className="planner-container">
      <Outlet />
    </div>
  )
}
