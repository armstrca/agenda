import { createFileRoute, Link } from '@tanstack/react-router'
import '../styles/styles.css'

export const Route = createFileRoute('/')({
  component: Index,
})

function Index() {
  return (
    <div className="planner-container">
      <Link
        to="/planners/$plannerId/weekly/$weekId"
        params={{
          plannerId: '38e012ec-0ab2-4fbe-8e68-8a75e4716a35',
          weekId: '40_2025_l'
        }}
        className="text-blue-600 hover:underline"
      >
        View Weekly Planner
      </Link>
    </div>
  )
}