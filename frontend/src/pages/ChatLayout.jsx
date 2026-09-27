import { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Plus, MessageSquare, Settings, LogOut,
  PanelLeftClose, PanelLeft, Bot, Moon, Sun, BarChart3, Sparkles,
  Share2, MoreHorizontal, Pencil, Pin, PinOff, Archive, Trash2,
  Check, ChevronRight, ChevronDown, Copy, X, Crown, User, HelpCircle,
  Palette, ArchiveRestore
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import AnalyticsDashboard from '../components/AnalyticsDashboard';

const API = 'http://localhost:8000';

/* ── Toast ───────────────────────────────────────────────────────────────────── */
function Toast({ message, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 2800);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] animate-slide-up">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-surface border border-borderMuted rounded-xl shadow-2xl text-sm text-textMain backdrop-blur-xl">
        <Check className="w-4 h-4 text-emerald-400 shrink-0" />
        {message}
        <button onClick={onClose} className="text-textMuted hover:text-textMain ml-1">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

/* ── Chat Context Menu (Portal — floats over everything) ────────────────────── */
function ChatContextMenu({ session, onRename, onPin, onArchive, onDelete, onShare, onClose, anchorRect }) {
  const menuRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    };
    const tid = setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => { clearTimeout(tid); document.removeEventListener('mousedown', handler); };
  }, [onClose]);

  useEffect(() => {
    const handler = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const menuWidth = 196;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = (anchorRect?.right ?? 0) + 8;
  if (left + menuWidth > vw - 8) left = (anchorRect?.left ?? menuWidth + 8) - menuWidth - 8;
  const menuHeight = 210;
  let top = anchorRect?.top ?? 0;
  if (top + menuHeight > vh - 8) top = Math.max(8, vh - menuHeight - 8);

  const items = [
    { icon: Share2, label: 'Share', action: onShare, color: '' },
    { icon: Pencil, label: 'Rename', action: onRename, color: '' },
    {
      icon: session.pinned ? PinOff : Pin,
      label: session.pinned ? 'Unpin chat' : 'Pin chat',
      action: onPin, color: ''
    },
    { icon: Archive, label: 'Archive', action: onArchive, color: '' },
    { icon: Trash2, label: 'Delete', action: onDelete, color: 'text-red-400 hover:bg-red-500/10' },
  ];

  return ReactDOM.createPortal(
    <>
      <div className="fixed inset-0" style={{ zIndex: 9998 }} onClick={onClose} />
      <div
        ref={menuRef}
        style={{ position: 'fixed', top, left, zIndex: 9999, minWidth: menuWidth }}
        className="bg-surface border border-borderMuted rounded-xl shadow-2xl py-1 animate-scale-in overflow-hidden"
      >
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent" />
        {items.map(({ icon: Icon, label, action, color }) => (
          <button
            key={label}
            onClick={(e) => { e.stopPropagation(); action(); }}
            className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-textMain hover:bg-surfaceHover transition-colors ${color}`}
          >
            <Icon className="w-4 h-4 shrink-0 opacity-70" />
            {label}
          </button>
        ))}
      </div>
    </>,
    document.body
  );
}

/* ── Inline Rename Input ─────────────────────────────────────────────────────── */
function RenameInput({ initialValue, onConfirm, onCancel }) {
  const [val, setVal] = useState(initialValue);
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  return (
    <input
      ref={ref}
      value={val}
      onChange={e => setVal(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') onConfirm(val); if (e.key === 'Escape') onCancel(); }}
      onBlur={() => onConfirm(val)}
      onClick={e => e.stopPropavgation()}
      className="flex-1 bg-transparent border border-indigo-500/40 rounded px-1.5 py-0.5 text-sm text-textMain outline-none focus:border-indigo-500 min-w-0"
    />
  );
}

/* ── User Menu Popup (Portal) ────────────────────────────────────────────────── */
function UserMenuPopup({ user, initials, theme, onToggleTheme, onLogout, onArchive, onClose, anchorRect }) {
  const menuRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    };
    const tid = setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => { clearTimeout(tid); document.removeEventListener('mousedown', handler); };
  }, [onClose]);

  useEffect(() => {
    const handler = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const menuWidth = 230;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // Position above the anchor (it's at the bottom of the sidebar)
  const menuHeight = 320;
  let left = anchorRect?.left ?? 0;
  if (left + menuWidth > vw - 8) left = vw - menuWidth - 8;
  let bottom = vh - (anchorRect?.top ?? vh);
  // Actually position it above the profile row
  let top = (anchorRect?.top ?? menuHeight) - menuHeight - 8;
  if (top < 8) top = (anchorRect?.bottom ?? 0) + 8;

  return ReactDOM.createPortal(
    <>
      <div className="fixed inset-0" style={{ zIndex: 9998 }} onClick={onClose} />
      <div
        ref={menuRef}
        style={{ position: 'fixed', top, left, zIndex: 9999, width: menuWidth }}
        className="bg-surface border border-borderMuted rounded-2xl shadow-2xl py-1.5 animate-scale-in overflow-hidden"
      >
        {/* Top gradient accent */}
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent" />

        {/* User header row */}
        <button
          onClick={() => { navigate('/chat/profile'); onClose(); }}
          className="w-full flex items-center gap-3 px-3.5 py-3 hover:bg-surfaceHover transition-colors group border-b border-borderMuted mb-1"
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-xs text-white shadow-lg shadow-indigo-500/20 shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-sm font-semibold text-textMain truncate">{user?.name || 'User'}</p>
            <p className="text-xs text-textMuted truncate">{user?.email || 'Free Plan'}</p>
          </div>
          <ChevronRight className="w-4 h-4 text-textMuted group-hover:text-textMain transition-colors shrink-0" />
        </button>

        {/* Menu items */}
        <div className="px-1.5 space-y-0.5">
          <button
            onClick={() => { navigate('/pricing'); onClose(); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-textMain hover:bg-surfaceHover rounded-xl transition-colors"
          >
            <Crown className="w-4 h-4 text-amber-400 shrink-0" />
            Upgrade plan
          </button>

          <button
            onClick={() => { navigate('/chat/profile'); onClose(); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-textMain hover:bg-surfaceHover rounded-xl transition-colors"
          >
            <User className="w-4 h-4 opacity-70 shrink-0" />
            Profile
          </button>

          <button
            onClick={() => { navigate('/chat/profile'); onClose(); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-textMain hover:bg-surfaceHover rounded-xl transition-colors"
          >
            <Settings className="w-4 h-4 opacity-70 shrink-0" />
            Settings
          </button>

          {/* Archive Chats */}
          <button
            onClick={() => { onArchive(); onClose(); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-textMain hover:bg-surfaceHover rounded-xl transition-colors"
          >
            <ArchiveRestore className="w-4 h-4 opacity-70 shrink-0" />
            Archived chats
          </button>

          <button
            onClick={() => { onToggleTheme(); onClose(); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-textMain hover:bg-surfaceHover rounded-xl transition-colors"
          >
            {theme === 'dark'
              ? <Moon className="w-4 h-4 opacity-70 shrink-0" />
              : <Sun className="w-4 h-4 opacity-70 shrink-0" />}
            {theme === 'dark' ? 'Dark mode' : 'Light mode'}
          </button>

          <div className="h-px bg-borderMuted mx-1 my-1" />

          <button
            onClick={() => { onLogout(); onClose(); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/10 rounded-xl transition-colors"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            Log out
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}

/* ── Archive Modal ────────────────────────────────────────────────────────────── */
function ArchiveModal({ sessions, archivedIds, onClose, onDelete, onUnarchive }) {
  const archivedSessions = sessions.filter(s => archivedIds.has(s.id));

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[9990] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md bg-surface border border-borderMuted rounded-2xl shadow-2xl animate-scale-in overflow-hidden">
        {/* Gradient accent */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-60" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-borderMuted">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/20 flex items-center justify-center">
              <Archive className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-textMain">Archived Chats</h2>
              <p className="text-xs text-textMuted">{archivedSessions.length} chat{archivedSessions.length !== 1 ? 's' : ''} archived</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-textMuted hover:text-textMain hover:bg-surfaceHover rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* List */}
        <div className="max-h-[380px] overflow-y-auto">
          {archivedSessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
              <div className="w-12 h-12 rounded-2xl bg-surface border border-borderMuted flex items-center justify-center mb-3">
                <Archive className="w-6 h-6 text-textMuted opacity-40" />
              </div>
              <p className="text-sm font-medium text-textMuted">No archived chats</p>
              <p className="text-xs text-textMuted opacity-60 mt-1">Archived chats will appear here</p>
            </div>
          ) : (
            <div className="p-2 space-y-0.5">
              {archivedSessions.map(session => (
                <div
                  key={session.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surfaceHover transition-colors group"
                >
                  <MessageSquare className="w-4 h-4 text-textMuted shrink-0 opacity-60" />
                  <span className="flex-1 text-sm text-textMain truncate">{session.title}</span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {/* Unarchive */}
                    <button
                      onClick={() => onUnarchive(session.id)}
                      title="Unarchive"
                      className="p-1.5 text-textMuted hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-colors"
                    >
                      <ArchiveRestore className="w-3.5 h-3.5" />
                    </button>
                    {/* Delete */}
                    <button
                      onClick={() => onDelete(session.id)}
                      title="Delete permanently"
                      className="p-1.5 text-textMuted hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {archivedSessions.length > 0 && (
          <div className="px-5 py-3 border-t border-borderMuted">
            <p className="text-xs text-textMuted text-center opacity-60">
              Hover over a chat to unarchive or delete it permanently
            </p>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

export default function ChatLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [toast, setToast] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [userMenuAnchorRect, setUserMenuAnchorRect] = useState(null);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [pinnedIds, setPinnedIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('jarvis_pinned') || '[]')); }
    catch { return new Set(); }
  });
  const [archivedIds, setArchivedIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('jarvis_archived') || '[]')); }
    catch { return new Set(); }
  });
  const [pinnedOpen, setPinnedOpen] = useState(true);
  const [recentsOpen, setRecentsOpen] = useState(true);
  const menuBtnRefs = useRef({});
  const profileBtnRef = useRef(null);

  const location = useLocation();
  const navigate = useNavigate();
  const { token, user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const initials = user?.name
    ? user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  const showToast = useCallback((msg) => setToast(msg), []);

  // ── Persist pinnedIds & archivedIds ────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem('jarvis_pinned', JSON.stringify([...pinnedIds]));
  }, [pinnedIds]);
  useEffect(() => {
    localStorage.setItem('jarvis_archived', JSON.stringify([...archivedIds]));
  }, [archivedIds]);

  // ── Load sessions ──────────────────────────────────────────────────────────
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
    } catch { /* silent */ }
    finally { setLoadingSessions(false); }
  }, [token]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  useEffect(() => {
    const handler = () => loadSessions();
    window.addEventListener('jarvis:session-updated', handler);
    return () => window.removeEventListener('jarvis:session-updated', handler);
  }, [loadSessions]);

  useEffect(() => {
    const sid = sessionStorage.getItem('jarvis_session_id');
    if (sid) setActiveSessionId(Number(sid));
  }, [location]);

  useEffect(() => {
    if (openMenuId !== null) {
      const close = () => setOpenMenuId(null);
      window.addEventListener('keydown', (e) => e.key === 'Escape' && close());
    }
  }, [openMenuId]);

  // ── New Chat ───────────────────────────────────────────────────────────────
  const handleNewChat = () => {
    sessionStorage.removeItem('jarvis_session_id');
    setActiveSessionId(null);
    setShowAnalytics(false);
    navigate('/chat?new=1');
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDeleteSession = async (sessionId) => {
    if (!window.confirm('Delete this chat?')) return;
    try {
      await fetch(`${API}/api/v1/jarvis/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setSessions(s => s.filter(x => x.id !== sessionId));
      setPinnedIds(prev => { const n = new Set(prev); n.delete(sessionId); return n; });
      setArchivedIds(prev => { const n = new Set(prev); n.delete(sessionId); return n; });
      if (activeSessionId === sessionId) handleNewChat();
    } catch { /* ignore */ }
  };

  // ── Delete from archive ────────────────────────────────────────────────────
  const handleDeleteFromArchive = async (sessionId) => {
    if (!window.confirm('Permanently delete this archived chat?')) return;
    try {
      await fetch(`${API}/api/v1/jarvis/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setSessions(s => s.filter(x => x.id !== sessionId));
      setArchivedIds(prev => { const n = new Set(prev); n.delete(sessionId); return n; });
    } catch { /* ignore */ }
  };

  // ── Unarchive ──────────────────────────────────────────────────────────────
  const handleUnarchive = (sessionId) => {
    setArchivedIds(prev => { const n = new Set(prev); n.delete(sessionId); return n; });
    showToast('Chat restored');
  };

  // ── Open session ───────────────────────────────────────────────────────────
  const handleOpenSession = (sessionId) => {
    sessionStorage.setItem('jarvis_session_id', String(sessionId));
    setActiveSessionId(sessionId);
    setShowAnalytics(false);
    navigate(`/chat?session=${sessionId}`);
  };

  // ── Pin ────────────────────────────────────────────────────────────────────
  const handlePin = (sessionId) => {
    setPinnedIds(prev => {
      const n = new Set(prev);
      if (n.has(sessionId)) n.delete(sessionId); else n.add(sessionId);
      return n;
    });
    showToast(pinnedIds.has(sessionId) ? 'Chat unpinned' : 'Chat pinned');
  };

  // ── Archive ────────────────────────────────────────────────────────────────
  const handleArchive = (sessionId) => {
    setArchivedIds(prev => { const n = new Set(prev); n.add(sessionId); return n; });
    if (activeSessionId === sessionId) handleNewChat();
    showToast('Chat archived');
  };

  // ── Share ──────────────────────────────────────────────────────────────────
  const handleShare = async (sessionId) => {
    const url = sessionId
      ? `${window.location.origin}/chat?session=${sessionId}`
      : window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Chat link copied to clipboard!');
    } catch {
      showToast('Could not copy link');
    }
  };

  // ── Rename ─────────────────────────────────────────────────────────────────
  const handleRename = (sessionId, newTitle) => {
    if (!newTitle?.trim()) { setRenamingId(null); return; }
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, title: newTitle.trim() } : s));
    setRenamingId(null);
  };

  // ── Categorise sessions ────────────────────────────────────────────────────
  const visibleSessions = sessions.filter(s => !archivedIds.has(s.id));
  const pinnedSessions = visibleSessions.filter(s => pinnedIds.has(s.id));
  const recentSessions = visibleSessions.filter(s => !pinnedIds.has(s.id));

  // ── Header share ───────────────────────────────────────────────────────────
  const handleHeaderShare = () => handleShare(activeSessionId);

  // ── User menu toggle ───────────────────────────────────────────────────────
  const handleProfileClick = () => {
    if (showUserMenu) {
      setShowUserMenu(false);
      setUserMenuAnchorRect(null);
    } else {
      const rect = profileBtnRef.current?.getBoundingClientRect();
      setUserMenuAnchorRect(rect || null);
      setShowUserMenu(true);
    }
  };

  return (
    <div className="h-screen w-full flex overflow-hidden bg-background text-textMain transition-colors duration-300">
      {/* Toast */}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}

      {/* Archive Modal */}
      {showArchiveModal && (
        <ArchiveModal
          sessions={sessions}
          archivedIds={archivedIds}
          onClose={() => setShowArchiveModal(false)}
          onDelete={handleDeleteFromArchive}
          onUnarchive={handleUnarchive}
        />
      )}

      {/* User Menu Popup */}
      {showUserMenu && userMenuAnchorRect && (
        <UserMenuPopup
          user={user}
          initials={initials}
          theme={theme}
          onToggleTheme={toggleTheme}
          onLogout={logout}
          onArchive={() => setShowArchiveModal(true)}
          onClose={() => { setShowUserMenu(false); setUserMenuAnchorRect(null); }}
          anchorRect={userMenuAnchorRect}
        />
      )}

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
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
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md shadow-indigo-500/20">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <span className="tracking-wide">MINIALM</span>
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

        {/* New Chat */}
        <div className={`px-2 pb-2 ${!sidebarOpen && 'flex justify-center'}`}>
          <button
            onClick={handleNewChat}
            className={`
              flex items-center gap-2 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 hover:from-indigo-500/20 hover:to-purple-500/20 text-indigo-400
              py-2.5 px-3 rounded-xl border border-indigo-500/20 transition-all
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
          {sidebarOpen && (
            <>
              {/* Pinned */}
              {pinnedSessions.length > 0 && (
                <div className="mb-1">
                  <button
                    onClick={() => setPinnedOpen(o => !o)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-textMuted uppercase tracking-wider mb-1 px-4 mt-2 hover:text-textMain transition-colors w-full"
                  >
                    {pinnedOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    <Pin size={11} className="text-indigo-400" />
                    Pinned
                  </button>
                  {pinnedOpen && pinnedSessions.map(session => (
                    <SessionItem
                      key={session.id}
                      session={{ ...session, pinned: pinnedIds.has(session.id) }}
                      isActive={activeSessionId === session.id}
                      isRenaming={renamingId === session.id}
                      openMenuId={openMenuId}
                      menuBtnRefs={menuBtnRefs}
                      onOpen={handleOpenSession}
                      onMenuToggle={(id) => setOpenMenuId(prev => prev === id ? null : id)}
                      onMenuClose={() => setOpenMenuId(null)}
                      onRename={() => setRenamingId(session.id)}
                      onRenameConfirm={(title) => handleRename(session.id, title)}
                      onPin={() => handlePin(session.id)}
                      onArchive={() => handleArchive(session.id)}
                      onDelete={() => handleDeleteSession(session.id)}
                      onShare={() => handleShare(session.id)}
                    />
                  ))}
                </div>
              )}

              {/* Recents */}
              {recentSessions.length > 0 && (
                <div>
                  <button
                    onClick={() => setRecentsOpen(o => !o)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-textMuted uppercase tracking-wider mb-1 px-4 mt-2 hover:text-textMain transition-colors w-full"
                  >
                    {recentsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    Recents
                  </button>
                  {recentsOpen && recentSessions.map(session => (
                    <SessionItem
                      key={session.id}
                      session={{ ...session, pinned: pinnedIds.has(session.id) }}
                      isActive={activeSessionId === session.id}
                      isRenaming={renamingId === session.id}
                      openMenuId={openMenuId}
                      menuBtnRefs={menuBtnRefs}
                      onOpen={handleOpenSession}
                      onMenuToggle={(id) => setOpenMenuId(prev => prev === id ? null : id)}
                      onMenuClose={() => setOpenMenuId(null)}
                      onRename={() => setRenamingId(session.id)}
                      onRenameConfirm={(title) => handleRename(session.id, title)}
                      onPin={() => handlePin(session.id)}
                      onArchive={() => handleArchive(session.id)}
                      onDelete={() => handleDeleteSession(session.id)}
                      onShare={() => handleShare(session.id)}
                    />
                  ))}
                </div>
              )}

              {loadingSessions && (
                <div className="px-4 py-2 text-xs text-textMuted animate-pulse">Loading chats…</div>
              )}
              {!loadingSessions && visibleSessions.length === 0 && (
                <p className="px-4 py-3 text-xs text-textMuted italic">No chats yet. Start one!</p>
              )}
            </>
          )}

          {/* Icon-only collapsed mode */}
          {!sidebarOpen && sessions.slice(0, 8).map(session => (
            <div key={session.id} className="flex justify-center py-1">
              <button
                onClick={() => handleOpenSession(session.id)}
                className={`p-2 rounded-lg transition-colors ${activeSessionId === session.id ? 'bg-indigo-500/20 text-indigo-400' : 'text-textMuted hover:text-textMain hover:bg-surfaceHover'
                  }`}
                title={session.title}
              >
                <MessageSquare size={16} />
              </button>
            </div>
          ))}
        </div>

        {/* ── Bottom section ─────────────────────────────────────────────────── */}
        <div className={`border-t border-borderMuted ${!sidebarOpen && 'flex flex-col items-center'}`}>

          {/* Nav buttons (Analytics, Upgrade, Theme, Logout) */}
          {sidebarOpen && (
            <div className="px-2 pt-2 pb-1 space-y-0.5">
              <button
                onClick={() => setShowAnalytics(!showAnalytics)}
                className={`flex items-center gap-3 w-full p-2.5 text-sm rounded-lg transition-colors
                  ${showAnalytics ? 'text-indigo-400 bg-indigo-500/10' : 'text-textMuted hover:text-textMain hover:bg-surfaceHover'}
                `}
                title="Analytics"
              >
                <BarChart3 size={17} />
                <span>Analytics</span>
              </button>
            </div>
          )}

          {/* Collapsed mode nav */}
          {!sidebarOpen && (
            <div className="flex flex-col items-center p-2 space-y-0.5">
              <button
                onClick={() => setShowAnalytics(!showAnalytics)}
                className={`flex justify-center w-10 h-10 items-center text-sm rounded-lg transition-colors
                  ${showAnalytics ? 'text-indigo-400 bg-indigo-500/10' : 'text-textMuted hover:text-textMain hover:bg-surfaceHover'}
                `}
                title="Analytics"
              >
                <BarChart3 size={17} />
              </button>
              <button
                onClick={toggleTheme}
                className="flex justify-center w-10 h-10 items-center text-textMuted hover:text-textMain hover:bg-surfaceHover rounded-lg transition-colors"
                title={theme === 'dark' ? 'Switch to Light' : 'Switch to Dark'}
              >
                {theme === 'dark' ? <Moon size={17} /> : <Sun size={17} />}
              </button>
              <button
                onClick={logout}
                className="flex justify-center w-10 h-10 items-center text-textMuted hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                title="Log out"
              >
                <LogOut size={17} />
              </button>
            </div>
          )}

          {/* ── Profile Row (clickable → user menu popup) ─── */}
          <button
            ref={profileBtnRef}
            onClick={handleProfileClick}
            className={`
              w-full flex items-center border-t border-borderMuted transition-colors
              ${sidebarOpen
                ? 'gap-3 px-3 py-3 hover:bg-surfaceHover'
                : 'justify-center p-2.5 hover:bg-surfaceHover'
              }
              ${showUserMenu ? 'bg-surfaceHover' : ''}
            `}
            title={user?.name || 'User'}
          >
            {/* Avatar */}
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-xs text-white shadow-lg shadow-indigo-500/20 shrink-0">
              {initials}
            </div>
            {sidebarOpen && (
              <>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-semibold text-textMain truncate leading-tight">{user?.name || 'User'}</p>
                  <p className="text-[11px] text-textMuted truncate leading-tight">Free</p>
                </div>
                {/* "Go" icon like image 2 */}
                <div className="w-6 h-6 rounded-md bg-surfaceHover border border-borderMuted flex items-center justify-center shrink-0">
                  <MoreHorizontal size={12} className="text-textMuted" />
                </div>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 transition-all">
        <header className="h-14 border-b border-borderMuted flex items-center px-4 justify-between bg-surface/80 backdrop-blur-xl z-10 sticky top-0 transition-colors duration-300">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(o => !o)}
              className="md:hidden text-textMuted hover:text-textMain p-2 hover:bg-surfaceHover rounded-lg"
            >
              <PanelLeft size={20} />
            </button>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm hidden sm:block tracking-wide">MINIALM</span>
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 text-[10px] font-semibold uppercase tracking-wider border border-indigo-500/20">
                <Sparkles className="w-2.5 h-2.5" /> ALM 2.0
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleHeaderShare}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-textMuted hover:text-textMain border border-borderMuted hover:border-indigo-500/40 hover:bg-surfaceHover rounded-lg transition-all group"
              title="Share current chat"
            >
              <Share2 size={15} className="group-hover:text-indigo-400 transition-colors" />
              <span className="hidden sm:inline font-medium">Share</span>
            </button>
            <button
              className="p-1.5 text-textMuted hover:text-textMain hover:bg-surfaceHover rounded-lg transition-all"
              title="More options"
            >
              <MoreHorizontal size={18} />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-hidden relative flex">
          <div className={`flex-1 overflow-hidden ${showAnalytics ? 'hidden md:block' : ''}`}>
            <Outlet />
          </div>
          {showAnalytics && (
            <div className="w-full md:w-96 border-l border-borderMuted bg-background flex-shrink-0 animate-slide-up md:animate-fade-in overflow-hidden">
              <AnalyticsDashboard onClose={() => setShowAnalytics(false)} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

/* ── SessionItem ── */
function SessionItem({
  session, isActive, isRenaming,
  openMenuId, menuBtnRefs,
  onOpen, onMenuToggle, onMenuClose,
  onRename, onRenameConfirm, onPin, onArchive, onDelete, onShare
}) {
  const [anchorRect, setAnchorRect] = useState(null);

  const handleMenuClick = (e) => {
    e.stopPropagation();
    if (openMenuId === session.id) {
      onMenuClose();
      setAnchorRect(null);
    } else {
      const rect = menuBtnRefs.current[session.id]?.getBoundingClientRect();
      setAnchorRect(rect || null);
      onMenuToggle(session.id);
    }
  };

  return (
    <div
      className={`group relative flex items-center gap-2 mx-2 px-3 py-2 rounded-lg cursor-pointer transition-colors text-sm
        ${isActive
          ? 'bg-indigo-500/10 text-textMain border border-indigo-500/10'
          : 'text-textMuted hover:text-textMain hover:bg-surfaceHover'
        }
      `}
      onClick={() => !isRenaming && onOpen(session.id)}
    >
      <MessageSquare size={15} className="shrink-0 opacity-60" />

      {isRenaming ? (
        <RenameInput
          initialValue={session.title}
          onConfirm={onRenameConfirm}
          onCancel={() => onRenameConfirm(session.title)}
        />
      ) : (
        <span className="flex-1 truncate">{session.title}</span>
      )}

      {session.pinned && !isRenaming && (
        <Pin size={11} className="text-indigo-400 shrink-0 opacity-60" />
      )}

      {!isRenaming && (
        <button
          ref={el => menuBtnRefs.current[session.id] = el}
          className="opacity-0 group-hover:opacity-100 text-textMuted hover:text-textMain transition-all p-0.5 rounded"
          onClick={handleMenuClick}
          title="More options"
        >
          <MoreHorizontal size={15} />
        </button>
      )}

      {openMenuId === session.id && anchorRect && (
        <ChatContextMenu
          session={session}
          anchorRect={anchorRect}
          onRename={() => { onRename(); onMenuClose(); }}
          onPin={() => { onPin(); onMenuClose(); }}
          onArchive={() => { onArchive(); onMenuClose(); }}
          onDelete={() => { onDelete(); onMenuClose(); }}
          onShare={() => { onShare(); onMenuClose(); }}
          onClose={onMenuClose}
        />
      )}
    </div>
  );
}
