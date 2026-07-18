import { createContext, useState, useContext } from 'react';

const AuthContext = createContext();

/** Decode a JWT payload without verifying signature (client-side only). */
function decodeJwt(token) {
  try {
    const payload = token.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function buildUser(token) {
  if (!token) return null;
  const payload = decodeJwt(token);
  if (!payload) return null;
  // FastAPI token stores email in 'sub'; user name comes in via login response
  // We store the full user object in localStorage alongside the token
  const saved = localStorage.getItem('jarvis_user');
  if (saved) {
    try { return JSON.parse(saved); } catch { /* fall through */ }
  }
  return { email: payload.sub, name: payload.sub?.split('@')[0] || 'User' };
}

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(() => localStorage.getItem('jwt_token'));
  const [user, setUser] = useState(() => buildUser(localStorage.getItem('jwt_token')));

  /** Call with (token, userObject) from the API response */
  const login = (newToken, userData = null) => {
    localStorage.setItem('jwt_token', newToken);
    const resolvedUser = userData || buildUser(newToken);
    if (resolvedUser) localStorage.setItem('jarvis_user', JSON.stringify(resolvedUser));
    setToken(newToken);
    setUser(resolvedUser);
  };

  const logout = () => {
    localStorage.removeItem('jwt_token');
    localStorage.removeItem('jarvis_user');
    sessionStorage.removeItem('jarvis_session_id');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ token, user, isAuthenticated: !!token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
