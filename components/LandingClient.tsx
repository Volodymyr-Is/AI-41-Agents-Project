'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import {
  Dumbbell,
  Sparkles,
  Zap,
  Activity,
  Flame,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  PlusCircle,
  TrendingUp,
  ShieldCheck,
  RotateCcw
} from 'lucide-react';

export default function LandingPage() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ id: string; username: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    // Check if already logged in
    fetch('/api/auth/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) {
          setCurrentUser(data.user);
        }
      })
      .catch(() => {});
  }, []);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setLoading(true);

    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      setSuccessMsg(isLogin ? 'Welcome back! Redirecting...' : 'Account created! Redirecting...');
      setTimeout(() => {
        router.push('/exercise');
        router.refresh();
      }, 700);
    } catch (err: any) {
      setErrorMsg(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = () => {
    setUsername('athlete_pro');
    setPassword('fitness2026');
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar user={currentUser} onLogout={() => setCurrentUser(null)} />

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16 flex flex-col justify-center">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          {/* Left Column: Hero Copy & Feature List */}
          <div className="lg:col-span-7 space-y-8">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" /> Next-Gen AI Fitness Assistant
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-tight">
              Transform Your Training with <span className="gradient-text">AI-Powered</span> Sports Insights
            </h1>

            <p className="text-lg text-slate-300 max-w-2xl leading-relaxed">
              Log strength & cardio workouts with precision. FitPulse AI evaluates your sets, reps, pace, and volume to tell you exactly <strong className="text-emerald-300">what to remove</strong>, <strong className="text-cyan-300">what to improve</strong>, and <strong className="text-indigo-300">what to add</strong> for optimal progressive overload.
            </p>

            {/* Value Props */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div className="glass-panel p-4 rounded-xl border-slate-800 space-y-2">
                <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <h2 className="font-semibold text-white text-sm">Cut Junk Volume</h2>
                <p className="text-xs text-slate-400">Identify redundant fatigue exercises and injury-prone patterns.</p>
              </div>

              <div className="glass-panel p-4 rounded-xl border-slate-800 space-y-2">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                  <Zap className="w-4 h-4" />
                </div>
                <h2 className="font-semibold text-white text-sm">Optimize Pacing</h2>
                <p className="text-xs text-slate-400">Dial in your tempo, rest intervals, and target cardio heart zones.</p>
              </div>

              <div className="glass-panel p-4 rounded-xl border-slate-800 space-y-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <PlusCircle className="w-4 h-4" />
                </div>
                <h2 className="font-semibold text-white text-sm">Smart Additions</h2>
                <p className="text-xs text-slate-400">Unlock missing agonist/antagonist balance and mobility work.</p>
              </div>
            </div>

            {/* Quick Demo CTA if already logged in */}
            {currentUser && (
              <div className="pt-2">
                <button
                  onClick={() => router.push('/exercise')}
                  className="inline-flex items-center gap-3 px-6 py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-bold shadow-xl shadow-emerald-500/25 transition-all hover:scale-[1.02]"
                >
                  <Activity className="w-5 h-5" />
                  <span>Go to Your Exercise Diary ({currentUser.username})</span>
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>

          {/* Right Column: Authentication Card */}
          <div className="lg:col-span-5">
            <div className="glass-panel p-8 rounded-2xl border-slate-800 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-cyan-500 to-indigo-500" />
              
              {/* Tab Switcher */}
              <div className="flex bg-slate-900/90 p-1 rounded-xl mb-6 border border-slate-800">
                <button
                  type="button"
                  onClick={() => { setIsLogin(true); setErrorMsg(''); setSuccessMsg(''); }}
                  className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
                    isLogin
                      ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-slate-950 shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => { setIsLogin(false); setErrorMsg(''); setSuccessMsg(''); }}
                  className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
                    !isLogin
                      ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-slate-950 shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Register
                </button>
              </div>

              <div className="mb-6">
                <h2 className="text-xl font-bold text-white">
                  {isLogin ? 'Access Your Sports Diary' : 'Create Your Athlete Account'}
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  {isLogin
                    ? 'Enter your credentials to manage workouts and AI coaching logs.'
                    : 'Start your personalized AI training log today.'}
                </p>
              </div>

              {errorMsg && (
                <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {successMsg && (
                <div className="mb-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              <form onSubmit={handleAuthSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">Username</label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. AlexTrainer"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-slate-900/90 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 text-sm transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">Password</label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-slate-900/90 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 text-sm transition-all"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-bold text-sm shadow-lg shadow-emerald-500/20 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>{isLogin ? 'Sign In & View Workouts' : 'Create Free Account'}</span>
                    </>
                  )}
                </button>
              </form>

              {/* Demo auto-fill option */}
              <div className="mt-5 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                <span>Want to test quickly?</span>
                <button
                  type="button"
                  onClick={handleDemoLogin}
                  className="text-emerald-400 hover:text-emerald-300 font-medium underline underline-offset-2 flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" /> Auto-fill Demo User
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/60 py-6 text-center text-xs text-slate-500">
        <p>FitPulse AI Sports Diary &bull; Powered by Google Gemini &amp; Sports Science Framework</p>
      </footer>
    </div>
  );
}
