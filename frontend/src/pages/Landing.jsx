import { Link } from 'react-router-dom';
import { Bot, Mic, Play, ArrowRight, Shield, Zap, Moon, Sun, Star } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export default function Landing() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen flex flex-col items-center overflow-x-hidden bg-background relative isolate text-textMain transition-colors duration-300">
      {/* Background Gradients */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 rounded-full blur-[120px] -z-10 animate-pulse"></div>
      <div className="absolute top-[40%] right-[-10%] w-[30%] h-[50%] bg-purple-600/20 rounded-full blur-[140px] -z-10 animate-pulse delay-1000"></div>
      
      {/* Navbar Placeholder */}
      <nav className="fixed top-0 w-full flex justify-between items-center p-4 lg:px-12 z-50 glass">
        <div className="flex items-center gap-2 text-2xl font-bold tracking-tight text-textMain">
          <Bot className="text-primary w-8 h-8" />
          <span>JARVIS AI</span>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={toggleTheme} className="p-2 rounded-full hover:bg-surfaceHover text-textMuted transition-colors">
            {theme === 'dark' ? <Sun className="w-5 h-5 text-yellow-400" /> : <Moon className="w-5 h-5" />}
          </button>
          <Link to="/auth" className="px-5 py-2 rounded-full font-medium hover:bg-surfaceHover transition-colors border border-transparent hover:border-borderMuted text-textMain">
            Log In
          </Link>
          <Link to="/auth" className="hidden sm:block px-5 py-2 rounded-full font-medium bg-primary hover:bg-primaryDark text-white shadow-lg shadow-primary/30 transition-all hover:scale-105">
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col pt-40 pb-20 items-center text-center px-4 w-full max-w-6xl z-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 mb-8 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium animate-bounce backdrop-blur-md">
          <Zap className="w-4 h-4" />
          <span>JARVIS 2.0 Audio Engine is Live</span>
        </div>
        
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 leading-tight">
          Your Intelligent <br className="hidden md:block"/>
          <span className="gradient-text">Conversational Companion</span>
        </h1>
        
        <p className="text-textMuted text-lg md:text-xl max-w-2xl mb-10 leading-relaxed">
          JARVIS understands, reasons, and talks back to you in real-time. Experience the most advanced audio language model designed to augment your productivity.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 w-full justify-center">
          <Link to="/chat" className="flex items-center justify-center gap-2 bg-primary hover:bg-primaryDark text-white px-8 py-4 rounded-full text-lg font-semibold transition-all hover:shadow-lg hover:shadow-primary/40 hover:-translate-y-1">
            <Mic className="w-5 h-5" />
            Start Speaking Now
          </Link>
          <Link to="/pricing" className="flex items-center justify-center gap-2 bg-surface hover:bg-surfaceHover text-textMain border border-borderMuted px-8 py-4 rounded-full text-lg font-semibold transition-all hover:-translate-y-1">
            View Pricing <ArrowRight className="w-5 h-5" />
          </Link>
        </div>

        {/* Extended Feature Grid */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-32 w-full text-left">
          {[
            { icon: <Mic className="w-6 h-6 text-primary"/>, title: "Real-Time Audio", text: "Talk naturally with JARVIS. Zero latency pipeline for fluid voice interaction." },
            { icon: <Play className="w-6 h-6 text-purple-400"/>, title: "Expressive Voices", text: "Multiple emotive and human-like voices tailored for every context." },
            { icon: <Shield className="w-6 h-6 text-emerald-400"/>, title: "Secure & Private", text: "Enterprise-grade security ensures your conversations remain yours alone." },
            { icon: <Zap className="w-6 h-6 text-yellow-400"/>, title: "Lightning Fast API", text: "Integrate JARVIS anywhere using our well-documented and optimized endpoints." },
            { icon: <Bot className="w-6 h-6 text-pink-400"/>, title: "Cognitive Memory", text: "JARVIS remembers cross-session contexts, so you don't have to repeat yourself." },
            { icon: <Star className="w-6 h-6 text-blue-400"/>, title: "Custom Instructions", text: "Tailor the AI's persona, brevity, and tone to fit your exact workflow." }
          ].map((feature, i) => (
            <div key={i} className="glass p-8 rounded-2xl hover:bg-surfaceHover transition-all group cursor-default hover:-translate-y-1">
              <div className="bg-primary/10 w-12 h-12 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                {feature.icon}
              </div>
              <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
              <p className="text-textMuted leading-relaxed">{feature.text}</p>
            </div>
          ))}
        </section>

        {/* Call to action */}
        <div className="w-full mt-32 glass p-12 rounded-3xl text-center border-primary/20 relative overflow-hidden">
          <div className="absolute inset-0 bg-primary/5 -z-10"></div>
          <h2 className="text-3xl md:text-5xl font-bold mb-6">Ready to upgrade your workflow?</h2>
          <p className="text-lg text-textMuted max-w-2xl mx-auto mb-8">Join thousands of professionals scaling their output with JARVIS.</p>
          <Link to="/auth" className="inline-block bg-primary hover:bg-primaryDark text-white px-10 py-4 rounded-full text-lg font-bold shadow-lg shadow-primary/30 transition-transform hover:scale-105">
            Create Free Account
          </Link>
        </div>
      </main>
      
      {/* Footer */}
      <footer className="w-full py-8 text-center text-textMuted border-t border-borderMuted mt-auto glass">
        &copy; {new Date().getFullYear()} JARVIS Intelligence. All rights reserved.
      </footer>
    </div>
  );
}
