// apps/frontend/src/routes/planners.tsx
import { createFileRoute, Link } from '@tanstack/react-router'
import { useSuspenseQuery, QueryClient} from '@tanstack/react-query'

export const Route = createFileRoute('/planners')({
  component: PlannersList
})

const queryClient = new QueryClient()

function PlannersList() {
  // Fetch planners from API
  const { data: planners } = useSuspenseQuery({
    queryKey: ['planners'],
    queryFn: () => fetch('/api/planners').then(res => res.json())
  })

  return (
    <div>
      <h1>Select a Planner</h1>
      <ul>
        {planners.map((planner: any) => (
          <li key={planner.id}>
            <Link to="/planners/$plannerId" params={{ plannerId: planner.id }}>
              {planner.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}