import { useState, useEffect, useCallback } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Plus, MessageSquare, Settings, CreditCard, LogOut,
  PanelLeftClose, PanelLeft, Bot, Moon, Sun, Trash2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const API = 'http://localhost:8000';

export default function ChatLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [loadingSessions, setLoadingSessions] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();
  const { token, user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  // ── Dynamic avatar initials from user name ────────────────────────────────
  const initials = user?.name
    ? user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  // ── Load sessions from backend ─────────────────────────────────────────────
  const loadSessions = useCallback(async () => {
    if (!token) return;
    setLoadingSessions(true);
    try {
      const res = await fetch(`${API}/api/v1/jarvis/sessions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } catch { /* network error — stay silent */ }
    finally { setLoadingSessions(false); }
  }, [token]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  // Re-load sessions whenever Chat.jsx fires a custom refresh event
  useEffect(() => {
    const handler = () => loadSessions();
    window.addEventListener('jarvis:session-updated', handler);
    return () => window.removeEventListener('jarvis:session-updated', handler);
  }, [loadSessions]);

  // Track active session from sessionStorage
  useEffect(() => {
    const sid = sessionStorage.getItem('jarvis_session_id');
    if (sid) setActiveSessionId(Number(sid));
  }, [location]);

  // ── New Chat ──────────────────────────────────────────────────────────────
  const handleNewChat = () => {
    sessionStorage.removeItem('jarvis_session_id');
    setActiveSessionId(null);
    navigate('/chat?new=1');
  };

  // ── Delete a session ──────────────────────────────────────────────────────
  const handleDeleteSession = async (e, sessionId) => {
    e.stopPropagation();
    if (!window.confirm('Delete this chat?')) return;
    try {
      await fetch(`${API}/api/v1/jarvis/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setSessions(s => s.filter(x => x.id !== sessionId));
      if (activeSessionId === sessionId) handleNewChat();
    } catch { /* ignore */ }
  };

  // ── Load a previous session ───────────────────────────────────────────────
  const handleOpenSession = (sessionId) => {
    sessionStorage.setItem('jarvis_session_id', String(sessionId));
    setActiveSessionId(sessionId);
    // Use ?session=N so Chat.jsx's URL-based useEffect triggers a reload
    navigate(`/chat?session=${sessionId}`);
  };

  // ── Sidebar toggle (ChatGPT-style) ────────────────────────────────────────
  // On desktop: collapsed = icon-only rail (w-14). On mobile: overlay
  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768;

  return (
    <div className="h-screen w-full flex overflow-hidden bg-background text-textMain transition-colors duration-300">
      {/* Mobile overlay */}
      {!sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-20 md:hidden"
          onClick={() => setSidebarOpen(true)}
        />
      )}

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside
        className={`
          fixed md:relative z-30 h-full bg-surface border-r border-borderMuted
          flex flex-col transition-all duration-300 ease-in-out
          ${sidebarOpen ? 'w-64 translate-x-0' : 'w-0 overflow-hidden md:w-14 translate-x-0'}
        `}
      >
        {/* Header */}
        <div className={`p-3 flex items-center ${sidebarOpen ? 'justify-between' : 'justify-center'}`}>
          {sidebarOpen && (
            <Link to="/" className="flex items-center gap-2 font-bold text-lg text-textMain">
              <Bot className="w-5 h-5 text-primary" />
              <span>JARVIS</span>
            </Link>
          )}
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="text-textMuted hover:text-textMain p-1.5 hover:bg-surfaceHover rounded-lg transition-colors"
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
          </button>
        </div>

        {/* New Chat button */}
        <div className={`px-2 pb-2 ${!sidebarOpen && 'flex justify-center'}`}>
          <button
            onClick={handleNewChat}
            className={`
              flex items-center gap-2 bg-primary/10 hover:bg-primary/20 text-primary
              py-2.5 px-3 rounded-lg border border-primary/20 transition-all
              ${sidebarOpen ? 'w-full' : 'w-10 h-10 justify-center px-0'}
            `}
            title="New Chat"
          >
            <Plus size={18} className="shrink-0" />
            {sidebarOpen && <span className="font-medium text-sm">New Chat</span>}
          </button>
        </div>

        {/* Session history */}
        <div className="flex-1 overflow-y-auto py-2 space-y-0.5">
          {sidebarOpen && sessions.length > 0 && (
            <div className="text-xs font-semibold text-textMuted uppercase tracking-wider mb-1 px-4 mt-2">
              Recent
            </div>
          )}

          {sidebarOpen && loadingSessions && (
            <div className="px-4 py-2 text-xs text-textMuted animate-pulse">Loading chats…</div>
          )}

          {sidebarOpen && sessions.map(session => (
            <div
              key={session.id}
              className={`group flex items-center gap-2 mx-2 px-3 py-2 rounded-lg cursor-pointer transition-colors text-sm
                ${activeSessionId === session.id
                  ? 'bg-primary/15 text-textMain'
                  : 'text-textMuted hover:text-textMain hover:bg-surfaceHover'
                }
              `}
              onClick={() => handleOpenSession(session.id)}
            >
              <MessageSquare size={15} className="shrink-0 opacity-60" />
              <span className="flex-1 truncate">{session.title}</span>
              <button
                className="opacity-0 group-hover:opacity-100 text-textMuted hover:text-red-400 transition-all"
                onClick={(e) => handleDeleteSession(e, session.id)}
                title="Delete chat"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}

          {sidebarOpen && !loadingSessions && sessions.length === 0 && (
            <p className="px-4 py-3 text-xs text-textMuted italic">No chats yet. Start one!</p>
          )}

          {/* Icon-only: just show New Chat icon dots when collapsed */}
          {!sidebarOpen && sessions.slice(0, 8).map(session => (
            <div key={session.id} className="flex justify-center py-1">
              <button
                onClick={() => handleOpenSession(session.id)}
                className={`p-2 rounded-lg transition-colors ${
                  activeSessionId === session.id ? 'bg-primary/20 text-primary' : 'text-textMuted hover:text-textMain hover:bg-surfaceHover'
                }`}
                title={session.title}
              >
                <MessageSquare size={16} />
              </button>
            </div>
          ))}
        </div>

        {/* Bottom nav */}
        <div className={`p-2 border-t border-borderMuted space-y-0.5 ${!sidebarOpen && 'flex flex-col items-center'}`}>
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className={`flex items-center gap-3 w-full p-2.5 text-sm text-textMuted hover:text-textMain hover:bg-surfaceHover rounded-lg transition-colors
              ${!sidebarOpen && 'justify-center w-10 h-10 p-0'}
            `}
            title={theme === 'dark' ? 'Switch to Light' : 'Switch to Dark'}
          >
            {theme === 'dark' ? <Moon size={17} /> : <Sun size={17} />}
            {sidebarOpen && <span>{theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</span>}
          </button>

          {/* Pricing */}
          <Link
            to="/pricing"
            className={`flex items-center gap-3 w-full p-2.5 text-sm text-textMuted hover:text-textMain hover:bg-surfaceHover rounded-lg transition-colors
              ${!sidebarOpen && 'justify-center w-10 h-10 p-0'}
            `}
            title="Upgrade Plan"
          >
            <CreditCard size={17} />
            {sidebarOpen && <span>Upgrade Plan</span>}
          </Link>

          {/* Settings */}
          <Link
            to="/settings"
            className={`flex items-center gap-3 w-full p-2.5 text-sm text-textMuted hover:text-textMain hover:bg-surfaceHover rounded-lg transition-colors
              ${!sidebarOpen && 'justify-center w-10 h-10 p-0'}
            `}
            title="Settings"
          >
            <Settings size={17} />
            {sidebarOpen && <span>Settings</span>}
          </Link>

          {/* Logout */}
          <button
            onClick={logout}
            className={`flex items-center gap-3 w-full p-2.5 text-sm text-textMuted hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors
              ${!sidebarOpen && 'justify-center w-10 h-10 p-0'}
            `}
            title="Log out"
          >
            <LogOut size={17} />
            {sidebarOpen && <span>Log out</span>}
          </button>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 transition-all">
        <header className="h-14 border-b border-borderMuted flex items-center px-4 justify-between bg-surface/50 backdrop-blur-md z-10 sticky top-0 transition-colors duration-300">
          <div className="flex items-center gap-3">
            {/* Mobile hamburger (sidebar is hidden on mobile when closed) */}
            <button
              onClick={() => setSidebarOpen(o => !o)}
              className="md:hidden text-textMuted hover:text-textMain p-2 hover:bg-surfaceHover rounded-lg"
            >
              <PanelLeft size={20} />
            </button>
            <span className="font-semibold text-sm hidden sm:block">JARVIS</span>
          </div>

          <div className="flex items-center gap-3">
            {/* Dynamic avatar */}
            <div
              className="w-8 h-8 rounded-full bg-gradient-to-tr from-primary to-purple-500 flex items-center justify-center font-bold text-xs shadow-md text-white cursor-pointer select-none"
              title={user?.name || 'User'}
            >
              {initials}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-hidden relative">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
