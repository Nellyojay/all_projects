import { useState, type FormEvent } from 'react';
import { useSupabaseAuth } from './SupabaseAuthContext';
import './auth.css';

export function AuthScreen() {
  const { configured, error, clearError, signIn, signUp } = useSupabaseAuth();
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearError();
    setMessage('');
    setIsSubmitting(true);
    try {
      if (isCreatingAccount) {
        const signedIn = await signUp(email.trim(), password);
        setMessage(signedIn
          ? 'Your account is ready.'
          : 'Check your email to confirm your account, then sign in.');
      } else {
        await signIn(email.trim(), password);
      }
    } catch {
      // The provider exposes the Supabase error to the form.
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-brand-mark">M</div>
        <p className="auth-eyebrow">MYTHINGS WORKSPACE</p>
        <h1 id="auth-title">{configured ? 'Your private space' : 'Supabase setup needed'}</h1>
        <p className="auth-description">
          {configured
            ? 'Sign in to your private Supabase workspace. Access to application data is restricted to your account.'
            : 'Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in the deployment environment to enable sign-in.'}
        </p>
        {configured && (
          <form className="auth-form" onSubmit={(event) => void submit(event)}>
            <label>
              Email
              <input
                autoComplete="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.currentTarget.value)}
                required
              />
            </label>
            <label>
              Password
              <input
                autoComplete={isCreatingAccount ? 'new-password' : 'current-password'}
                type="password"
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.currentTarget.value)}
                required
              />
            </label>
            {error && <p className="auth-message auth-message--error" role="alert">{error}</p>}
            {message && <p className="auth-message" role="status">{message}</p>}
            <button className="auth-submit" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Please wait…' : isCreatingAccount ? 'Create account' : 'Sign in'}
            </button>
            <button
              className="auth-switch"
              type="button"
              onClick={() => {
                clearError();
                setMessage('');
                setIsCreatingAccount((current) => !current);
              }}
            >
              {isCreatingAccount ? 'Already have an account? Sign in' : 'New here? Create an account'}
            </button>
          </form>
        )}
        <p className="auth-privacy-note">Anonymous access to private records is disabled.</p>
      </section>
    </main>
  );
}
