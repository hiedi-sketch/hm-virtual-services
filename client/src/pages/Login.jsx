import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  if (user) {
    const dest = user.role === 'admin' ? '/admin' : '/client';
    navigate(dest, { replace: true });
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const u = await login(email, password);
      const dest = location.state?.from?.pathname || (u.role === 'admin' ? '/admin' : '/client');
      navigate(dest, { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-linen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo card */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary rounded-2xl mb-4 shadow-lg">
            <span className="text-white font-bold text-xl">HM</span>
          </div>
          <h1 className="text-2xl font-bold text-primary">HM Virtual Services</h1>
          <p className="text-silver text-sm mt-1">Bookkeeping & Payroll Management</p>
        </div>

        <div className="card shadow-card-hover">
          <h2 className="text-lg font-bold text-gray-800 mb-6">Sign in to your account</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email address</label>
              <input
                type="email"
                className="input"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                type="password"
                className="input"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <button type="submit" className="btn-primary w-full py-2.5 mt-2" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-silver mt-6">
          © {new Date().getFullYear()} HM Virtual Services
        </p>
      </div>
    </div>
  );
}
