
import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useNavigate } from '@tanstack/react-router';
import { apiClient } from '../api/api.js';

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
        // Add more settings as needed
      };
      const payload = {
        name,
        description,
        planner_settings,
        // user_id: ... (get from auth context if needed)
      };
      const result = await apiClient.createPlanner(payload);
      if (result && result.id) {
        navigate({ to: `/planners/${result.id}` });
      } else {
        setError('Failed to create planner.');
      }
    } catch (err) {
      setError('Error creating planner.');
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
        {/* EasyBlocks editor for planner_settings can be added here later */}
        <button type="submit" disabled={isSubmitting}>Create Planner</button>
        {error && <div className="error">{error}</div>}
      </form>
    </div>
  );
}
