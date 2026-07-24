import { Link } from 'react-router-dom';
import { Bot, Mic, ArrowRight, Shield, Zap, Moon, Sun, Brain, AudioWaveform, MessageSquare, Sparkles } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useState, useEffect, useRef } from 'react';

/* ── Animated Neural Network Canvas ────────────────────────────────────────── */
function NeuralCanvas() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;
    let particles = [];

    const resize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    resize();
    window.addEventListener('resize', resize);

    // Create particles
    const count = 60;
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * canvas.offsetWidth,
        y: Math.random() * canvas.offsetHeight,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        r: Math.random() * 2 + 1,
      });
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);

      // Update and draw particles
      particles.forEach((p, i) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > canvas.offsetWidth) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.offsetHeight) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(99, 102, 241, 0.3)';
        ctx.fill();

        // Draw connections
        for (let j = i + 1; j < particles.length; j++) {
          const dx = p.x - particles[j].x;
          const dy = p.y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(99, 102, 241, ${0.12 * (1 - dist / 120)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      });

      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ opacity: 0.6 }}
    />
  );
}

/* ── Animated Counter ──────────────────────────────────────────────────────── */
function AnimatedCounter({ target, suffix = '', duration = 2000 }) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        let start = 0;
        const step = target / (duration / 16);
        const timer = setInterval(() => {
          start += step;
          if (start >= target) { setCount(target); clearInterval(timer); }
          else setCount(Math.floor(start));
        }, 16);
        observer.disconnect();
      }
    }, { threshold: 0.3 });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target, duration]);

  return <span ref={ref}>{count}{suffix}</span>;
}

/* ── Main Landing Page ─────────────────────────────────────────────────────── */
export default function Landing() {
  const { theme, toggleTheme } = useTheme();
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const features = [
    { icon: <Brain className="w-6 h-6" />, title: "Deep Learning Core", text: "Powered by advanced neural networks — Whisper ASR, GPT reasoning, and RAG-augmented memory for intelligent conversations.", color: "from-indigo-500 to-purple-600" },
    { icon: <Mic className="w-6 h-6" />, title: "Voice Intelligence", text: "Speak naturally and JARVIS understands. Real-time speech-to-text with contextual awareness and emotion detection.", color: "from-purple-500 to-pink-600" },
    { icon: <AudioWaveform className="w-6 h-6" />, title: "Audio Language Model", text: "Beyond speech — understands non-speech audio events, environmental sounds, and paralinguistic cues simultaneously.", color: "from-pink-500 to-rose-600" },
    { icon: <Sparkles className="w-6 h-6" />, title: "Streaming Responses", text: "Watch JARVIS think in real-time. Token-by-token streaming delivers responses as they're generated — zero wait time.", color: "from-amber-500 to-orange-600" },
    { icon: <Shield className="w-6 h-6" />, title: "Persistent Memory", text: "JARVIS remembers everything you tell it. Semantic vector memory + key-value store ensures cross-session continuity.", color: "from-emerald-500 to-teal-600" },
    { icon: <Zap className="w-6 h-6" />, title: "12-Tool Agent", text: "Agentic AI that takes action — searches the web, opens apps, manages files, checks weather, and more via function routing.", color: "from-cyan-500 to-blue-600" },
  ];

  return (
    <div className="min-h-screen flex flex-col items-center overflow-x-hidden bg-background relative isolate text-textMain transition-colors duration-300">

      {/* ── Animated Background ─────────────────────────────────────────── */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <NeuralCanvas />
        <div className="orb orb-1 absolute top-[-10%] left-[-5%] w-[500px] h-[500px] bg-indigo-500/20" />
        <div className="orb orb-2 absolute top-[50%] right-[-10%] w-[400px] h-[400px] bg-purple-500/15" />
        <div className="orb orb-3 absolute bottom-[-10%] left-[30%] w-[350px] h-[350px] bg-pink-500/10" />
      </div>

      {/* ── Navbar ──────────────────────────────────────────────────────── */}
      <nav className={`fixed top-0 w-full flex justify-between items-center px-6 lg:px-12 py-3 z-50 transition-all duration-300
        ${scrollY > 50 ? 'glass-strong shadow-lg' : 'bg-transparent'}`}
      >
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-background animate-pulse" />
          </div>
          <span className="text-xl font-bold tracking-tight">JARVIS<span className="text-primary font-light ml-1 text-sm">ALM</span></span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={toggleTheme} className="p-2 rounded-xl hover:bg-surfaceHover text-textMuted transition-all hover:scale-105">
            {theme === 'dark' ? <Sun className="w-4.5 h-4.5 text-amber-400" /> : <Moon className="w-4.5 h-4.5" />}
          </button>
          <Link to="/auth" className="px-4 py-2 rounded-xl font-medium text-sm hover:bg-surfaceHover transition-all text-textMuted hover:text-textMain">
            Log In
          </Link>
          <Link to="/auth" className="hidden sm:flex items-center gap-1.5 px-5 py-2.5 rounded-xl font-semibold text-sm bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/25 transition-all hover:shadow-indigo-500/40 hover:scale-[1.02] active:scale-[0.98]">
            <Sparkles className="w-3.5 h-3.5" /> Get Started
          </Link>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col pt-32 sm:pt-40 pb-20 items-center text-center px-4 w-full max-w-6xl z-10">

        {/* Badge */}
        <div className="animate-slide-up inline-flex items-center gap-2 px-4 py-1.5 mb-8 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-sm font-medium backdrop-blur-md">
          <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span></span>
          Deep Learning Audio Language Model — Live
        </div>

        {/* Heading */}
        <h1 className="animate-slide-up text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-extrabold tracking-tight mb-6 leading-[1.05]" style={{ animationDelay: '0.1s' }}>
          Listen. Think.<br />
          <span className="gradient-text">Understand.</span>
        </h1>

        {/* Subtext */}
        <p className="animate-slide-up text-textMuted text-lg md:text-xl max-w-2xl mb-10 leading-relaxed" style={{ animationDelay: '0.2s' }}>
          JARVIS processes speech and non-speech audio simultaneously, reasons with persistent memory, and responds in real-time — the most advanced Audio Language Model for intelligent conversation.
        </p>

        {/* CTA Buttons */}
        <div className="animate-slide-up flex flex-col sm:flex-row gap-4 w-full justify-center" style={{ animationDelay: '0.3s' }}>
          <Link to="/chat" className="group flex items-center justify-center gap-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-8 py-4 rounded-2xl text-lg font-semibold transition-all hover:shadow-xl hover:shadow-indigo-500/30 hover:-translate-y-0.5 active:scale-[0.98]">
            <div className="relative">
              <Mic className="w-5 h-5" />
              <div className="absolute inset-0 animate-ping opacity-20"><Mic className="w-5 h-5" /></div>
            </div>
            Start Speaking Now
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </Link>
          <Link to="/auth" className="flex items-center justify-center gap-2 glass-strong hover:bg-surfaceHover text-textMain px-8 py-4 rounded-2xl text-lg font-semibold transition-all hover:-translate-y-0.5">
            <MessageSquare className="w-5 h-5" /> Text Chat
          </Link>
        </div>

        {/* ── Stats Bar ──────────────────────────────────────────────────── */}
        <div className="animate-slide-up mt-20 w-full grid grid-cols-2 md:grid-cols-4 gap-4" style={{ animationDelay: '0.4s' }}>
          {[
            { value: 527, suffix: '+', label: 'Audio Classes' },
            { value: 12, suffix: '', label: 'Agent Tools' },
            { value: 5, suffix: '', label: 'Emotion Types' },
            { value: 99, suffix: '%', label: 'Uptime' },
          ].map((stat, i) => (
            <div key={i} className="glass rounded-2xl p-5 text-center hover:glow-border transition-all duration-300">
              <div className="text-3xl font-bold gradient-text-blue">
                <AnimatedCounter target={stat.value} suffix={stat.suffix} />
              </div>
              <div className="text-xs text-textMuted mt-1 font-medium uppercase tracking-wider">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* ── Feature Grid ───────────────────────────────────────────────── */}
        <section className="mt-28 w-full">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-3">Built for the Future of Audio AI</h2>
            <p className="text-textMuted max-w-xl mx-auto">Every component is engineered for real-time audio understanding, from speech transcription to environmental sound classification.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((feature, i) => (
              <div key={i} className="group glass rounded-2xl p-7 hover:glow-border transition-all duration-300 cursor-default hover:-translate-y-1 text-left">
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-5 text-white shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                  {feature.icon}
                </div>
                <h3 className="text-lg font-bold mb-2">{feature.title}</h3>
                <p className="text-textMuted text-sm leading-relaxed">{feature.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Architecture Preview ────────────────────────────────────────── */}
        <section className="mt-28 w-full">
          <div className="glass-strong rounded-3xl p-8 md:p-12 relative overflow-hidden">
            <div className="absolute inset-0 neural-bg opacity-30 -z-10" />

            <div className="text-center mb-10">
              <h2 className="text-3xl md:text-4xl font-bold mb-3">How JARVIS Processes Audio</h2>
              <p className="text-textMuted max-w-xl mx-auto">A multi-pipeline architecture that processes speech, sounds, and emotions simultaneously.</p>
            </div>

            {/* Pipeline visualization */}
            <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-6">
              {[
                { step: '01', title: 'Audio Input', desc: 'Voice / Sound', color: 'from-blue-500 to-cyan-500' },
                { step: '02', title: 'Whisper ASR', desc: 'Speech → Text', color: 'from-indigo-500 to-blue-500' },
                { step: '03', title: 'NLP Engine', desc: 'Intent + Memory', color: 'from-purple-500 to-indigo-500' },
                { step: '04', title: 'GPT + RAG', desc: 'Reasoning', color: 'from-pink-500 to-purple-500' },
                { step: '05', title: 'Response', desc: 'Stream → TTS', color: 'from-rose-500 to-pink-500' },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-4 md:flex-col md:gap-2">
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${item.color} flex items-center justify-center text-white font-bold text-sm shadow-lg`}>
                    {item.step}
                  </div>
                  <div className="md:text-center">
                    <div className="font-semibold text-sm">{item.title}</div>
                    <div className="text-xs text-textMuted">{item.desc}</div>
                  </div>
                  {i < 4 && <ArrowRight className="hidden md:block w-5 h-5 text-textMuted opacity-40" />}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ─────────────────────────────────────────────────────────── */}
        <div className="w-full mt-28 relative">
          <div className="gradient-border glass-strong rounded-3xl p-12 text-center relative overflow-hidden">
            <div className="orb absolute top-0 right-0 w-[200px] h-[200px] bg-indigo-500/10" style={{ filter: 'blur(60px)' }} />
            <h2 className="text-3xl md:text-5xl font-bold mb-4">Ready to experience<br/><span className="gradient-text">Audio Intelligence?</span></h2>
            <p className="text-lg text-textMuted max-w-xl mx-auto mb-8">Start a conversation with JARVIS — the AI that truly listens.</p>
            <Link to="/auth" className="inline-flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-10 py-4 rounded-2xl text-lg font-bold shadow-xl shadow-indigo-500/25 transition-all hover:shadow-indigo-500/40 hover:scale-[1.02] active:scale-[0.98]">
              <Sparkles className="w-5 h-5" /> Create Free Account
            </Link>
          </div>
        </div>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="w-full py-6 text-center text-textMuted text-sm border-t border-borderMuted mt-auto">
        <div className="flex items-center justify-center gap-2 mb-1">
          <Bot className="w-4 h-4 text-primary" />
          <span className="font-semibold text-textMain">JARVIS ALM</span>
        </div>
        <p className="opacity-60">Deep Learning Based Audio Language Model &copy; {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}
