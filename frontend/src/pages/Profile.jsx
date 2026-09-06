import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Check, ArrowLeft, Moon, Sun, Volume2, VolumeX } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function Profile() {
  const { user, login, token } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState(user?.name || 'Sharvin Adhith');
  const [username, setUsername] = useState(
    user?.username || (user?.email ? user.email.split('@')[0] : 'sharvinadhithvk')
  );
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar || null);
  const [ttsEnabled, setTtsEnabled] = useState(() => localStorage.getItem('jarvis_tts') !== '0');
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef(null);

  const initials = displayName
    ? displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : 'SA';

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setAvatarUrl(url);
    }
  };

  const handleSave = (e) => {
    e.preventDefault();
    // Update local storage / Auth state
    const updatedUser = {
      ...user,
      name: displayName,
      username: username,
      avatar: avatarUrl,
    };
    localStorage.setItem('jarvis_tts', ttsEnabled ? '1' : '0');
    if (login && token) {
      login(token, updatedUser);
    } else {
      localStorage.setItem('jarvis_user', JSON.stringify(updatedUser));
    }
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      navigate('/chat');
    }, 1200);
  };

  const handleCancel = () => {
    navigate('/chat');
  };

  const handleTtsToggle = () => {
    setTtsEnabled(prev => {
      const next = !prev;
      localStorage.setItem('jarvis_tts', next ? '1' : '0');
      if (!next && 'speechSynthesis' in window) window.speechSynthesis.cancel();
      return next;
    });
  };

  return (
    <div className="h-full overflow-y-auto bg-background flex items-center justify-center p-4 md:p-8 transition-colors duration-300">
      <div className="w-full max-w-lg bg-surface border border-borderMuted rounded-3xl p-6 sm:p-8 shadow-2xl animate-scale-in relative">
        {/* Back Button */}
        <button
          onClick={handleCancel}
          className="absolute top-6 left-6 p-2 rounded-xl text-textMuted hover:text-textMain hover:bg-surfaceHover transition-colors"
          title="Back to chat"
        >
          <ArrowLeft size={20} />
        </button>

        {/* Title */}
        <h1 className="text-2xl font-bold text-textMain text-center mb-6 pt-1">
          Edit profile
        </h1>

        <form onSubmit={handleSave} className="space-y-6">
          {/* Avatar Section */}
          <div className="flex flex-col items-center justify-center">
            <div className="relative group">
              <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-slate-500/40 border-2 border-borderMuted flex items-center justify-center font-semibold text-3xl sm:text-4xl text-white shadow-inner overflow-hidden">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <span>{initials}</span>
                )}
              </div>

              {/* Camera Overlay Icon */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 right-0 w-9 h-9 rounded-full bg-surface border border-borderMuted shadow-md flex items-center justify-center text-textMain hover:bg-surfaceHover hover:scale-105 transition-all"
                title="Upload avatar"
              >
                <Camera size={16} />
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="hidden"
              />
            </div>
          </div>

          {/* Input Fields */}
          <div className="space-y-4 pt-2">
            {/* Display Name Input */}
            <div className="bg-background border border-borderMuted rounded-2xl px-4 py-3 focus-within:border-indigo-500 transition-colors">
              <label className="block text-xs text-textMuted font-medium mb-1">
                Display name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Sharvin Adhith"
                className="w-full bg-transparent outline-none text-textMain text-base font-medium placeholder-textMuted/50"
                required
              />
            </div>

            {/* Username Input */}
            <div className="bg-background border border-borderMuted rounded-2xl px-4 py-3 focus-within:border-indigo-500 transition-colors">
              <label className="block text-xs text-textMuted font-medium mb-1">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="sharvinadhithvk"
                className="w-full bg-transparent outline-none text-textMain text-base font-medium placeholder-textMuted/50"
                required
              />
            </div>

            {/* Subtext */}
            <p className="text-xs text-textMuted text-center px-2 opacity-80 pt-1">
              Your profile helps people recognize you in group chats.
            </p>
          </div>

          {/* Quick Preferences */}
          <div className="pt-2 border-t border-borderMuted space-y-3">
            <div className="flex items-center justify-between py-1">
              <div className="flex items-center gap-2 text-sm text-textMain">
                {theme === 'dark' ? <Moon size={16} className="text-indigo-400" /> : <Sun size={16} className="text-amber-400" />}
                <span>Theme</span>
              </div>
              <button
                type="button"
                onClick={toggleTheme}
                className="px-3 py-1.5 rounded-xl border border-borderMuted text-xs text-textMain hover:bg-surfaceHover transition-colors font-medium"
              >
                {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
              </button>
            </div>

            <div className="flex items-center justify-between py-1">
              <div className="flex items-center gap-2 text-sm text-textMain">
                {ttsEnabled ? <Volume2 size={16} className="text-emerald-400" /> : <VolumeX size={16} className="text-textMuted" />}
                <span>Audio Response (TTS)</span>
              </div>
              <button
                type="button"
                onClick={handleTtsToggle}
                className={`w-11 h-6 rounded-full flex items-center px-1 transition-colors ${
                  ttsEnabled ? 'bg-indigo-500' : 'bg-borderMuted'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${
                    ttsEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={handleCancel}
              className="px-6 py-2.5 rounded-full border border-borderMuted text-textMain font-medium hover:bg-surfaceHover transition-colors text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-full bg-textMain text-background font-semibold hover:opacity-90 transition-opacity text-sm flex items-center gap-2 shadow-md"
            >
              {saved ? (
                <>
                  <Check size={16} /> Saved!
                </>
              ) : (
                'Save'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
