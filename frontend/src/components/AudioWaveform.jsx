import { useRef, useEffect } from 'react';

/**
 * AudioWaveform — Real-time audio waveform visualization using Web Audio API.
 * 
 * Props:
 *   stream: MediaStream — active microphone stream
 *   isActive: boolean — whether recording is active
 * 
 * Source: ALM2.0.md Feature 5 (Audio Visualization)
 */
export default function AudioWaveform({ stream, isActive }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const analyserRef = useRef(null);
  const ctxRef = useRef(null);

  useEffect(() => {
    if (!stream || !isActive) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    source.connect(analyser);
    analyserRef.current = analyser;

    const ctx = canvas.getContext('2d');
    ctxRef.current = ctx;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;

      analyser.getByteFrequencyData(dataArray);
      ctx.clearRect(0, 0, w, h);

      const barCount = 48;
      const gap = 3;
      const barWidth = (w - (barCount - 1) * gap) / barCount;
      const centerY = h / 2;

      for (let i = 0; i < barCount; i++) {
        // Map to frequency data (skip very low frequencies)
        const dataIndex = Math.floor((i / barCount) * bufferLength * 0.8) + 4;
        const value = dataArray[dataIndex] || 0;
        const barHeight = Math.max(3, (value / 255) * (h * 0.8));

        const x = i * (barWidth + gap);
        const halfBar = barHeight / 2;

        // Gradient color based on amplitude
        const hue = 240 - (value / 255) * 60; // indigo → purple
        const saturation = 70 + (value / 255) * 30;
        const lightness = 55 + (value / 255) * 15;

        ctx.fillStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, 0.85)`;
        ctx.beginPath();
        ctx.roundRect(x, centerY - halfBar, barWidth, barHeight, barWidth / 2);
        ctx.fill();

        // Glow effect for loud bars
        if (value > 100) {
          ctx.fillStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, 0.15)`;
          ctx.beginPath();
          ctx.roundRect(x - 1, centerY - halfBar - 2, barWidth + 2, barHeight + 4, barWidth / 2 + 1);
          ctx.fill();
        }
      }

      animRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animRef.current);
      audioCtx.close();
    };
  }, [stream, isActive]);

  // Resize canvas for retina
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
  }, []);

  if (!isActive) return null;

  return (
    <div className="w-full flex items-center justify-center py-2 animate-fade-in">
      <div className="w-full max-w-md h-16 rounded-2xl bg-surface/50 border border-borderMuted p-2 relative overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 via-purple-500/5 to-pink-500/5 rounded-2xl" />
        <canvas
          ref={canvasRef}
          className="w-full h-full relative z-10"
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </div>
  );
}
