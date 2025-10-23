import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useNavigate } from '@tanstack/react-router';
import { apiClient } from '../api/api.js';

export const Route = createFileRoute('/users/create' as any)({
  component: UserCreate,
});

function UserCreate() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');
    try {
      const payload = { name, email, password };
      const result = await apiClient.createUser(payload);
      if (result && result.id) {
        // created: navigate to planner creation next step
        navigate({ to: '/planners/create' });
      } else {
        setError('Failed to create user.');
      }
    } catch (err: any) {
      setError(err?.message || 'Error creating user.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="user-create-container" style={{ padding: 16 }}>
      <h2>Create your user</h2>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 8 }}>
          <label>Name:</label>
          <input value={name} onChange={e => setName(e.target.value)} required />
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>Email:</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>Password:</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
        </div>
        <button type="submit" disabled={isSubmitting}>Create User</button>
        {error && <div className="error" style={{ color: 'red', marginTop: 8 }}>{error}</div>}
      </form>
    </div>
  );
}
