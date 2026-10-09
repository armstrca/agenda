import type React from 'react';
import { Link } from '@tanstack/react-router';
import { formatMonthId } from '../../domain/calendar/months.ts';
import { monthOf, yearOf, type ISODate } from '../../domain/dates.ts';

// Links that turn a header's text into navigation to another page of the same planner. They fill
// the header element they sit in, so the template's class on that element keeps the positioning
// and the link only adds the click target and hover state (see .page-link in styles.css).

interface MonthLinkProps {
  plannerId?: string;
  /** Any date in the month to open. */
  date?: ISODate;
  children: React.ReactNode;
}

/** The monthly page of `date`'s month, or the bare text when the planner or date is unknown. */
export function MonthLink({ plannerId, date, children }: MonthLinkProps) {
  if (!plannerId || !date) return <>{children}</>;
  return (
    <Link
      className="page-link"
      to="/planners/$plannerId/monthly/$monthId"
      params={{ plannerId, monthId: formatMonthId(monthOf(date), yearOf(date)) }}
    >
      {children}
    </Link>
  );
}

/** Route options for a day's daily page, for links and for `navigate()` from buttons. */
export function dayPage(plannerId: string, date: ISODate) {
  return { to: '/planners/$plannerId/daily/$dayId', params: { plannerId, dayId: date } } as const;
}

interface DayLinkProps {
  plannerId?: string;
  date?: ISODate;
  children: React.ReactNode;
}

/** The daily page of `date`, or the bare text when the planner or date is unknown. */
export function DayLink({ plannerId, date, children }: DayLinkProps) {
  if (!plannerId || !date) return <>{children}</>;
  return (
    <Link className="page-link" {...dayPage(plannerId, date)}>
      {children}
    </Link>
  );
}
