import { useState } from 'react';
import { Check, ArrowLeft, Bot, Sparkles, Zap, Crown, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const plans = [
  {
    id: 'free',
    name: 'Free',
    icon: Bot,
    monthlyPrice: 0,
    annualPrice: 0,
    description: 'Experience JARVIS core capabilities at no cost.',
    features: [
      'Basic Audio Processing',
      'Standard Text Context',
      'Community Support',
      '50 Queries / Day',
      'Web Access',
    ],
    notIncluded: ['Zero Latency Mode', 'API Access', 'Custom Voices'],
    button: 'Current Plan',
    accentColor: 'from-slate-400 to-slate-500',
    badge: null,
  },
  {
    id: 'pro',
    name: 'Pro',
    icon: Zap,
    monthlyPrice: 20,
    annualPrice: 16,
    description: 'For power users needing advanced latency control.',
    features: [
      'Zero Latency Audio Mode',
      'Infinite Context Window',
      'Priority Support',
      'Unlimited Queries',
      'Advanced Emotion Detection',
      'Voice Memory',
    ],
    notIncluded: ['Custom Voice Clones', 'Dedicated Manager'],
    button: 'Upgrade to Pro',
    accentColor: 'from-indigo-500 to-purple-600',
    badge: 'Most Popular',
  },
  {
    id: 'ultra',
    name: 'Ultra',
    icon: Crown,
    monthlyPrice: 50,
    annualPrice: 40,
    description: 'Enterprise-grade JARVIS deployment at scale.',
    features: [
      'Custom Voice Clones',
      'API Access & Webhooks',
      'Dedicated Account Manager',
      'SLA Guarantee (99.9%)',
      'Team Management',
      'On-Premise Deployment',
    ],
    notIncluded: [],
    button: 'Contact Sales',
    accentColor: 'from-amber-400 to-orange-500',
    badge: 'Enterprise',
  },
];

/* ── Toast ─────────────────────────────────────────────────────────────────── */
function Toast({ message, onClose }) {
  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[9999] animate-slide-up">
      <div className="flex items-center gap-2.5 px-5 py-3 bg-surface border border-borderMuted rounded-2xl shadow-2xl text-sm text-textMain backdrop-blur-xl">
        <Check className="w-4 h-4 text-emerald-400 shrink-0" />
        {message}
        <button onClick={onClose} className="text-textMuted hover:text-textMain ml-1">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function Pricing() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [currentPlan, setCurrentPlan] = useState('free'); // Default: Free
  const [annual, setAnnual] = useState(false);
  const [toast, setToast] = useState(null);

  const handleSelectPlan = (planId) => {
    if (planId === currentPlan) return;
    if (planId === 'ultra') {
      setToast('Our sales team will contact you shortly!');
      return;
    }
    setCurrentPlan(planId);
    const plan = plans.find(p => p.id === planId);
    setToast(`You're now on the ${plan.name} plan!`);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center py-20 px-4 relative overflow-y-auto overflow-x-hidden transition-colors duration-300">
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}

      {/* Background blobs */}
      <div className="absolute top-10 left-10 w-96 h-96 bg-indigo-500/10 rounded-full blur-[120px] -z-10 animate-pulse" />
      <div className="absolute bottom-10 right-10 w-80 h-80 bg-purple-500/10 rounded-full blur-[100px] -z-10 animate-pulse" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-500/5 rounded-full blur-[150px] -z-10" />

      {/* Header row */}
      <div className="w-full max-w-5xl mx-auto flex items-center justify-between mb-16 relative z-10">
        <Link
          to={isAuthenticated ? '/chat' : '/'}
          className="flex items-center text-textMuted hover:text-textMain transition-colors gap-1.5 text-sm group"
        >
          <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
          {isAuthenticated ? 'Back to Chat' : 'Back to Home'}
        </Link>
        <div className="flex items-center gap-2 font-bold text-lg text-textMain">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md shadow-indigo-500/20">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <span>JARVIS<span className="text-xs font-light text-textMuted ml-0.5">ALM</span></span>
        </div>
      </div>

      {/* Title */}
      <div className="text-center mb-10 relative z-10">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-400 text-xs font-semibold uppercase tracking-wider border border-indigo-500/20 mb-5">
          <Sparkles className="w-3 h-3" /> Simple Pricing
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold text-textMain mb-4 leading-tight">
          Choose your plan
        </h1>
        <p className="text-lg text-textMuted max-w-xl mx-auto">
          No hidden fees. Start free, scale when you're ready.
        </p>
      </div>

      {/* Billing toggle */}
      <div className="flex items-center gap-3 mb-12 relative z-10">
        <span className={`text-sm font-medium ${!annual ? 'text-textMain' : 'text-textMuted'}`}>Monthly</span>
        <button
          onClick={() => setAnnual(a => !a)}
          className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${annual ? 'bg-indigo-500' : 'bg-borderMuted'}`}
        >
          <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-300 ${annual ? 'translate-x-6' : 'translate-x-0.5'}`} />
        </button>
        <span className={`text-sm font-medium ${annual ? 'text-textMain' : 'text-textMuted'}`}>
          Annual
          <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-bold uppercase">Save 20%</span>
        </span>
      </div>

      {/* Current plan indicator */}
      <p className="text-sm text-textMuted mb-8 relative z-10">
        You are on the <span className="font-semibold text-indigo-400 capitalize">{currentPlan}</span> plan.
        {currentPlan === 'free' && (
          <span className="ml-2 text-textMuted">Upgrade to unlock more features →</span>
        )}
      </p>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl relative z-10">
        {plans.map((plan) => {
          const Icon = plan.icon;
          const isCurrentPlan = currentPlan === plan.id;
          const price = annual ? plan.annualPrice : plan.monthlyPrice;

          return (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-3xl p-8 transition-all duration-300 border
                ${isCurrentPlan
                  ? 'border-indigo-500/50 shadow-xl shadow-indigo-500/10 bg-indigo-500/5 scale-[1.02]'
                  : plan.id === 'pro'
                    ? 'border-purple-500/30 bg-surface hover:border-purple-500/50 hover:-translate-y-1 hover:shadow-xl hover:shadow-purple-500/10 cursor-pointer'
                    : 'border-borderMuted bg-surface hover:border-indigo-500/30 hover:-translate-y-1 hover:shadow-xl cursor-pointer'
                }
              `}
              onClick={() => !isCurrentPlan && handleSelectPlan(plan.id)}
            >
              {/* Badge */}
              {plan.badge && (
                <div className={`absolute -top-3.5 left-1/2 -translate-x-1/2 bg-gradient-to-r ${plan.accentColor} text-white px-4 py-1 rounded-full text-xs font-bold shadow-lg whitespace-nowrap`}>
                  {plan.badge}
                </div>
              )}

              {/* Current plan indicator */}
              {isCurrentPlan && (
                <div className="absolute top-4 right-4 flex items-center gap-1 text-xs font-semibold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">
                  <Check className="w-3 h-3" /> Current
                </div>
              )}

              {/* Icon + Name */}
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${plan.accentColor} flex items-center justify-center shadow-lg shrink-0`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-textMain">{plan.name}</h3>
              </div>

              <p className="text-textMuted text-sm mb-6 min-h-[40px]">{plan.description}</p>

              {/* Price */}
              <div className="mb-6">
                <div className="flex items-end gap-1">
                  <span className="text-5xl font-extrabold text-textMain">${price}</span>
                  <span className="text-textMuted mb-1.5">/mo</span>
                  {annual && plan.monthlyPrice > 0 && (
                    <span className="text-xs text-textMuted line-through ml-1 mb-1.5">${plan.monthlyPrice}</span>
                  )}
                </div>
                {/* Annual total */}
                {annual && plan.annualPrice > 0 && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
                      <Check className="w-3 h-3" />
                      Billed ${plan.annualPrice * 12}/yr
                    </span>
                    <span className="text-xs text-textMuted line-through opacity-60">
                      ${plan.monthlyPrice * 12}/yr
                    </span>
                  </div>
                )}
              </div>


              {/* Features */}
              <ul className="space-y-3 flex-1 mb-8">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2.5 text-sm text-textMain">
                    <div className={`w-4 h-4 rounded-full bg-gradient-to-br ${plan.accentColor} flex items-center justify-center shrink-0`}>
                      <Check className="w-2.5 h-2.5 text-white" />
                    </div>
                    {feature}
                  </li>
                ))}
                {plan.notIncluded.map((feature) => (
                  <li key={feature} className="flex items-center gap-2.5 text-sm text-textMuted opacity-50">
                    <div className="w-4 h-4 rounded-full border border-borderMuted flex items-center justify-center shrink-0">
                      <X className="w-2.5 h-2.5" />
                    </div>
                    {feature}
                  </li>
                ))}
              </ul>

              {/* CTA Button */}
              <button
                onClick={(e) => { e.stopPropagation(); handleSelectPlan(plan.id); }}
                disabled={isCurrentPlan}
                className={`w-full py-3.5 rounded-xl font-bold transition-all text-sm
                  ${isCurrentPlan
                    ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 cursor-default'
                    : plan.id === 'pro'
                      ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white hover:from-indigo-600 hover:to-purple-700 shadow-lg shadow-indigo-500/20 hover:-translate-y-0.5 hover:shadow-indigo-500/30'
                      : 'bg-surface text-textMain border border-borderMuted hover:bg-surfaceHover hover:border-indigo-500/40 hover:-translate-y-0.5'
                  }
                `}
              >
                {isCurrentPlan ? '✓ ' + plan.button : plan.button}
              </button>
            </div>
          );
        })}
      </div>

      {/* Footer note */}
      <p className="mt-12 text-center text-sm text-textMuted relative z-10 max-w-md">
        All plans include a 14-day free trial. Cancel anytime. No credit card required for Free plan.
      </p>
    </div>
  );
}
