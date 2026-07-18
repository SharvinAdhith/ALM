import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bot, Mail, Lock, Apple, ArrowLeft, Loader2, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({ name: '', email: '', password: '' });
  
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleInputChange = (e) => {
    setFormData({...formData, [e.target.name]: e.target.value});
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    const endpoint = isLogin ? '/authenticate' : '/register';
    
    try {
      const response = await fetch(`http://localhost:8000/api/v1/auth${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        // FastAPI returns errors in 'detail', not 'message'
        throw new Error(data.detail || data.message || 'Authentication failed');
      }
      
      login(data.token, data.user);
      // flag new registration so Chat.jsx can play welcome voice
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

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden transition-colors duration-300">
      <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-[100px] -z-10 animate-pulse"></div>
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-purple-600/10 rounded-full blur-[100px] -z-10 animate-pulse delay-700"></div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md -mt-10">
        <Link to="/" className="inline-flex items-center text-textMuted hover:text-textMain transition-colors mb-8">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back home
        </Link>
        <div className="flex justify-center mb-6">
          <div className="bg-primary/20 p-3 rounded-2xl ring-1 ring-primary/30 shadow-xl">
            <Bot className="w-10 h-10 text-primary" />
          </div>
        </div>
        <h2 className="text-center text-3xl font-extrabold text-textMain tracking-tight">
          {isLogin ? "Welcome back" : "Create your account"}
        </h2>
        <p className="mt-2 text-center text-sm text-textMuted">
          {isLogin ? "Enter your details to access JARVIS" : "Start your journey with JARVIS"}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="glass py-8 px-4 shadow-2xl sm:rounded-3xl sm:px-10">
          
          {error && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/50 text-red-500 rounded-xl text-sm text-center">{error}</div>}

          <form className="space-y-6" onSubmit={handleSubmit}>
            {!isLogin && (
              <div>
                <label className="block text-sm font-medium text-textMain" htmlFor="name">Full Name</label>
                <div className="mt-1 relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-textMuted" />
                  </div>
                  <input id="name" name="name" type="text" required={!isLogin} value={formData.name} onChange={handleInputChange} className="appearance-none block w-full pl-10 px-4 py-3 border border-borderMuted rounded-xl bg-surfaceHover text-textMain placeholder-textMuted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all" placeholder="John Doe" />
                </div>
              </div>
            )}
            
            <div>
              <label className="block text-sm font-medium text-textMain" htmlFor="email">Email address</label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-textMuted" />
                </div>
                <input id="email" name="email" type="email" required value={formData.email} onChange={handleInputChange} className="appearance-none block w-full pl-10 px-4 py-3 border border-borderMuted rounded-xl bg-surfaceHover text-textMain placeholder-textMuted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all" placeholder="you@example.com" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-textMain" htmlFor="password">Password</label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-textMuted" />
                </div>
                <input id="password" name="password" type="password" required value={formData.password} onChange={handleInputChange} className="appearance-none block w-full pl-10 px-4 py-3 border border-borderMuted rounded-xl bg-surfaceHover text-textMain placeholder-textMuted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all" placeholder="••••••••" />
              </div>
            </div>

            <div>
              <button disabled={loading} type="submit" className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-primary hover:bg-primaryDark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary focus:ring-offset-background transition-all hover:-translate-y-0.5 shadow-primary/20 hover:shadow-primary/40 disabled:opacity-50">
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {isLogin ? "Sign in" : "Sign up"}
              </button>
            </div>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-borderMuted"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-surface text-textMuted rounded-full">Or continue with</span>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button onClick={() => handleOAuth('google')} className="w-full inline-flex justify-center items-center gap-2 py-2.5 px-4 border border-borderMuted rounded-xl shadow-sm bg-surfaceHover hover:bg-borderMuted text-sm font-medium text-textMain transition-all">
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                <span>Google</span>
              </button>
              <button onClick={() => handleOAuth('apple')} className="w-full inline-flex justify-center items-center gap-2 py-2.5 px-4 border border-borderMuted rounded-xl shadow-sm bg-surfaceHover hover:bg-borderMuted text-sm font-medium text-textMain transition-all">
                <Apple className="w-5 h-5 text-textMain" />
                <span>Apple</span>
              </button>
            </div>
          </div>
          
          <div className="mt-6 text-center text-sm text-textMuted">
            <button onClick={() => setIsLogin(!isLogin)} className="font-medium text-primary hover:text-primaryDark transition-colors">
              {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
