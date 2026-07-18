import { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Send, Mic, Square, Loader2, Bot, Volume2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const API = 'http://localhost:8000';
const SILENCE_THRESHOLD = 15;   // RMS amplitude 0-255
const SILENCE_MS = 2800;        // 2.8 s of silence → auto-stop

/* Read TTS preference from localStorage (updated by Settings page) */
const isTtsEnabled = () => localStorage.getItem('jarvis_tts') !== '0';

export default function Chat() {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [silenceCountdown, setSilenceCountdown] = useState(null);

  const mediaRecorderRef  = useRef(null);
  const audioChunksRef    = useRef([]);
  const animFrameRef      = useRef(null);
  const messagesEndRef    = useRef(null);
  const currentSessionRef = useRef(null); // avoids stale closure in handlers

  const { token, user } = useAuth();
  const location         = useLocation();
  const navigate         = useNavigate();

  // ── Scroll ────────────────────────────────────────────────────────────────
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isTyping]);

  // ── TTS ───────────────────────────────────────────────────────────────────
  const synthesizeSpeech = useCallback((text) => {
    if (!('speechSynthesis' in window)) return;
    if (!isTtsEnabled()) return;           // ← respects Settings toggle
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05; u.pitch = 0.95;
    window.speechSynthesis.speak(u);
  }, []);

  // ── Session persistence helpers ───────────────────────────────────────────
  const persistSession = useCallback((sid) => {
    setSessionId(sid);
    currentSessionRef.current = sid;
    sessionStorage.setItem('jarvis_session_id', String(sid));
    window.dispatchEvent(new Event('jarvis:session-updated'));
  }, []);

  // ── Welcome message ───────────────────────────────────────────────────────
  const fetchWelcome = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API}/api/v1/jarvis/welcome`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMessages([{ id: Date.now(), role: 'jarvis', content: data.message }]);
      const isNewUser = sessionStorage.getItem('jarvis_new_user') === '1';
      if (data.is_new || isNewUser) {
        setTimeout(() => synthesizeSpeech(data.message), 600);
        sessionStorage.removeItem('jarvis_new_user');
      }
    } catch {
      setMessages([{ id: 1, role: 'jarvis', content: 'Hello! How can I help you today?' }]);
    }
  }, [token, synthesizeSpeech]);

  // ── Load existing session messages ────────────────────────────────────────
  const loadSessionMessages = useCallback(async (sid) => {
    if (!token || !sid) return;
    try {
      const res = await fetch(`${API}/api/v1/jarvis/sessions/${sid}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { await fetchWelcome(); return; }
      const msgs = await res.json();
      if (!msgs.length) { await fetchWelcome(); return; }
      setMessages(msgs.map(m => ({
        id: m.id, role: m.role, content: m.content,
        emotion: m.emotion, transcription: m.transcription,
      })));
    } catch { await fetchWelcome(); }
  }, [token, fetchWelcome]);

  // ── Session init — reacts to URL changes ─────────────────────────────────
  // URL scheme:
  //   /chat           → restore session from sessionStorage (or welcome)
  //   /chat?new=1     → new chat (clear session, show welcome)
  //   /chat?session=N → load specific session N
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const isNew       = params.get('new') === '1';
    const sessionParam = params.get('session');

    if (isNew) {
      sessionStorage.removeItem('jarvis_session_id');
      currentSessionRef.current = null;
      setSessionId(null);
      setMessages([]);
      navigate('/chat', { replace: true });
      fetchWelcome();
      return;
    }

    if (sessionParam) {
      const sid = Number(sessionParam);
      persistSession(sid);
      loadSessionMessages(sid);
      navigate('/chat', { replace: true }); // clean URL after loading
      return;
    }

    // Plain /chat — restore from sessionStorage
    const storedSid = sessionStorage.getItem('jarvis_session_id');
    if (storedSid) {
      const sid = Number(storedSid);
      currentSessionRef.current = sid;
      setSessionId(sid);
      loadSessionMessages(sid);
    } else {
      fetchWelcome();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  // ── Text chat ─────────────────────────────────────────────────────────────
  const handleTextSend = async (e) => {
    e.preventDefault();
    const text = inputValue.trim();
    if (!text || isTyping) return;

    setInputValue('');
    const userMsg = { id: Date.now(), role: 'user', content: text };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setIsTyping(true);

    try {
      const res = await fetch(`${API}/api/v1/jarvis/text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text, session_id: currentSessionRef.current }),
      });
      const data = await res.json();
      if (data.session_id) persistSession(data.session_id);
      const jarvisMsg = { id: Date.now() + 1, role: 'jarvis', content: data.response, emotion: data.emotion };
      setMessages([...updated, jarvisMsg]);
      synthesizeSpeech(data.response);
    } catch {
      setMessages([...updated, { id: Date.now() + 1, role: 'jarvis', content: 'Connection error. Is the backend running?' }]);
    } finally {
      setIsTyping(false);
    }
  };

  // ── Audio: silence detection ──────────────────────────────────────────────
  const startSilenceDetection = useCallback((stream) => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    src.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);
    let silenceStart = null;

    const tick = () => {
      analyser.getByteFrequencyData(data);
      const rms = Math.sqrt(data.reduce((a, v) => a + v * v, 0) / data.length);

      if (rms < SILENCE_THRESHOLD) {
        if (!silenceStart) silenceStart = Date.now();
        const elapsed = Date.now() - silenceStart;
        setSilenceCountdown(Math.max(0, Math.ceil((SILENCE_MS - elapsed) / 1000)));
        if (elapsed >= SILENCE_MS) {
          ctx.close();
          if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
          }
          return; // stop animation loop
        }
      } else {
        silenceStart = null;
        setSilenceCountdown(null);
      }
      animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
  }, []);

  // ── Audio recording ───────────────────────────────────────────────────────
  const stopRecording = () => {
    cancelAnimationFrame(animFrameRef.current);
    setSilenceCountdown(null);
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
    setIsRecording(false);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setSilenceCountdown(null);
        if (!audioChunksRef.current.length) return;

        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const tempId = Date.now();
        const pending = [...messages, { id: tempId, role: 'user', content: '🎙️ Processing audio…' }];
        setMessages(pending);
        setIsTyping(true);

        const form = new FormData();
        form.append('file', blob, 'record.webm');
        if (currentSessionRef.current) form.append('session_id', String(currentSessionRef.current));

        try {
          const res = await fetch(`${API}/api/v1/jarvis/audio`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: form,
          });
          const data = await res.json();
          if (data.session_id) persistSession(data.session_id);
          const finalized = pending.map(m =>
            m.id === tempId ? { ...m, content: `🎙️ "${data.transcription}"` } : m
          );
          setMessages([...finalized, { id: Date.now(), role: 'jarvis', content: data.response, emotion: data.emotion }]);
          synthesizeSpeech(data.response);
        } catch {
          setMessages([...pending, { id: Date.now(), role: 'jarvis', content: 'Audio pipeline error.' }]);
        } finally {
          setIsTyping(false);
        }
      };

      recorder.start(250);
      setIsRecording(true);
      startSilenceDetection(stream);
    } catch {
      alert('Microphone access denied. Allow mic permissions in your browser and try again.');
    }
  };

  const toggleRecording = () => { isRecording ? stopRecording() : startRecording(); };

  // ── Avatar initials ───────────────────────────────────────────────────────
  const initials = user?.name
    ? user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : 'U';

  return (
    <div className="flex flex-col h-full bg-background transition-colors duration-300">

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-3xl mx-auto w-full space-y-6 pb-4">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'jarvis' && (
                <div className="w-9 h-9 rounded-full bg-surface border border-borderMuted flex items-center justify-center shrink-0 mt-1">
                  <Bot className="w-5 h-5 text-primary" />
                </div>
              )}
              <div className={`flex flex-col gap-1.5 max-w-[82%] ${msg.role === 'user' ? 'items-end' : ''}`}>
                <div className={`px-4 py-3 rounded-2xl text-[15px] leading-relaxed
                  ${msg.role === 'user'
                    ? 'bg-primary text-white rounded-br-sm'
                    : 'bg-surface text-textMain border border-borderMuted rounded-bl-sm shadow-sm'
                  }`}
                >
                  {msg.content}
                </div>
                {msg.emotion && msg.emotion !== 'neutral' && msg.emotion !== 'error' && msg.role === 'jarvis' && (
                  <span className="text-xs text-textMuted px-1 flex items-center gap-1">
                    <Volume2 size={11} /> {msg.emotion}
                  </span>
                )}
              </div>
              {msg.role === 'user' && (
                <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-primary to-purple-500 flex items-center justify-center shrink-0 text-white font-bold text-xs mt-1">
                  {initials}
                </div>
              )}
            </div>
          ))}

          {isTyping && (
            <div className="flex gap-3">
              <div className="w-9 h-9 rounded-full bg-surface border border-borderMuted flex items-center justify-center shrink-0">
                <Loader2 className="w-4 h-4 text-primary animate-spin" />
              </div>
              <div className="px-4 py-3 rounded-2xl bg-surface border border-borderMuted flex items-center gap-1.5">
                {[0, 150, 300].map(d => (
                  <div key={d} className="w-2 h-2 rounded-full bg-textMuted animate-bounce" style={{ animationDelay: `${d}ms` }} />
                ))}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="p-4 bg-background border-t border-borderMuted">
        <div className="max-w-3xl mx-auto">
          {isRecording && silenceCountdown !== null && (
            <p className="text-center text-xs text-textMuted mb-2 animate-pulse">
              🔇 Silence detected — auto-stopping in {silenceCountdown}s
            </p>
          )}
          <div className="glass rounded-2xl p-1.5 focus-within:ring-2 focus-within:ring-primary/50 transition-all flex items-end gap-1">
            <button
              type="button"
              onClick={toggleRecording}
              title={isRecording ? 'Stop recording' : 'Start voice input'}
              className={`p-3 rounded-xl shrink-0 transition-all
                ${isRecording
                  ? 'bg-red-500 text-white animate-pulse'
                  : 'text-textMuted hover:bg-surfaceHover hover:text-primary'
                }`}
            >
              {isRecording ? <Square size={19} /> : <Mic size={19} />}
            </button>
            <form className="flex-1 flex items-center min-h-[48px]" onSubmit={handleTextSend}>
              <input
                type="text"
                readOnly={isRecording}
                value={isRecording ? '🎙️ Listening… (click ■ or wait for silence)' : inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Ask JARVIS anything…"
                className="w-full bg-transparent border-none outline-none text-textMain placeholder-textMuted py-2 px-2 focus:ring-0 text-[15px]"
              />
              <button
                type="submit"
                disabled={!inputValue.trim() || isRecording || isTyping}
                className="p-2.5 bg-primary text-white rounded-xl hover:bg-primaryDark disabled:opacity-40 transition-colors shrink-0 mr-1"
              >
                <Send size={17} />
              </button>
            </form>
          </div>
          <p className="text-center text-xs text-textMuted mt-2.5 opacity-60">
            JARVIS may make mistakes. Verify important information.
          </p>
        </div>
      </div>
    </div>
  );
}
