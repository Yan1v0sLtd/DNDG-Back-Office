import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button, Field, Input, Panel } from '@/components/UI';

export function Login() {
  const { session, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (loading) return null;
  if (session) return <Navigate to="/heroes" replace />;

  return (
    <div className="min-h-screen grid place-items-center bg-ink">
      <Panel title="Crucible Balancer · Sign in" className="w-[360px]">
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setSubmitting(true);
            setError(null);
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) setError(error.message);
            setSubmitting(false);
          }}
        >
          <Field label="Email">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              required
            />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          {error && <div className="text-xs text-red-400">{error}</div>}
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
          <p className="text-[11px] text-muted">
            Accounts are provisioned by an admin in Supabase. Once signed in, your role is read
            from the <code>user_roles</code> table.
          </p>
        </form>
      </Panel>
    </div>
  );
}
