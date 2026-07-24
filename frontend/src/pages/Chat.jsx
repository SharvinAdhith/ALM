import { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Send, Mic, Square, Loader2, Bot, Volume2, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import AudioWaveform from '../components/AudioWaveform';

const API = 'http://localhost:8000';
const SILENCE_THRESHOLD = 15;   // RMS amplitude 0-255
const SILENCE_MS = 2800;        // 2.8 s of silence → auto-stop

/* Read TTS preference from localStorage (updated by Settings page) */
const isTtsEnabled = () => localStorage.getItem('jarvis_tts') !== '0';

export default function Chat() {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [silenceCountdown, setSilenceCountdown] = useState(null);
  const [activeStream, setActiveStream] = useState(null); // MediaStream for waveform

  const mediaRecorderRef  = useRef(null);
  const audioChunksRef    = useRef([]);
  const animFrameRef      = useRef(null);
  const messagesEndRef    = useRef(null);
  const currentSessionRef = useRef(null); // avoids stale closure in handlers

  const { token, user } = useAuth();
  const location         = useLocation();
  const navigate         = useNavigate();

  // ── Scroll ────────────────────────────────────────────────────────────────
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isTyping, isStreaming]);

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
        id: m.id,
        // Normalize role: some older records may use 'assistant'
        role: m.role === 'assistant' ? 'jarvis' : m.role,
        content: m.content,
        emotion: m.emotion,
        transcription: m.transcription,
      })));
    } catch { await fetchWelcome(); }
  }, [token, fetchWelcome]);

  // ── Session init — reacts to URL changes + token availability ────────────
  useEffect(() => {
    // Guard: don't run until auth token is available (avoids race on reload)
    if (!token) return;

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
  }, [location.search, token]);

  // ── SSE Streaming text chat ───────────────────────────────────────────────
  const handleTextSend = async (e) => {
    e.preventDefault();
    const text = inputValue.trim();
    if (!text || isTyping || isStreaming) return;

    setInputValue('');
    const userMsg = { id: Date.now(), role: 'user', content: text };
    const updated = [...messages, userMsg];
    setMessages(updated);

    // Create a placeholder JARVIS message for streaming
    const jarvisMsgId = Date.now() + 1;
    const jarvisMsg = { id: jarvisMsgId, role: 'jarvis', content: '', streaming: true };
    setMessages([...updated, jarvisMsg]);
    setIsStreaming(true);

    try {
      const res = await fetch(`${API}/api/v1/jarvis/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text, session_id: currentSessionRef.current }),
      });

      if (!res.ok) {
        // Fallback to non-streaming endpoint
        const fallbackRes = await fetch(`${API}/api/v1/jarvis/text`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ text, session_id: currentSessionRef.current }),
        });
        const data = await fallbackRes.json();
        if (data.session_id) persistSession(data.session_id);
        setMessages(prev => prev.map(m =>
          m.id === jarvisMsgId ? { ...m, content: data.response, emotion: data.emotion, streaming: false } : m
        ));
        synthesizeSpeech(data.response);
        setIsStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        // First pass: detect meta event lines so we can skip their data lines
        const metaDataLines = new Set();
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].startsWith('event: meta') && lines[i + 1]?.startsWith('data: ')) {
            metaDataLines.add(i + 1);
            // Parse session_id here
            const sid = Number(lines[i + 1].slice(6));
            if (sid) persistSession(sid);
          }
        }

        // Second pass: process only non-meta data lines
        for (let i = 0; i < lines.length; i++) {
          if (metaDataLines.has(i)) continue; // skip — this is the session_id line

          const line = lines[i];
          if (!line.startsWith('data: ')) continue;

          const payload = line.slice(6);

          if (payload === '[DONE]') {
            setMessages(prev => prev.map(m =>
              m.id === jarvisMsgId ? { ...m, streaming: false } : m
            ));
            synthesizeSpeech(accumulated);
            continue;
          }

          if (payload === '[ERROR]') {
            setMessages(prev => prev.map(m =>
              m.id === jarvisMsgId ? { ...m, content: 'An error occurred while generating the response.', streaming: false } : m
            ));
            continue;
          }

          // Accumulate actual response token
          accumulated += payload;
          const current = accumulated;
          setMessages(prev => prev.map(m =>
            m.id === jarvisMsgId ? { ...m, content: current } : m
          ));
        }
      }
    } catch (err) {
      console.error('Stream error:', err);
      setMessages(prev => prev.map(m =>
        m.id === jarvisMsgId ? { ...m, content: 'Connection error. Is the backend running?', streaming: false } : m
      ));
    } finally {
      setIsStreaming(false);
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
            setActiveStream(null);
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
    setActiveStream(null);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setActiveStream(stream); // Pass to AudioWaveform
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setSilenceCountdown(null);
        setActiveStream(null);
        if (!audioChunksRef.current.length) return;

        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const tempId = Date.now();
        const processingMsgId = Date.now() + 1;
        // Show the user's recording as a microphone message
        const userAudioMsg = { id: tempId, role: 'user', content: '🎙️ Voice message' };
        // Show a circular-spinner processing bubble for JARVIS
        const processingMsg = { id: processingMsgId, role: 'jarvis', content: '', processing: true };
        const pendingBase = [...messages, userAudioMsg];
        setMessages([...pendingBase, processingMsg]);

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
          // Replace user placeholder with transcription, replace spinner with response
          setMessages(prev => prev
            .map(m => m.id === tempId ? { ...m, content: `🎙️ "${data.transcription}"` } : m)
            .map(m => m.id === processingMsgId ? { ...m, content: data.response, emotion: data.emotion, processing: false } : m)
          );
          synthesizeSpeech(data.response);
        } catch {
          setMessages(prev => prev.map(m =>
            m.id === processingMsgId ? { ...m, content: 'Audio pipeline error.', processing: false } : m
          ));
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
            <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
              {msg.role === 'jarvis' && (
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/20 flex items-center justify-center shrink-0 mt-1">
                  {msg.processing
                    ? <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                    : <Bot className="w-5 h-5 text-indigo-400" />}
                </div>
              )}
              <div className={`flex flex-col gap-1.5 max-w-[82%] ${msg.role === 'user' ? 'items-end' : ''}`}>
                <div className={`px-4 py-3 rounded-2xl text-[15px] leading-relaxed
                  ${msg.role === 'user'
                    ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-br-sm shadow-lg shadow-indigo-500/10'
                    : 'bg-surface text-textMain border border-borderMuted rounded-bl-sm shadow-sm'
                  }`}
                >
                  {/* Audio processing spinner bubble */}
                  {msg.processing ? (
                    <div className="flex items-center gap-3">
                      <div className="relative w-5 h-5 shrink-0">
                        <div className="absolute inset-0 rounded-full border-2 border-indigo-500/20" />
                        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-indigo-400 animate-spin" />
                      </div>
                      <span className="text-textMuted text-sm">Processing your audio…</span>
                    </div>
                  ) : (
                    <>
                      {msg.content}
                      {msg.streaming && <span className="typing-cursor" />}
                    </>
                  )}
                </div>
                {msg.emotion && msg.emotion !== 'neutral' && msg.emotion !== 'error' && msg.role === 'jarvis' && (
                  <span className="text-xs text-textMuted px-1 flex items-center gap-1">
                    <Volume2 size={11} /> {msg.emotion}
                  </span>
                )}
              </div>
              {msg.role === 'user' && (
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shrink-0 text-white font-bold text-xs mt-1 shadow-lg shadow-indigo-500/20">
                  {initials}
                </div>
              )}
            </div>
          ))}

          {isTyping && (
            <div className="flex gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/20 flex items-center justify-center shrink-0">
                <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
              </div>
              <div className="px-5 py-3.5 rounded-2xl bg-surface border border-borderMuted flex items-center gap-3 shadow-sm">
                {/* Circular spinner */}
                <div className="relative w-5 h-5 shrink-0">
                  <div className="absolute inset-0 rounded-full border-2 border-indigo-500/20" />
                  <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-indigo-400 animate-spin" />
                </div>
                <span className="text-sm text-textMuted">JARVIS is thinking…</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="p-4 bg-background border-t border-borderMuted">
        <div className="max-w-3xl mx-auto">
          {/* Audio Waveform Visualization */}
          <AudioWaveform stream={activeStream} isActive={isRecording} />

          {isRecording && silenceCountdown !== null && (
            <p className="text-center text-xs text-textMuted mb-2 animate-pulse">
              🔇 Silence detected — auto-stopping in {silenceCountdown}s
            </p>
          )}
          <div className="glass-strong rounded-2xl p-1.5 focus-within:glow-border transition-all flex items-end gap-1">
            <button
              type="button"
              onClick={toggleRecording}
              title={isRecording ? 'Stop recording' : 'Start voice input'}
              className={`p-3 rounded-xl shrink-0 transition-all
                ${isRecording
                  ? 'bg-red-500 text-white recording-pulse'
                  : 'text-textMuted hover:bg-surfaceHover hover:text-indigo-400'
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
                disabled={!inputValue.trim() || isRecording || isTyping || isStreaming}
                className="p-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl hover:from-indigo-600 hover:to-purple-700 disabled:opacity-40 transition-all shrink-0 mr-1 shadow-lg shadow-indigo-500/20 disabled:shadow-none"
              >
                {isStreaming ? <Sparkles size={17} className="animate-pulse" /> : <Send size={17} />}
              </button>
            </form>
          </div>
          <p className="text-center text-xs text-textMuted mt-2.5 opacity-50">
            JARVIS ALM — Deep Learning Audio Language Model · Streaming enabled
          </p>
        </div>
      </div>
    </div>
  );
}
