import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User, Moon, Sun, Bell, Shield, Trash2, LogOut,
  ChevronRight, Bot, ArrowLeft, Volume2, VolumeX, Check
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function Settings() {
  const { user, token, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [ttsEnabled, setTtsEnabled] = useState(() => localStorage.getItem('jarvis_tts') !== '0');
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Apply TTS toggle immediately (don't wait for Save)
  const handleTtsToggle = () => {
    setTtsEnabled(prev => {
      const next = !prev;
      localStorage.setItem('jarvis_tts', next ? '1' : '0');
      if (!next && 'speechSynthesis' in window) window.speechSynthesis.cancel();
      return next;
    });
  };

  const firstName = user?.name?.split(' ')[0] || 'User';
  const initials = user?.name
    ? user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  const handleSave = () => {
    localStorage.setItem('jarvis_tts', ttsEnabled ? '1' : '0');
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleDeleteAccount = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    // TODO: call DELETE /api/v1/auth/me when implemented
    alert('Account deletion coming soon. Contact support to delete your account.');
    setConfirmDelete(false);
  };

  const Section = ({ title, children }) => (
    <div className="mb-8">
      <h2 className="text-xs font-semibold text-textMuted uppercase tracking-widest mb-3 px-1">{title}</h2>
      <div className="glass rounded-2xl overflow-hidden divide-y divide-borderMuted">
        {children}
      </div>
    </div>
  );

  const Row = ({ icon: Icon, label, description, right }) => (
    <div className="flex items-center px-5 py-4 gap-4 hover:bg-surfaceHover transition-colors">
      <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
        <Icon size={18} className="text-primary" />
      </div>
      <div className="flex-1">
        <div className="text-sm font-medium text-textMain">{label}</div>
        {description && <div className="text-xs text-textMuted mt-0.5">{description}</div>}
      </div>
      {right}
    </div>
  );

  const Toggle = ({ value, onToggle }) => (
    <button
      onClick={onToggle}
      className={`w-11 h-6 rounded-full flex items-center px-1 transition-colors ${value ? 'bg-primary' : 'bg-borderMuted'}`}
    >
      <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  );

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => navigate('/chat')}
            className="p-2 rounded-xl text-textMuted hover:text-textMain hover:bg-surfaceHover transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-bold text-textMain">Settings</h1>
        </div>

        {/* Profile card */}
        <div className="glass rounded-2xl p-6 mb-8 flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-primary to-purple-500 flex items-center justify-center font-bold text-2xl text-white shadow-lg">
            {initials}
          </div>
          <div>
            <div className="text-lg font-bold text-textMain">{user?.name || 'User'}</div>
            <div className="text-sm text-textMuted">{user?.email || ''}</div>
            <div className="mt-1 inline-flex items-center gap-1.5 text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full font-medium border border-primary/20">
              <Bot size={11} /> JARVIS Free Plan
            </div>
          </div>
        </div>

        {/* Appearance */}
        <Section title="Appearance">
          <Row
            icon={theme === 'dark' ? Moon : Sun}
            label="Theme"
            description={theme === 'dark' ? 'Dark mode is active' : 'Light mode is active'}
            right={<Toggle value={theme === 'dark'} onToggle={toggleTheme} />}
          />
        </Section>

        {/* Audio */}
        <Section title="Audio & Voice">
          <Row
            icon={ttsEnabled ? Volume2 : VolumeX}
            label="Text-to-Speech"
            description="JARVIS reads responses aloud in your browser"
            right={<Toggle value={ttsEnabled} onToggle={handleTtsToggle} />}
          />
        </Section>

        {/* Account */}
        <Section title="Account">
          <Row
            icon={User}
            label="Display Name"
            description={user?.name}
            right={<ChevronRight size={16} className="text-textMuted" />}
          />
          <Row
            icon={Shield}
            label="Email"
            description={user?.email}
            right={<ChevronRight size={16} className="text-textMuted" />}
          />
        </Section>

        {/* Save button */}
        <button
          onClick={handleSave}
          className="w-full py-3 rounded-xl bg-primary text-white font-semibold hover:bg-primaryDark transition-all flex items-center justify-center gap-2 mb-6"
        >
          {saved ? <><Check size={17} /> Saved!</> : 'Save Preferences'}
        </button>

        {/* Danger zone */}
        <Section title="Danger Zone">
          <button
            onClick={logout}
            className="flex items-center px-5 py-4 gap-4 hover:bg-surfaceHover transition-colors w-full text-left"
          >
            <div className="w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
              <LogOut size={18} className="text-red-400" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium text-red-400">Log Out</div>
              <div className="text-xs text-textMuted mt-0.5">Sign out of this device</div>
            </div>
          </button>

          <button
            onClick={handleDeleteAccount}
            className="flex items-center px-5 py-4 gap-4 hover:bg-red-500/5 transition-colors w-full text-left"
          >
            <div className="w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
              <Trash2 size={18} className="text-red-400" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium text-red-400">
                {confirmDelete ? '⚠️ Click again to confirm deletion' : 'Delete Account'}
              </div>
              <div className="text-xs text-textMuted mt-0.5">Permanently delete your account and all data</div>
            </div>
          </button>
        </Section>

        <p className="text-center text-xs text-textMuted mt-4">JARVIS v1.0 · Built with FastAPI + React</p>
      </div>
    </div>
  );
}
