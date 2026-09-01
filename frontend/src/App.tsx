import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Sessions } from './pages/Sessions';
import { WorkflowCanvas } from './pages/WorkflowCanvas';
import { Templates } from './pages/Templates';
import { AgentConfig } from './pages/AgentConfig';
import { Extensions } from './pages/Extensions';
import { Settings } from './pages/Settings';

export default function App() {
  const [authChecked, setAuthChecked] = React.useState(false);
  const [isLoggedIn, setIsLoggedIn] = React.useState(false);

  React.useEffect(() => {
    // SEC-016: Clean up old token from localStorage on app startup
    localStorage.removeItem('token');
    fetch('/api/auth/me', { credentials: 'include' })
      .then((res) => {
        setIsLoggedIn(res.ok);
        setAuthChecked(true);
      })
      .catch(() => {
        setIsLoggedIn(false);
        setAuthChecked(true);
      });
  }, []);

  if (!authChecked) {
    return (
      <div style={{
        width: '100%',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0B1120',
        color: '#94A3B8',
      }}>
        Loading...
      </div>
    );
  }

  if (!isLoggedIn) {
    return <LoginScreen onLogin={() => setIsLoggedIn(true)} />;
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/sessions" element={<Sessions />} />
        <Route path="/workflows" element={<WorkflowCanvas />} />
        <Route path="/templates" element={<Templates />} />
        <Route path="/agent-config" element={<AgentConfig />} />
        <Route path="/extensions" element={<Extensions />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [mode, setMode] = React.useState<'login' | 'register'>('login');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [username, setUsername] = React.useState('');
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
          credentials: 'include',
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Login failed');
        onLogin();
      } else {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, email, password }),
          credentials: 'include',
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Register failed');
        onLogin();
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0B1120',
    }}>
      <div style={{
        width: '360px',
        padding: '32px',
        background: '#1E293B',
        borderRadius: '12px',
        border: '1px solid #334155',
      }}>
        <h1 style={{ fontSize: '24px', marginBottom: '8px', color: '#F8FAFC' }}>Pi Console</h1>
        <p style={{ color: '#94A3B8', marginBottom: '24px' }}>{mode === 'login' ? 'Sign in to your account' : 'Create a new account'}</p>
        {error && <div style={{ color: '#EF4444', marginBottom: '16px', fontSize: '14px' }}>{error}</div>}
        <form onSubmit={handleSubmit}>
          {mode === 'register' && (
            <input
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{ width: '100%', marginBottom: '12px' }}
              required
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: '100%', marginBottom: '12px' }}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: '100%', marginBottom: '20px' }}
            required
          />
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '10px',
              background: '#3B82F6',
              borderRadius: '6px',
              color: '#fff',
              fontWeight: 600,
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Sign Up'}
          </button>
        </form>
        <div style={{ marginTop: '16px', textAlign: 'center', color: '#94A3B8', fontSize: '14px' }}>
          {mode === 'login' ? (
            <span>Don't have an account? <button onClick={() => setMode('register')} style={{ color: '#3B82F6' }}>Sign Up</button></span>
          ) : (
            <span>Already have an account? <button onClick={() => setMode('login')} style={{ color: '#3B82F6' }}>Sign In</button></span>
          )}
        </div>
      </div>
    </div>
  );
}
