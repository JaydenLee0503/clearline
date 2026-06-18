import React, { useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';

/**
 * AuthGate — real Supabase email/password auth.
 *
 * Navigation after a successful sign-in/sign-up is driven by the
 * onAuthStateChange listener in App.jsx, so this component only needs to
 * trigger the auth call and surface errors.
 */
export default function AuthGate({ onBack }) {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const isSignup = mode === 'signup';
  const canContinue =
    email.includes('@') &&
    password.length >= 6 &&
    (!isSignup || name.trim().length >= 2);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canContinue || busy) return;
    setError('');
    setNotice('');

    if (!isSupabaseConfigured) {
      setError('Sign-in is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.');
      return;
    }

    setBusy(true);
    try {
      if (isSignup) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { name: name.trim() } },
        });
        if (signUpError) throw signUpError;
        // If email confirmation is ON, no session is returned yet.
        if (!data.session) {
          setNotice('Account created. Check your email to confirm, then sign in.');
          setMode('signin');
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) throw signInError;
      }
      // Success with a session → App's auth listener navigates to the dashboard.
    } catch (err) {
      setError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="product-shell auth-shell">
      <ProductNav onBack={onBack} />
      <main className="auth-grid">
        <section className="auth-copy">
          <span className="mono-kicker">Private account workspace</span>
          <h1>Secure crisis rooms for every document.</h1>
          <p>
            Sign in to keep your analyzed plans in one private workspace. Each report is locked to
            your account by row-level security — no one else can read it. The Guardian still
            tokenizes every document before any AI sees it.
          </p>
          <div className="security-stack">
            <span>Guardian tokenization before AI</span>
            <span>Row-level security per account</span>
            <span>Delete a report and its data for good</span>
          </div>
          <div className="auth-orbit" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </section>

        <form className="auth-card" onSubmit={handleSubmit}>
          <div className="auth-card-header">
            <span className="brand-pulse" />
            <div>
              <strong>{isSignup ? 'Create your account' : 'Enter ResilienceHub'}</strong>
              <small>No raw document leaves your browser.</small>
            </div>
          </div>

          {isSignup && (
            <label>Name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
            </label>
          )}
          <label>Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" type="email" autoComplete="email" />
          </label>
          <label>Password
            <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" type="password" autoComplete={isSignup ? 'new-password' : 'current-password'} />
          </label>

          {error && <div className="inline-error">{error}</div>}
          {notice && <div className="inline-notice">{notice}</div>}

          <button disabled={!canContinue || busy}>
            {busy ? 'Working…' : isSignup ? 'Create account' : 'Sign in'}
          </button>

          <p>
            {isSignup ? 'Already have an account? ' : "Don't have an account? "}
            <button
              type="button"
              className="link-button"
              onClick={() => { setMode(isSignup ? 'signin' : 'signup'); setError(''); setNotice(''); }}
            >
              {isSignup ? 'Sign in' : 'Create one'}
            </button>
          </p>
        </form>
      </main>
    </div>
  );
}

export function ProductNav({ onBack, account, onLogout }) {
  return (
    <nav className="product-nav">
      <button className="ghost-button" onClick={onBack}>Back</button>
      <div className="product-brand"><span className="brand-pulse" /><strong>ResilienceHub</strong></div>
      {account ? (
        <div className="account-pill"><span>{account.name}</span><button onClick={onLogout}>Sign out</button></div>
      ) : (
        <span className="privacy-pill">PII never leaves your device</span>
      )}
    </nav>
  );
}
