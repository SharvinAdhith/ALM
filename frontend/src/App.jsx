import { BrowserRouter as Router, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import Landing from './pages/Landing';
import Auth from './pages/Auth';
import ChatLayout from './pages/ChatLayout';
import Chat from './pages/Chat';
import Settings from './pages/Settings';
import Pricing from './pages/Pricing';
import ProtectedRoute from './components/ProtectedRoute';
import { useAuth } from './context/AuthContext';

/**
 * OAuthCallback — sits inside the Router so it can read URL params.
 * When Google redirects back to /chat?token=...&user_name=...&user_email=...
 * this component stores the JWT and cleans the URL.
 */
function OAuthCallback() {
  const location = useLocation();
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const token = params.get('token');
    const userName = params.get('user_name');
    const userEmail = params.get('user_email');
    const isNew = params.get('new') === '1';
    const error = params.get('error');

    if (error) {
      console.error('OAuth error:', error);
      navigate('/auth');
      return;
    }

    if (token && location.pathname === '/chat') {
      login(token, {
        name: userName || userEmail?.split('@')[0] || 'User',
        email: userEmail || '',
      });
      if (isNew) sessionStorage.setItem('jarvis_new_user', '1');
      // Clean the URL — remove all OAuth params
      navigate('/chat', { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  return null;
}

function App() {
  return (
    <Router>
      {/* OAuthCallback listens on every page — only acts when ?token= is present on /chat */}
      <OAuthCallback />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/auth" element={<Auth />} />

        {/* Protected Routes */}
        <Route element={<ProtectedRoute />}>
          <Route path="/chat" element={<ChatLayout />}>
            <Route index element={<Chat />} />
            <Route path="settings" element={<Settings />} />
            <Route path="pricing" element={<Pricing />} />
          </Route>
          <Route path="/settings" element={<ChatLayout />}>
            <Route index element={<Settings />} />
          </Route>
        </Route>

        <Route path="/pricing" element={<Pricing />} />

      </Routes>
    </Router>
  );
}

export default App;
