import { createFileRoute, Link } from '@tanstack/react-router'
// @ts-ignore: Force-import global CSS with no typings
import '../styles/styles.css'
import { getDb } from '../db/index.ts'
import { listPlanners } from '../domain/planners.ts'
import PlannerList from '../components/PlannerList.tsx'

export const Route = createFileRoute('/')({
  loader: async () => ({ planners: await listPlanners(await getDb()) }),
  component: Index,
})

function Index() {
  const { planners } = Route.useLoaderData()
  return (
    <div className="planner-container">
      <h1>Agenda</h1>
      <PlannerList planners={planners} />
      <Link to="/planners/create" className="homepage">
        Create Planner
      </Link>
      <Link to="/users/create" className="homepage">
        Create Profile
      </Link>
      <Link to="/templates/editor" className="homepage">
        Page Template Editor
      </Link>
    </div>
  )
}
