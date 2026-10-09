import { Link } from '@tanstack/react-router';
import type { Planner } from '../domain/types.ts';
import { plannerWeekStartIndex } from '../domain/planners.ts';
import { weekIdForDate } from '../domain/calendar/weeks.ts';
import { formatMonthId } from '../domain/calendar/months.ts';
import { monthOf, todayISO, yearOf } from '../domain/dates.ts';

/** The planners in the database, each linking to its current week and month. */
export default function PlannerList({ planners }: { planners: Planner[] }) {
  const today = todayISO();
  if (planners.length === 0) {
    return (
      <p>
        No planners yet. <Link to="/planners/create">Create one</Link>.
      </p>
    );
  }
  return (
    <ul className="planner-list">
      {planners.map((p) => (
        <li key={p.id}>
          <strong>{p.name}</strong>{' '}
          <Link
            to="/planners/$plannerId/weekly/$weekId"
            params={{ plannerId: p.id, weekId: weekIdForDate(today, 'l', plannerWeekStartIndex(p)) }}
          >
            This week
          </Link>
          {' · '}
          <Link
            to="/planners/$plannerId/monthly/$monthId"
            params={{ plannerId: p.id, monthId: formatMonthId(monthOf(today), yearOf(today)) }}
          >
            This month
          </Link>
        </li>
      ))}
    </ul>
  );
}
