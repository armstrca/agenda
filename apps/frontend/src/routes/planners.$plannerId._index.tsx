import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/planners/$plannerId/_index')({
  component: PlannerDashboard,
})

function PlannerDashboard() {
  const { plannerId } = Route.useParams()
  return <div>Planner ID: {plannerId}</div>
}