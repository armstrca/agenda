
import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useNavigate } from '@tanstack/react-router';
import { getDb } from '../db/index.ts';
import { createPlanner, plannerWeekStartIndex } from '../domain/planners.ts';
import { weekIdForDate } from '../domain/calendar/weeks.ts';
import { todayISO, WEEKDAY_ABBRS } from '../domain/dates.ts';

const HOLIDAY_COUNTRIES = [
  { code: 'us', name: 'United States' },
  { code: 'uk', name: 'United Kingdom' },
  { code: 'ru', name: 'Russia' },
  // Add more as needed
];

export const Route = createFileRoute('/planners/create')({
  component: PlannerCreate,
});

function PlannerCreate() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [holidayCountries, setHolidayCountries] = useState(['us']);
  const [weekStartDay, setWeekStartDay] = useState('Mon');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');
    try {
      const planner_settings = {
        holiday_countries: holidayCountries,
        metadata: { default_styles: { 'week-start-day': weekStartDay } },
      };
      const db = await getDb();
      const planner = await createPlanner(db, { name, description, planner_settings });
      navigate({
        to: '/planners/$plannerId/weekly/$weekId',
        params: { plannerId: planner.id, weekId: weekIdForDate(todayISO(), 'l', plannerWeekStartIndex(planner)) },
      });
    } catch (err: any) {
      setError(err?.message || 'Error creating planner.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCountryChange = (code: string) => {
    setHolidayCountries((prev) =>
      prev.includes(code)
        ? prev.filter((c) => c !== code)
        : [...prev, code]
    );
  };

  return (
    <div className="planner-create-container">
      <h2>Create a New Planner</h2>
      <form onSubmit={handleSubmit}>
        <div>
          <label>Name:</label>
          <input value={name} onChange={e => setName(e.target.value)} required />
        </div>
        <div>
          <label>Description:</label>
          <input value={description} onChange={e => setDescription(e.target.value)} />
        </div>
        <div>
          <label>Holiday Countries:</label>
          <div>
            {HOLIDAY_COUNTRIES.map(({ code, name }) => (
              <label key={code}>
                <input
                  type="checkbox"
                  checked={holidayCountries.includes(code)}
                  onChange={() => handleCountryChange(code)}
                />
                {name}
              </label>
            ))}
          </div>
        </div>
        <div>
          <label>Week starts on:</label>
          <select value={weekStartDay} onChange={e => setWeekStartDay(e.target.value)}>
            {WEEKDAY_ABBRS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={isSubmitting}>Create Planner</button>
        {error && <div className="error">{error}</div>}
      </form>
    </div>
  );
}
