import { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Send, Mic, Square, Loader2, Bot, Volume2, Sparkles, Upload, XCircle, StopCircle, Plus, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import AudioWaveform from '../components/AudioWaveform';

const API = 'http://localhost:8000';
const SILENCE_THRESHOLD = 15;   // RMS amplitude 0-255
const SILENCE_MS = 2800;        // 2.8 s of silence → auto-stop

/* Read TTS preference from localStorage (updated by Profile/Settings page) */
const isTtsEnabled = () => localStorage.getItem('jarvis_tts') !== '0';

/**
 * Parses raw tool-call JSON strings into clean, human-readable action messages.
 * e.g. {"action":"call_tool","tool":"image_search","args":{"query":"Taj Mahal"}}
 *   -> "Opened Google Chrome and searched for images of 'Taj Mahal'."
 */
function formatHumanReadableResponse(text) {
  if (!text || typeof text !== 'string') return text;
  try {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      const parsed = JSON.parse(text.slice(start, end + 1));
      if (parsed && typeof parsed === 'object') {
        const action = parsed.action;
        const tool = parsed.tool || (action !== 'respond' ? action : null);
        const args = parsed.args || {};

        if (action === 'respond' && parsed.text) {
          return parsed.text;
        }

        if (tool === 'image_search') {
          return `Opened Google Chrome and searched for images of '${args.query || 'your query'}'.`;
        }
        if (tool === 'web_search') {
          return `Opened Google Chrome tab with search results for '${args.query || 'your search'}'.`;
        }
        if (tool === 'youtube_play') {
          return `Opened YouTube in Google Chrome to play '${args.query || 'video'}'.`;
        }
        if (tool === 'open_maps') {
          return `Opened Google Maps for '${args.location || 'the location'}'.`;
        }
        if (tool === 'open_app') {
          return `Launched '${args.app_name || 'the application'}' on your system.`;
        }
        if (tool === 'open_url') {
          return `Opened '${args.url || 'the webpage'}' in Google Chrome.`;
        }
        if (tool) {
          return `Action completed: '${tool}' executed successfully.`;
        }
      }
    }
  } catch {
    /* silent fallback to original text */
  }
  return text;
}


/**
 * Returns tailored colors and emoji icon based on the AI's extracted emotion.
 */
function getEmotionBadgeStyles(emotionStr) {
  const emotion = (emotionStr || '').toLowerCase();
  
  if (['happy', 'joy', 'excited', 'good', 'great', 'cheerful'].includes(emotion)) {
    return { icon: '😊', bg: 'bg-emerald-100 dark:bg-emerald-500/20', text: 'text-emerald-800 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-500/30' };
  }
  if (['sad', 'crying', 'depressed', 'down', 'alone', 'gloomy'].includes(emotion)) {
    return { icon: '😢', bg: 'bg-indigo-100 dark:bg-indigo-500/20', text: 'text-indigo-800 dark:text-indigo-300', border: 'border-indigo-200 dark:border-indigo-500/30' };
  }
  if (['angry', 'frustrated', 'mad', 'furious'].includes(emotion)) {
    return { icon: '😠', bg: 'bg-rose-100 dark:bg-rose-500/20', text: 'text-rose-800 dark:text-rose-300', border: 'border-rose-200 dark:border-rose-500/30' };
  }
  if (['stressed', 'anxious', 'nervous', 'worried'].includes(emotion)) {
    return { icon: '😰', bg: 'bg-amber-100 dark:bg-amber-500/20', text: 'text-amber-800 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-500/30' };
  }
  if (['surprised', 'shocked', 'amazed'].includes(emotion)) {
    return { icon: '😲', bg: 'bg-fuchsia-100 dark:bg-fuchsia-500/20', text: 'text-fuchsia-800 dark:text-fuchsia-300', border: 'border-fuchsia-200 dark:border-fuchsia-500/30' };
  }
  if (['love', 'affection', 'caring'].includes(emotion)) {
    return { icon: '🥰', bg: 'bg-pink-100 dark:bg-pink-500/20', text: 'text-pink-800 dark:text-pink-300', border: 'border-pink-200 dark:border-pink-500/30' };
  }
  if (emotion === 'neutral') {
    return { icon: '🙂', bg: 'bg-orange-100 dark:bg-orange-500/20', text: 'text-orange-800 dark:text-orange-300', border: 'border-orange-200 dark:border-orange-500/30' };
  }
  return { icon: '🎭', bg: 'bg-gray-100 dark:bg-gray-500/20', text: 'text-gray-800 dark:text-gray-300', border: 'border-gray-200 dark:border-gray-500/30' };
}

export default function Chat() {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingAudio, setIsProcessingAudio] = useState(false);
  const [silenceCountdown, setSilenceCountdown] = useState(null);
  const [activeStream, setActiveStream] = useState(null); // MediaStream for waveform

  // Model selection state with localStorage persistence
  const [audioModel, setAudioModel] = useState(() => localStorage.getItem('jarvis_audio_model') || 'whisper-basic');
  const [isPlusMenuOpen, setIsPlusMenuOpen] = useState(false);
  const plusMenuRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('jarvis_audio_model', audioModel);
  }, [audioModel]);

  // Handle clicking outside the plus menu to close it
  useEffect(() => {
    function handleClickOutside(event) {
      if (plusMenuRef.current && !plusMenuRef.current.contains(event.target)) {
        setIsPlusMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const mediaRecorderRef    = useRef(null);
  const audioChunksRef      = useRef([]);
  const animFrameRef        = useRef(null);
  const messagesEndRef      = useRef(null);
  const currentSessionRef   = useRef(null); // avoids stale closure in handlers
  const abortControllerRef  = useRef(null); // AbortController for cancelling HTTP requests
  const fileInputRef        = useRef(null);

  const { token, user } = useAuth();
  const location         = useLocation();
  const navigate         = useNavigate();

  // ── Scroll ────────────────────────────────────────────────────────────────
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isTyping, isStreaming, isProcessingAudio]);

  // ── TTS ───────────────────────────────────────────────────────────────────
  const synthesizeSpeech = useCallback((text) => {
    if (!('speechSynthesis' in window)) return;
    if (!isTtsEnabled()) return;           // ← respects Settings toggle
    window.speechSynthesis.cancel();
    const cleanText = formatHumanReadableResponse(text);
    const u = new SpeechSynthesisUtterance(cleanText);
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
        role: m.role === 'assistant' ? 'jarvis' : m.role,
        content: m.content,
        emotion: m.emotion,
        transcription: m.transcription,
      })));
    } catch { await fetchWelcome(); }
  }, [token, fetchWelcome]);

  // ── Session init — reacts to URL changes + token availability ────────────
  useEffect(() => {
    if (!token) return;

    const params = new URLSearchParams(location.search);
    const isNew        = params.get('new') === '1';
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
      navigate('/chat', { replace: true });
      return;
    }

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

  // ── Stop / Cancel active audio processing or text generation ─────────────
  const handleStopProcessing = () => {
    // 1. Stop recording if recording
    if (isRecording) {
      cancelAnimationFrame(animFrameRef.current);
      setSilenceCountdown(null);
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
      setActiveStream(null);
    }

    // 2. Abort HTTP fetch request (stream or audio processing)
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // 3. Stop TTS
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    setIsProcessingAudio(false);
    setIsStreaming(false);
    setIsTyping(false);

    // 4. Update processing / streaming message to cancelled state
    setMessages(prev => prev.map(m =>
      (m.processing || m.streaming)
        ? { ...m, content: m.content ? `${m.content} [Stopped]` : '🛑 Processing cancelled by user.', processing: false, streaming: false }
        : m
    ));
  };

  // ── Process Audio File Blob (from Mic or File Upload) ─────────────────────
  const sendAudioToBackend = async (blob, fileName = 'record.webm', displayLabel = '🎙️ Voice message') => {
    const tempId = Date.now();
    const processingMsgId = Date.now() + 1;
    
    const userAudioMsg = { id: tempId, role: 'user', content: displayLabel };
    const processingMsg = { id: processingMsgId, role: 'jarvis', content: '', processing: true };
    
    setMessages(prev => [...prev, userAudioMsg, processingMsg]);
    setIsProcessingAudio(true);

    const form = new FormData();
    form.append('file', blob, fileName);
    form.append('audio_model', audioModel);
    if (currentSessionRef.current) form.append('session_id', String(currentSessionRef.current));

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch(`${API}/api/v1/jarvis/audio`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
        signal: controller.signal,
      });

      if (!res.ok) throw new Error('Backend returned error status');

      const data = await res.json();
      if (data.session_id) persistSession(data.session_id);

      const formattedResponse = formatHumanReadableResponse(data.response);

      setMessages(prev => prev
        .map(m => m.id === tempId ? { ...m, content: `🎵 "${data.transcription || fileName}"` } : m)
        .map(m => m.id === processingMsgId ? { ...m, content: formattedResponse, emotion: data.emotion, processing: false } : m)
      );
      synthesizeSpeech(formattedResponse);
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('Audio upload/processing aborted by user.');
        setMessages(prev => prev.map(m =>
          m.id === processingMsgId ? { ...m, content: '🛑 Audio processing cancelled.', processing: false } : m
        ));
      } else {
        setMessages(prev => prev.map(m =>
          m.id === processingMsgId ? { ...m, content: 'Audio pipeline error. Please try again.', processing: false } : m
        ));
      }
    } finally {
      setIsProcessingAudio(false);
      abortControllerRef.current = null;
    }
  };

  // ── Audio File Upload Handler ─────────────────────────────────────────────
  const handleAudioFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (isRecording || isProcessingAudio || isStreaming) {
      alert('Please wait for the current action to finish or click stop.');
      return;
    }

    sendAudioToBackend(file, file.name, `📁 Audio File: ${file.name}`);
    // Clear input value so same file can be uploaded again if needed
    e.target.value = '';
  };

  // ── SSE Streaming text chat ───────────────────────────────────────────────
  const handleTextSend = async (e) => {
    e.preventDefault();
    const text = inputValue.trim();
    if (!text || isTyping || isStreaming || isProcessingAudio) return;

    setInputValue('');
    const userMsg = { id: Date.now(), role: 'user', content: text };
    const updated = [...messages, userMsg];
    setMessages(updated);

    const jarvisMsgId = Date.now() + 1;
    const jarvisMsg = { id: jarvisMsgId, role: 'jarvis', content: '', streaming: true };
    setMessages([...updated, jarvisMsg]);
    setIsStreaming(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch(`${API}/api/v1/jarvis/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text, session_id: currentSessionRef.current }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const fallbackRes = await fetch(`${API}/api/v1/jarvis/text`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ text, session_id: currentSessionRef.current }),
          signal: controller.signal,
        });
        const data = await fallbackRes.json();
        if (data.session_id) persistSession(data.session_id);
        const formatted = formatHumanReadableResponse(data.response);
        setMessages(prev => prev.map(m =>
          m.id === jarvisMsgId ? { ...m, content: formatted, emotion: data.emotion, streaming: false } : m
        ));
        synthesizeSpeech(formatted);
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

        const metaDataLines = new Set();
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].startsWith('event: meta') && lines[i + 1]?.startsWith('data: ')) {
            metaDataLines.add(i + 1);
            const sid = Number(lines[i + 1].slice(6));
            if (sid) persistSession(sid);
          }
        }

        for (let i = 0; i < lines.length; i++) {
          if (metaDataLines.has(i)) continue;

          const line = lines[i];
          if (!line.startsWith('data: ')) continue;

          const payload = line.slice(6);

          if (payload === '[DONE]') {
            setMessages(prev => prev.map(m => {
              if (m.id === jarvisMsgId) {
                const formatted = formatHumanReadableResponse(accumulated);
                return { ...m, content: formatted, streaming: false };
              }
              return m;
            }));
            synthesizeSpeech(accumulated);
            continue;
          }

          if (payload === '[ERROR]') {
            setMessages(prev => prev.map(m =>
              m.id === jarvisMsgId ? { ...m, content: 'An error occurred while generating the response.', streaming: false } : m
            ));
            continue;
          }

          accumulated += payload;
          const current = accumulated;
          setMessages(prev => prev.map(m =>
            m.id === jarvisMsgId ? { ...m, content: current } : m
          ));
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('Stream aborted by user.');
        setMessages(prev => prev.map(m =>
          m.id === jarvisMsgId ? { ...m, content: m.content ? `${m.content} [Stopped]` : '🛑 Response stopped by user.', streaming: false } : m
        ));
      } else {
        console.error('Stream error:', err);
        setMessages(prev => prev.map(m =>
          m.id === jarvisMsgId ? { ...m, content: 'Connection error. Is the backend running?', streaming: false } : m
        ));
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
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
          return;
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
      setActiveStream(stream);
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
        sendAudioToBackend(blob, 'record.webm', '🎙️ Voice message');
      };

      recorder.start(250);
      setIsRecording(true);
      startSilenceDetection(stream);
    } catch {
      alert('Microphone access denied. Allow mic permissions in your browser and try again.');
    }
  };

  const toggleRecording = () => { isRecording ? stopRecording() : startRecording(); };

  // ── Global Enter listener for stopping recording ──────────────────────────
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey && isRecording) {
        e.preventDefault();
        stopRecording();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isRecording]);

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
                    ? 'bg-blue-50 text-blue-900 border border-blue-100 dark:bg-indigo-500/20 dark:text-indigo-100 dark:border-indigo-500/30 rounded-2xl rounded-br-sm shadow-sm'
                    : 'bg-surface text-textMain border border-borderMuted rounded-2xl rounded-bl-sm shadow-sm'
                  }`}
                >
                  {/* Audio processing spinner bubble with Stop Button */}
                  {msg.processing ? (
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="relative w-5 h-5 shrink-0">
                          <div className="absolute inset-0 rounded-full border-2 border-indigo-500/20" />
                          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-indigo-400 animate-spin" />
                        </div>
                        <span className="text-textMuted text-sm">Processing your audio…</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleStopProcessing}
                        className="flex items-center gap-1 px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs font-semibold border border-red-500/20 transition-colors"
                        title="Cancel audio processing"
                      >
                        <XCircle size={13} />
                        Stop
                      </button>
                    </div>
                  ) : (
                    <>
                      {formatHumanReadableResponse(msg.content)}
                      {msg.streaming && <span className="typing-cursor" />}
                    </>
                  )}
                </div>
                {msg.role === 'jarvis' && msg.emotion && msg.emotion !== 'error' && (
                  (() => {
                    const style = getEmotionBadgeStyles(msg.emotion);
                    return (
                      <div className="flex items-center gap-2 mt-1">
                        <div className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 border shadow-sm ${style.bg} ${style.text} ${style.border}`}>
                          <span>{style.icon}</span>
                          <span className="capitalize">{msg.emotion}</span>
                        </div>
                      </div>
                    );
                  })()
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

      {/* Input bar */}
      <div className="p-4 bg-background border-t border-borderMuted">
        <div className="max-w-3xl mx-auto">
          {/* Audio Waveform Visualization */}
          <AudioWaveform stream={activeStream} isActive={isRecording} />

          {isRecording && silenceCountdown !== null && (
            <p className="text-center text-xs text-textMuted mb-2 animate-pulse">
              🔇 Silence detected — auto-stopping in {silenceCountdown}s
            </p>
          )}

          {/* Hidden File Input for Audio Upload */}
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleAudioFileUpload}
            className="hidden"
          />

          <div className="glass-strong rounded-2xl p-1.5 focus-within:glow-border transition-all flex items-end gap-1 relative">
            {/* Plus Menu Container */}
            <div className="relative" ref={plusMenuRef}>
              <button
                type="button"
                onClick={() => setIsPlusMenuOpen(!isPlusMenuOpen)}
                disabled={isRecording || isProcessingAudio || isStreaming}
                title="Options"
                className="p-3 text-textMuted hover:bg-surfaceHover hover:text-indigo-400 rounded-full shrink-0 transition-all disabled:opacity-40 flex items-center justify-center bg-surface border border-borderMuted shadow-sm ml-1 mb-0.5"
              >
                <Plus size={19} className={`transition-transform duration-200 ${isPlusMenuOpen ? 'rotate-45' : ''}`} />
              </button>

              {/* Popup Menu */}
              {isPlusMenuOpen && (
                <div className="absolute bottom-full left-0 mb-3 w-64 bg-surface border border-borderMuted rounded-2xl shadow-xl shadow-black/10 overflow-hidden flex flex-col z-50 py-2 animate-fade-in text-left">
                  
                  {/* Upload File */}
                  <button
                    type="button"
                    onClick={() => {
                        fileInputRef.current?.click();
                        setIsPlusMenuOpen(false);
                    }}
                    className="flex items-center gap-3 px-4 py-2.5 text-[15px] font-medium text-textMain hover:bg-surfaceHover w-full transition-colors"
                  >
                    <Upload size={16} className="text-textMuted" />
                    Upload Audio File
                  </button>

                  <div className="h-px bg-borderMuted my-1.5 mx-4"></div>

                  <div className="px-4 py-1.5 text-xs font-semibold text-textMuted uppercase tracking-wider">
                    Audio Model
                  </div>
                  
                  {[
                    { id: 'whisper-basic', label: 'Whisper Basic (Fast)' },
                    { id: 'alm-full-scene', label: 'BAP Model' },
                    { id: 'whisper-multi', label: 'Multilingual Voice' }
                  ].map(model => (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => {
                         setAudioModel(model.id);
                         setIsPlusMenuOpen(false);
                      }}
                      className="flex items-center justify-between px-4 py-2.5 text-[14px] text-textMain hover:bg-surfaceHover w-full transition-colors"
                    >
                      <span className="truncate pr-2">{model.label}</span>
                      {audioModel === model.id && <Check size={16} className="text-indigo-500 shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <form className="flex-1 flex items-center min-h-[48px] bg-transparent" onSubmit={handleTextSend}>
              <input
                type="text"
                readOnly={isRecording || isProcessingAudio}
                value={
                  isRecording
                    ? '🎙️ Listening… (click ■ to stop)'
                    : isProcessingAudio
                    ? '⏳ Processing audio… (click ■ to stop)'
                    : inputValue
                }
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (isRecording) {
                      stopRecording(); // stops mic → triggers onstop → sends audio automatically
                    } else if (!isProcessingAudio) {
                      handleTextSend(e);
                    }
                  }
                }}
                placeholder="Ask Minialm anything or upload audio…"
                className="w-full bg-transparent border-none outline-none text-textMain placeholder-textMuted py-2 px-3 focus:ring-0 text-[15px]"
              />

              {/* Mic / Stop Button */}
              {isRecording || isProcessingAudio || isStreaming ? (
                <button
                  type="button"
                  onClick={handleStopProcessing}
                  title="Stop processing"
                  className="p-2.5 bg-textMain text-background rounded-full hover:bg-textMuted transition-all shrink-0 mr-1 flex items-center justify-center shadow-md animate-fade-in"
                >
                  <Square size={17} className="fill-current" />
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={toggleRecording}
                    title="Start voice input"
                    className="p-2.5 text-textMuted hover:bg-surfaceHover hover:text-indigo-400 rounded-full shrink-0 transition-all mr-1"
                  >
                    <Mic size={19} />
                  </button>
                  <button
                    type="submit"
                    disabled={!inputValue.trim() || isTyping || isStreaming || isProcessingAudio || isRecording}
                    title="Send message"
                    className="p-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-full hover:from-indigo-600 hover:to-purple-700 disabled:opacity-40 transition-all shrink-0 mr-1 shadow-md disabled:shadow-none"
                  >
                    <Send size={17} />
                  </button>
                </>
              )}
            </form>
          </div>
          <p className="text-center text-xs text-textMuted mt-2.5 opacity-50">
            JARVIS ALM — Deep Learning Audio Language Model · Streaming & Audio Upload enabled
          </p>
        </div>
      </div>
    </div>
  );
}
