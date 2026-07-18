import { Check, ArrowLeft, Bot } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Pricing() {
  const { isAuthenticated } = useAuth();

  const plans = [
    {
      name: 'Free',
      price: '$0',
      description: 'Experience JARVIS Core capabilities.',
      features: ['Basic Audio Processing', 'Standard Text Context', 'Community Support', '50 Queries / Day'],
      button: 'Start for Free',
      popular: false
    },
    {
      name: 'Pro',
      price: '$20',
      description: 'For power users needing advanced latency control.',
      features: ['Zero Latency Audio Mode', 'Infinite Context Window', 'Priority Support', 'Unlimited Queries'],
      button: 'Upgrade to Pro',
      popular: true
    },
    {
      name: 'Ultra',
      price: '$50',
      description: 'Enterprise grade JARVIS deployment.',
      features: ['Custom Voice Clones', 'API Access', 'Dedicated Account Manager', 'SLA Guarantee'],
      button: 'Contact Sales',
      popular: false
    }
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col items-center py-20 px-4 relative overflow-hidden">
      {/* Background blobs */}
      <div className="absolute top-10 left-10 w-96 h-96 bg-primary/20 rounded-full blur-[120px] -z-10 animate-pulse" />
      <div className="absolute bottom-10 right-10 w-80 h-80 bg-purple-500/10 rounded-full blur-[100px] -z-10 animate-pulse" />

      {/* Header row */}
      <div className="w-full max-w-6xl mx-auto flex items-center justify-between mb-16 relative z-10">
        <Link
          to={isAuthenticated ? '/chat' : '/'}
          className="flex items-center text-textMuted hover:text-textMain transition-colors gap-1"
        >
          <ArrowLeft className="w-5 h-5" />
          {isAuthenticated ? 'Back to Chat' : 'Back to Home'}
        </Link>
        <div className="flex items-center gap-2 font-bold text-xl text-textMain">
          <Bot className="w-6 h-6 text-primary" />
          <span>JARVIS</span>
        </div>
      </div>

      {/* Title */}
      <div className="text-center mb-16 relative z-10">
        <h1 className="text-4xl md:text-5xl font-extrabold text-textMain mb-6">
          Simple, transparent pricing
        </h1>
        <p className="text-lg text-textMuted max-w-2xl mx-auto">
          No hidden fees, no surprise charges. Uncover the full potential of JARVIS with our selected plans.
        </p>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-6xl relative z-10">
        {plans.map((plan, index) => (
          <div
            key={index}
            className={`glass rounded-3xl p-8 relative flex flex-col transition-transform hover:-translate-y-2 hover:shadow-2xl
              ${plan.popular
                ? 'border-primary/50 shadow-primary/20 scale-105 ring-1 ring-primary/30'
                : 'border-borderMuted'
              }`}
          >
            {plan.popular && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gradient-to-r from-primary to-purple-500 text-white px-4 py-1 rounded-full text-sm font-bold shadow-lg">
                Most Popular
              </div>
            )}

            <h3 className="text-2xl font-bold text-textMain mb-2">{plan.name}</h3>
            <p className="text-textMuted mb-6 h-12">{plan.description}</p>

            <div className="mb-8">
              <span className="text-5xl font-extrabold text-textMain">{plan.price}</span>
              <span className="text-textMuted">/mo</span>
            </div>

            <ul className="space-y-4 flex-1 mb-8">
              {plan.features.map((feature, i) => (
                <li key={i} className="flex items-start text-textMain">
                  <Check className="w-5 h-5 text-emerald-500 shrink-0 mr-3 mt-0.5" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            <button
              className={`w-full py-4 rounded-xl font-bold transition-all text-sm
                ${plan.popular
                  ? 'bg-primary text-white hover:bg-primaryDark shadow-md shadow-primary/30'
                  : 'bg-surface text-textMain border border-borderMuted hover:bg-surfaceHover hover:border-primary/40'
                }`}
            >
              {plan.button}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
