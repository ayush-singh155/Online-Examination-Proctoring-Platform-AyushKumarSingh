import React, { useState, useEffect } from 'react';
import Student from './Student.jsx';
import Admin from './Admin.jsx';

function getUser() {
  try {
    return JSON.parse(localStorage.getItem('user'));
  } catch {
    return null;
  }
}

export default function App() {
  const [user, setUser] = useState(getUser());
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);
  function logout() {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    setUser(null);
  }
  if (!user) return <Auth onLogin={setUser} theme={theme} setTheme={setTheme} />;
  return (
    <div>
      <div className="header">
        ExamGuard
        <span style={{ float: 'right', fontSize: 16, cursor: 'pointer' }} onClick={logout}>Logout</span>
        <span style={{ float: 'left', fontSize: 16, cursor: 'pointer' }} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? '🌙' : '☀️'}
        </span>
      </div>
      {user.role === 'admin' ? <Admin user={user} /> : <Student user={user} />}
    </div>
  );
}

function Auth({ onLogin, theme, setTheme }) {
  const [isLogin, setIsLogin] = useState(true);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [err, setErr] = useState('');
  async function submit(e) {
    e.preventDefault();
    setErr('');
    try {
      const res = await fetch('/api/auth/' + (isLogin ? 'login' : 'register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      localStorage.setItem('user', JSON.stringify(data.user));
      localStorage.setItem('token', data.token);
      onLogin(data.user);
    } catch (e) {
      setErr(e.message);
    }
  }
  return (
    <div style={{ maxWidth: 350, margin: '3rem auto' }}>
      <div className="header">ExamGuard</div>
      <form className="card" onSubmit={submit}>
        {!isLogin && <input className="input" placeholder="Name" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />}
        <input className="input" placeholder="Email" type="email" required value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
        <input className="input" placeholder="Password" type="password" required value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
        <button className="button" type="submit">{isLogin ? 'Login' : 'Register'}</button>
        <div style={{ marginTop: 8 }}>
          <span style={{ cursor: 'pointer', color: 'var(--primary)' }} onClick={() => setIsLogin(l => !l)}>
            {isLogin ? 'No account? Register' : 'Have an account? Login'}
          </span>
        </div>
        {err && <div className="violation">{err}</div>}
      </form>
      <div style={{ textAlign: 'center', marginTop: 16 }}>
        <span style={{ cursor: 'pointer' }} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? '🌙 Dark' : '☀️ Light'}
        </span>
      </div>
    </div>
  );
}
