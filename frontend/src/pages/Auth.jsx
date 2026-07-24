import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bot, Mail, Lock, Apple, ArrowLeft, Loader2, User, Sparkles, Eye, EyeOff, Check, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

/* ── Password Criteria Check ─────────────────────────────────────────────── */
const passwordCriteria = [
  { id: 'length',    label: 'At least 8 characters',             test: p => p.length >= 8 },
  { id: 'upper',     label: 'At least one uppercase letter (A-Z)', test: p => /[A-Z]/.test(p) },
  { id: 'lower',     label: 'At least one lowercase letter (a-z)', test: p => /[a-z]/.test(p) },
  { id: 'special',   label: 'At least one special character (!@#…)', test: p => /[^a-zA-Z0-9]/.test(p) },
];

function PasswordStrengthPanel({ password, visible }) {
  if (!visible) return null;
  return (
    <div className="mt-2 p-3.5 bg-surface border border-borderMuted rounded-xl space-y-2 animate-slide-up shadow-md">
      {passwordCriteria.map(({ id, label, test }) => {
        const pass = test(password);
        return (
          <div key={id} className={`flex items-center gap-2 text-xs transition-colors duration-200 ${pass ? 'text-emerald-400' : password.length > 0 ? 'text-red-400' : 'text-textMuted'}`}>
            {pass
              ? <Check className="w-3.5 h-3.5 shrink-0" />
              : <X className="w-3.5 h-3.5 shrink-0" />
            }
            {label}
          </div>
        );
      })}
    </div>
  );
}

/* ── Animated Background Rings ─────────────────────────────────────────────── */
function AIRings() {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden -z-10">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="absolute rounded-full border border-indigo-500/10"
          style={{
            width: `${200 + i * 150}px`,
            height: `${200 + i * 150}px`,
            animation: `spin ${15 + i * 5}s linear infinite ${i % 2 === 0 ? 'reverse' : ''}`,
            opacity: 0.3 - i * 0.05,
          }}
        />
      ))}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/* ── Floating Particles ────────────────────────────────────────────────────── */
function FloatingParticles() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
      {Array.from({ length: 20 }).map((_, i) => (
        <div
          key={i}
          className="absolute w-1 h-1 rounded-full bg-indigo-400/30"
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            animation: `float ${5 + Math.random() * 5}s ease-in-out infinite`,
            animationDelay: `${Math.random() * 5}s`,
          }}
        />
      ))}
    </div>
  );
}

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', password: '' });
  const [focusedField, setFocusedField] = useState(null);
  const [showPasswordPanel, setShowPasswordPanel] = useState(false);

  const passwordAllValid = !isLogin && passwordCriteria.every(c => c.test(formData.password));
  
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleInputChange = (e) => {
    setFormData({...formData, [e.target.name]: e.target.value});
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Client-side password validation for signup
    if (!isLogin && !passwordAllValid) {
      setError('Please meet all password requirements shown below.');
      setLoading(false);
      setShowPasswordPanel(true);
      return;
    }
    
    const endpoint = isLogin ? '/authenticate' : '/register';
    
    try {
      const response = await fetch(`http://localhost:8000/api/v1/auth${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        // Parse FastAPI validation errors gracefully
        let msg = data.detail || data.message || 'Authentication failed';
        if (Array.isArray(msg)) msg = msg.map(e => e.msg || e.message || JSON.stringify(e)).join(', ');
        if (typeof msg === 'object') msg = msg.msg || msg.message || JSON.stringify(msg);
        throw new Error(msg);
      }
      
      login(data.token, data.user);
      if (!isLogin) sessionStorage.setItem('jarvis_new_user', '1');
      navigate('/chat');
    } catch (err) {
      setError(err.message || 'Error connecting to server. Is the backend running?');
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = (provider) => {
    if (provider === 'google') {
      // Redirect browser to backend — backend handles full OAuth redirect flow
      window.location.href = 'http://localhost:8000/api/v1/auth/google';
    }
  };

  const switchMode = () => {
    setIsLogin(!isLogin);
    setError('');
    setFormData({ name: '', email: '', password: '' });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden transition-colors duration-300">
      
      {/* Background Effects */}
      <AIRings />
      <FloatingParticles />
      <div className="orb orb-1 absolute top-[-10%] right-[-5%] w-[400px] h-[400px] bg-indigo-500/15" />
      <div className="orb orb-2 absolute bottom-[-10%] left-[-5%] w-[350px] h-[350px] bg-purple-600/10" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md -mt-10 relative z-10">
        {/* Back button */}
        <Link to="/" className="inline-flex items-center gap-1.5 text-textMuted hover:text-textMain transition-colors mb-8 text-sm group">
          <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" /> Back home
        </Link>

        {/* Logo */}
        <div className="flex justify-center mb-6">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-xl shadow-indigo-500/25">
              <Bot className="w-8 h-8 text-white" />
            </div>
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-400 rounded-full border-2 border-background animate-pulse" />
            {/* Glow ring */}
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 opacity-20 blur-xl -z-10 scale-150" />
          </div>
        </div>

        {/* Title */}
        <h2 className="text-center text-3xl font-extrabold text-textMain tracking-tight">
          {isLogin ? "Welcome back" : "Create your account"}
        </h2>
        <p className="mt-2 text-center text-sm text-textMuted">
          {isLogin ? "Sign in to access your JARVIS AI assistant" : "Join JARVIS — your intelligent audio companion"}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="glass-strong py-8 px-6 shadow-2xl sm:rounded-3xl sm:px-10 relative overflow-hidden">
          {/* Subtle gradient top border */}
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-50" />
          
          {/* Error display */}
          {error && (
            <div className="mb-5 p-3.5 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl text-sm text-center animate-scale-in">
              {error}
            </div>
          )}

          <form className="space-y-5" onSubmit={handleSubmit}>
            {/* Name (signup only) */}
            {!isLogin && (
              <div className="animate-slide-up">
                <label className="block text-sm font-medium text-textMain mb-1.5" htmlFor="name">Full Name</label>
                <div className={`relative rounded-xl transition-all duration-200 ${focusedField === 'name' ? 'glow-border' : ''}`}>
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <User className={`h-4.5 w-4.5 transition-colors ${focusedField === 'name' ? 'text-indigo-400' : 'text-textMuted'}`} />
                  </div>
                  <input
                    id="name" name="name" type="text" required={!isLogin}
                    value={formData.name} onChange={handleInputChange}
                    onFocus={() => setFocusedField('name')} onBlur={() => setFocusedField(null)}
                    className="appearance-none block w-full pl-10 px-4 py-3 border border-borderMuted rounded-xl bg-surfaceHover text-textMain placeholder-textMuted focus:outline-none focus:border-indigo-500/50 transition-all"
                    placeholder="John Doe"
                  />
                </div>
              </div>
            )}
            
            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-textMain mb-1.5" htmlFor="email">Email address</label>
              <div className={`relative rounded-xl transition-all duration-200 ${focusedField === 'email' ? 'glow-border' : ''}`}>
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Mail className={`h-4.5 w-4.5 transition-colors ${focusedField === 'email' ? 'text-indigo-400' : 'text-textMuted'}`} />
                </div>
                <input
                  id="email" name="email" type="email" required
                  value={formData.email} onChange={handleInputChange}
                  onFocus={() => setFocusedField('email')} onBlur={() => setFocusedField(null)}
                  className="appearance-none block w-full pl-10 px-4 py-3 border border-borderMuted rounded-xl bg-surfaceHover text-textMain placeholder-textMuted focus:outline-none focus:border-indigo-500/50 transition-all"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-textMain mb-1.5" htmlFor="password">Password</label>
              <div className={`relative rounded-xl transition-all duration-200 ${focusedField === 'password' ? 'glow-border' : ''}`}>
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Lock className={`h-4.5 w-4.5 transition-colors ${focusedField === 'password' ? 'text-indigo-400' : 'text-textMuted'}`} />
                </div>
                <input
                  id="password" name="password" type={showPassword ? 'text' : 'password'} required
                  value={formData.password} onChange={handleInputChange}
                  onFocus={() => { setFocusedField('password'); if (!isLogin) setShowPasswordPanel(true); }}
                  onBlur={() => setFocusedField(null)}
                  className="appearance-none block w-full pl-10 pr-11 py-3 border border-borderMuted rounded-xl bg-surfaceHover text-textMain placeholder-textMuted focus:outline-none focus:border-indigo-500/50 transition-all"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-textMuted hover:text-textMain transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {/* Real-time password strength panel (signup only) */}
              {!isLogin && (
                <PasswordStrengthPanel
                  password={formData.password}
                  visible={showPasswordPanel || focusedField === 'password'}
                />
              )}
            </div>

            {/* Submit */}
            <div>
              <button
                disabled={loading} type="submit"
                className="group w-full flex justify-center items-center py-3.5 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:hover:translate-y-0"
              >
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {isLogin ? "Sign in" : "Create Account"}
                {!loading && <ArrowLeft className="w-4 h-4 ml-2 rotate-180 transition-transform group-hover:translate-x-0.5" />}
              </button>
            </div>
          </form>

          {/* OAuth Divider */}
          <div className="mt-7">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-borderMuted"></div>
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-3 bg-surface text-textMuted rounded-full font-medium">or continue with</span>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button onClick={() => handleOAuth('google')} className="group w-full inline-flex justify-center items-center gap-2 py-2.5 px-4 border border-borderMuted rounded-xl bg-surfaceHover hover:bg-borderMuted text-sm font-medium text-textMain transition-all hover:-translate-y-0.5">
                <svg className="w-4.5 h-4.5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                <span>Google</span>
              </button>
              <button onClick={() => handleOAuth('apple')} className="group w-full inline-flex justify-center items-center gap-2 py-2.5 px-4 border border-borderMuted rounded-xl bg-surfaceHover hover:bg-borderMuted text-sm font-medium text-textMain transition-all hover:-translate-y-0.5">
                <Apple className="w-4.5 h-4.5 text-textMain" />
                <span>Apple</span>
              </button>
            </div>
          </div>
          
          {/* Toggle login/signup */}
          <div className="mt-6 text-center text-sm text-textMuted">
            <button onClick={switchMode} className="font-medium text-indigo-400 hover:text-indigo-300 transition-colors">
              {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
            </button>
          </div>
        </div>

        {/* Bottom text */}
        <p className="mt-6 text-center text-xs text-textMuted opacity-60">
          By signing in, you agree to JARVIS AI's Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
