import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useNavigate } from '@tanstack/react-router';
import { getDb } from '../db/index.ts';
import { createProfile } from '../domain/profiles.ts';

// Profiles replace the old user accounts: a local profile is just a name. Accounts for the
// optional online features live on a server later, not in this database.
export const Route = createFileRoute('/users/create')({
  component: ProfileCreate,
});

function ProfileCreate() {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');
    try {
      const db = await getDb();
      await createProfile(db, { name });
      navigate({ to: '/planners/create' });
    } catch (err: any) {
      setError(err?.message || 'Error creating profile.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="user-create-container" style={{ padding: 16 }}>
      <h2>Create a profile</h2>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 8 }}>
          <label>Name:</label>
          <input value={name} onChange={e => setName(e.target.value)} required />
        </div>
        <button type="submit" disabled={isSubmitting}>Create Profile</button>
        {error && <div className="error" style={{ color: 'red', marginTop: 8 }}>{error}</div>}
      </form>
    </div>
  );
}
