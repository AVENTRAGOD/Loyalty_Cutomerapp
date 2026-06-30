import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Shield } from 'lucide-react';

const Login = () => {
  const [memberCode, setMemberCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const { login, settings } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    
    const { success, error: loginError } = await login(memberCode);
    
    if (success) {
      navigate('/dashboard');
    } else {
      setError(loginError || 'Failed to login');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: 'var(--bg-main)' }}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="p-8 text-center bg-[var(--primary)] text-white">
          <Shield className="w-16 h-16 mx-auto mb-4 opacity-90" />
          <h1 className="text-3xl font-bold tracking-tight">
            {settings?.business_name || 'Loyalty Program'}
          </h1>
          <p className="mt-2 text-white/80">Welcome back, Member!</p>
        </div>
        
        <div className="p-8">
          <form onSubmit={handleLogin} className="space-y-6">
            {error && (
              <div className="p-4 rounded-lg bg-red-50 text-red-600 text-sm border border-red-200">
                {error}
              </div>
            )}
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Member Code (PIN)</label>
              <input 
                type="text" 
                required
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent transition-all tracking-widest uppercase font-mono"
                placeholder="XXXXXX"
                maxLength={6}
                value={memberCode}
                onChange={(e) => setMemberCode(e.target.value.toUpperCase())}
              />
              <p className="text-xs text-slate-500 mt-1">This is the 6-character code given to you when you joined.</p>
            </div>
            
            <button 
              type="submit" 
              disabled={isLoading}
              className="w-full py-3 px-4 rounded-xl text-white font-medium shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-70 transition-all"
              style={{ backgroundColor: 'var(--primary)' }}
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;
