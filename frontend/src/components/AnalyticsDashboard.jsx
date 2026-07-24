import { useState, useEffect } from 'react';
import { X, BarChart3, MessageSquare, Brain, Clock, TrendingUp, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const API = 'http://localhost:8000';

/**
 * AnalyticsDashboard — Chat statistics panel.
 * Source: ALM2.0.md Feature 10 (Evaluation Framework, adapted for user analytics)
 */
export default function AnalyticsDashboard({ onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const { token } = useAuth();

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const res = await fetch(`${API}/api/v1/jarvis/analytics`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) setData(await res.json());
      } catch { /* silent */ }
      finally { setLoading(false); }
    };
    fetchAnalytics();
  }, [token]);

  if (loading) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-3 text-textMuted">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="text-sm">Loading analytics...</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-2 text-textMuted">
        <BarChart3 className="w-8 h-8 opacity-40" />
        <span className="text-sm">Unable to load analytics</span>
      </div>
    );
  }

  const emotionColors = {
    neutral: { bg: 'bg-slate-500/20', text: 'text-slate-400', bar: 'bg-slate-400' },
    error: { bg: 'bg-red-500/20', text: 'text-red-400', bar: 'bg-red-400' },
    happy: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', bar: 'bg-emerald-400' },
    sad: { bg: 'bg-blue-500/20', text: 'text-blue-400', bar: 'bg-blue-400' },
    angry: { bg: 'bg-orange-500/20', text: 'text-orange-400', bar: 'bg-orange-400' },
  };

  const totalEmotions = Object.values(data.emotion_distribution || {}).reduce((a, b) => a + b, 0);

  return (
    <div className="flex flex-col h-full bg-background overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-surface/90 backdrop-blur-xl border-b border-borderMuted px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <BarChart3 className="w-4 h-4 text-white" />
          </div>
          <div>
            <h2 className="font-bold text-textMain text-sm">Chat Analytics</h2>
            <p className="text-xs text-textMuted">Your JARVIS usage overview</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 rounded-xl text-textMuted hover:text-textMain hover:bg-surfaceHover transition-all">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-5 space-y-5">
        {/* Stat Cards */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: <MessageSquare className="w-4 h-4" />, label: 'Total Chats', value: data.total_sessions, color: 'from-indigo-500 to-blue-600' },
            { icon: <Brain className="w-4 h-4" />, label: 'Messages', value: data.total_messages, color: 'from-purple-500 to-pink-600' },
            { icon: <TrendingUp className="w-4 h-4" />, label: 'Your Messages', value: data.user_messages, color: 'from-emerald-500 to-teal-600' },
            { icon: <Clock className="w-4 h-4" />, label: 'Avg Length', value: `${Math.round(data.avg_response_length)}`, color: 'from-amber-500 to-orange-600' },
          ].map((stat, i) => (
            <div key={i} className="glass rounded-xl p-4 hover:glow-border transition-all duration-300">
              <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${stat.color} flex items-center justify-center text-white mb-2.5`}>
                {stat.icon}
              </div>
              <div className="text-2xl font-bold text-textMain">{stat.value}</div>
              <div className="text-xs text-textMuted mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Emotion Distribution */}
        {totalEmotions > 0 && (
          <div className="glass rounded-xl p-5">
            <h3 className="text-sm font-semibold text-textMain mb-4 flex items-center gap-2">
              <span className="text-lg">🎭</span> Response Emotions
            </h3>
            <div className="space-y-3">
              {Object.entries(data.emotion_distribution).map(([emotion, count]) => {
                const pct = Math.round((count / totalEmotions) * 100);
                const colors = emotionColors[emotion] || emotionColors.neutral;
                return (
                  <div key={emotion} className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className={`font-medium capitalize ${colors.text}`}>{emotion}</span>
                      <span className="text-textMuted">{count} ({pct}%)</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-surfaceHover overflow-hidden">
                      <div
                        className={`h-full rounded-full ${colors.bar} transition-all duration-700`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent Sessions */}
        {data.recent_sessions?.length > 0 && (
          <div className="glass rounded-xl p-5">
            <h3 className="text-sm font-semibold text-textMain mb-3 flex items-center gap-2">
              <span className="text-lg">💬</span> Recent Sessions
            </h3>
            <div className="space-y-2">
              {data.recent_sessions.map((session, i) => (
                <div key={i} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-surfaceHover transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-textMain truncate">{session.title}</div>
                    <div className="text-xs text-textMuted">
                      {new Date(session.created_at).toLocaleDateString()} · {session.messages} messages
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {data.total_sessions === 0 && (
          <div className="text-center py-10">
            <MessageSquare className="w-10 h-10 text-textMuted opacity-30 mx-auto mb-3" />
            <p className="text-sm text-textMuted">No chat data yet. Start a conversation with JARVIS!</p>
          </div>
        )}
      </div>
    </div>
  );
}
