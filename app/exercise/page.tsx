'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import {
  ExerciseItem,
  StrengthExercise,
  CardioExercise,
  AIAnalysis,
  WorkoutSession,
} from '@/lib/types';
import {
  Dumbbell,
  HeartPulse,
  Plus,
  Trash2,
  Sparkles,
  CheckCircle2,
  AlertOctagon,
  TrendingUp,
  PlusCircle,
  Save,
  Clock,
  Gauge,
  Calendar,
  Layers,
  ChevronDown,
  Info,
  Zap,
  RotateCcw,
  Award,
  ArrowRight,
  Flame
} from 'lucide-react';
import confetti from 'canvas-confetti';

export default function ExercisePage() {
  const router = useRouter();
  const [user, setUser] = useState<{ id: string; username: string } | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  // Workout state
  const [workoutTitle, setWorkoutTitle] = useState('My Workout Session');
  const [exercises, setExercises] = useState<ExerciseItem[]>([
    {
      id: 'ex_1',
      type: 'strength',
      name: 'Barbell Bench Press',
      sets: 4,
      reps: 10,
      weight: 70,
    },
    {
      id: 'ex_2',
      type: 'cardio',
      name: 'Treadmill Interval Run',
      distance: 3.5,
      speed: 10.5,
      time: 20,
    },
  ]);

  // AI Analysis state
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AIAnalysis | null>(null);
  const [analysisError, setAnalysisError] = useState('');

  // History state
  const [history, setHistory] = useState<WorkoutSession[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<'logger' | 'history'>('logger');

  const loadWorkoutHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch('/api/workouts');
      if (res.ok) {
        const data = await res.json();
        setHistory(data.workouts || []);
      }
    } catch (err) {
      console.error('Failed to load history', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Verify auth on mount
  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => {
        if (!res.ok) throw new Error('Unauthorized');
        return res.json();
      })
      .then((data) => {
        if (data?.user) {
          setUser(data.user);
          void loadWorkoutHistory();
        } else {
          router.push('/');
        }
      })
      .catch(() => {
        router.push('/');
      })
      .finally(() => {
        setLoadingUser(false);
      });
  }, [router]);

  // Add exercise block
  const addStrengthBlock = () => {
    const newEx: StrengthExercise = {
      id: 'ex_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5),
      type: 'strength',
      name: '',
      sets: 3,
      reps: 10,
      weight: 50,
    };
    setExercises((prev) => [...prev, newEx]);
  };

  const addCardioBlock = () => {
    const newEx: CardioExercise = {
      id: 'ex_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5),
      type: 'cardio',
      name: '',
      distance: 3.0,
      speed: 10.0,
      time: 20,
    };
    setExercises((prev) => [...prev, newEx]);
  };

  const removeBlock = (id: string) => {
    setExercises((prev) => prev.filter((ex) => ex.id !== id));
  };

  const updateExerciseField = (id: string, field: string, value: any) => {
    setExercises((prev) =>
      prev.map((ex) => {
        if (ex.id === id) {
          return { ...ex, [field]: value };
        }
        return ex;
      })
    );
  };

  // Quick preset loader
  const loadPreset = (type: 'strength' | 'cardio' | 'hybrid') => {
    if (type === 'strength') {
      setWorkoutTitle('Heavy Push Day Workout');
      setExercises([
        { id: 'p1', type: 'strength', name: 'Barbell Bench Press', sets: 4, reps: 8, weight: 80 },
        { id: 'p2', type: 'strength', name: 'Incline Dumbbell Press', sets: 3, reps: 10, weight: 26 },
        { id: 'p3', type: 'strength', name: 'Overhead Shoulder Press', sets: 4, reps: 8, weight: 50 },
        { id: 'p4', type: 'strength', name: 'Triceps Rope Pushdown', sets: 3, reps: 15, weight: 35 },
      ]);
    } else if (type === 'cardio') {
      setWorkoutTitle('5K Tempo & Sprints Cardio');
      setExercises([
        { id: 'c1', type: 'cardio', name: 'Outdoor 5K Tempo Run', distance: 5.0, speed: 11.5, time: 26 },
        { id: 'c2', type: 'cardio', name: 'HIIT Rowing Sprints', distance: 1.5, speed: 14.0, time: 8 },
      ]);
    } else {
      setWorkoutTitle('Hybrid Conditioning Session');
      setExercises([
        { id: 'h1', type: 'strength', name: 'Barbell Back Squats', sets: 4, reps: 8, weight: 100 },
        { id: 'h2', type: 'strength', name: 'Pull-ups', sets: 3, reps: 10, weight: 0 },
        { id: 'h3', type: 'cardio', name: 'Assault Bike Intervals', distance: 4.0, speed: 12.0, time: 15 },
      ]);
    }
  };

  // Trigger AI Analysis
  const handleAnalyze = async () => {
    if (exercises.length === 0) {
      setAnalysisError('Please add at least one exercise block first.');
      return;
    }

    setAnalyzing(true);
    setAnalysisError('');
    setAnalysisResult(null);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exercises }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to analyze workout');
      }

      setAnalysisResult(data.analysis);

      // Trigger celebration confetti
      try {
        confetti({
          particleCount: 80,
          spread: 60,
          origin: { y: 0.6 },
          colors: ['#10b981', '#06b6d4', '#3b82f6'],
        });
      } catch {}
    } catch (err: any) {
      setAnalysisError(err.message || 'Error occurred during AI analysis');
    } finally {
      setAnalyzing(false);
    }
  };

  // Save workout & analysis to diary
  const handleSaveToDiary = async () => {
    if (exercises.length === 0) return;

    try {
      const res = await fetch('/api/workouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: workoutTitle,
          exercises,
          analysis: analysisResult || undefined,
        }),
      });

      if (res.ok) {
        setSavedSuccess(true);
        loadWorkoutHistory();
        setTimeout(() => setSavedSuccess(false), 3000);
      }
    } catch (err) {
      console.error('Failed to save workout', err);
    }
  };

  const handleDeleteHistory = async (id: string) => {
    if (!confirm('Are you sure you want to delete this workout entry?')) return;
    try {
      const res = await fetch(`/api/workouts/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setHistory((prev) => prev.filter((w) => w.id !== id));
      }
    } catch (err) {
      console.error('Failed to delete workout', err);
    }
  };

  if (loadingUser) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-400 font-medium">Loading sports diary...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <Navbar user={user} onLogout={() => router.push('/')} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Top Header & Tab Controls */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-3">
              <span className="gradient-text">Workout Diary</span> &amp; AI Coach
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Add your strength and cardio exercise blocks, then run AI analysis for sports-science recommendations.
            </p>
          </div>

          {/* Navigation Tab */}
          <div className="flex bg-slate-900/90 p-1 rounded-xl border border-slate-800 self-stretch sm:self-auto">
            <button
              onClick={() => setActiveTab('logger')}
              className={`flex-1 sm:flex-initial px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-all ${
                activeTab === 'logger'
                  ? 'bg-emerald-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Dumbbell className="w-4 h-4" />
              <span>Current Workout</span>
            </button>
            <button
              onClick={() => {
                setActiveTab('history');
                loadWorkoutHistory();
              }}
              className={`flex-1 sm:flex-initial px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-all ${
                activeTab === 'history'
                  ? 'bg-emerald-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span>Diary History ({history.length})</span>
            </button>
          </div>
        </div>

        {activeTab === 'logger' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Left Column: Workout Creator & Exercise Blocks */}
            <div className="lg:col-span-7 space-y-6">
              
              {/* Workout Title & Presets Bar */}
              <div className="glass-panel p-5 rounded-2xl border-slate-800 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex-1">
                    <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      Workout Session Title
                    </label>
                    <input
                      type="text"
                      value={workoutTitle}
                      onChange={(e) => setWorkoutTitle(e.target.value)}
                      placeholder="e.g. Upper Body Hypertrophy"
                      className="w-full bg-slate-900/90 border border-slate-700/80 rounded-lg px-3.5 py-2 text-sm text-white font-medium focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none"
                    />
                  </div>
                  
                  {/* Preset Buttons */}
                  <div className="sm:text-right">
                    <span className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      Quick Presets
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => loadPreset('strength')}
                        className="text-xs px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                      >
                        Push Day
                      </button>
                      <button
                        type="button"
                        onClick={() => loadPreset('cardio')}
                        className="text-xs px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                      >
                        5K Cardio
                      </button>
                      <button
                        type="button"
                        onClick={() => loadPreset('hybrid')}
                        className="text-xs px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                      >
                        Hybrid
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Exercise Blocks List */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-emerald-400" />
                    <span>Workout Exercise Blocks ({exercises.length})</span>
                  </h2>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={addStrengthBlock}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-semibold transition-all"
                    >
                      <Dumbbell className="w-3.5 h-3.5" />
                      <span>+ Strength Block</span>
                    </button>
                    <button
                      type="button"
                      onClick={addCardioBlock}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 text-xs font-semibold transition-all"
                    >
                      <HeartPulse className="w-3.5 h-3.5" />
                      <span>+ Cardio Block</span>
                    </button>
                  </div>
                </div>

                {exercises.length === 0 ? (
                  <div className="glass-panel p-8 rounded-2xl border-dashed border-slate-800 text-center space-y-3">
                    <Dumbbell className="w-10 h-10 text-slate-600 mx-auto" />
                    <p className="text-sm text-slate-400">No exercise blocks added yet.</p>
                    <div className="flex justify-center gap-3 pt-2">
                      <button
                        onClick={addStrengthBlock}
                        className="px-4 py-2 rounded-lg bg-emerald-500/20 text-emerald-300 text-xs font-semibold hover:bg-emerald-500/30 transition-all"
                      >
                        + Add Strength Exercise
                      </button>
                      <button
                        onClick={addCardioBlock}
                        className="px-4 py-2 rounded-lg bg-cyan-500/20 text-cyan-300 text-xs font-semibold hover:bg-cyan-500/30 transition-all"
                      >
                        + Add Cardio Exercise
                      </button>
                    </div>
                  </div>
                ) : (
                  exercises.map((item, index) => (
                    <div
                      key={item.id}
                      className={`glass-panel p-5 rounded-2xl border transition-all ${
                        item.type === 'cardio'
                          ? 'border-cyan-500/20 hover:border-cyan-500/40 bg-gradient-to-br from-slate-900/90 to-cyan-950/20'
                          : 'border-emerald-500/20 hover:border-emerald-500/40 bg-gradient-to-br from-slate-900/90 to-emerald-950/20'
                      }`}
                    >
                      {/* Block Header */}
                      <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-800/80">
                        <div className="flex items-center gap-2.5">
                          <span className="w-6 h-6 rounded-full bg-slate-800 text-xs font-bold flex items-center justify-center text-slate-300">
                            {index + 1}
                          </span>
                          <span
                            className={`text-xs px-2.5 py-0.5 rounded-full font-semibold uppercase tracking-wider flex items-center gap-1.5 ${
                              item.type === 'cardio'
                                ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            }`}
                          >
                            {item.type === 'cardio' ? (
                              <>
                                <HeartPulse className="w-3 h-3" /> Cardio Block
                              </>
                            ) : (
                              <>
                                <Dumbbell className="w-3 h-3" /> Strength / Non-Cardio
                              </>
                            )}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeBlock(item.id)}
                          className="text-slate-500 hover:text-red-400 p-1 rounded-md hover:bg-red-500/10 transition-colors"
                          title="Remove block"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Block Fields */}
                      {item.type === 'strength' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5">
                          {/* Exercise Name */}
                          <div className="sm:col-span-6">
                            <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                              Exercise Name
                            </label>
                            <input
                              type="text"
                              value={item.name}
                              onChange={(e) => updateExerciseField(item.id, 'name', e.target.value)}
                              placeholder="e.g. Barbell Squat, Push-up, Bicep Curl"
                              className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs sm:text-sm text-white placeholder-slate-500 focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                            />
                          </div>

                          {/* Sets / Times */}
                          <div className="sm:col-span-2">
                            <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                              Sets / Times
                            </label>
                            <input
                              type="number"
                              min="1"
                              max="99"
                              value={item.sets}
                              onChange={(e) => updateExerciseField(item.id, 'sets', Number(e.target.value))}
                              className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                            />
                          </div>

                          {/* Reps */}
                          <div className="sm:col-span-2">
                            <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                              Reps
                            </label>
                            <input
                              type="number"
                              min="1"
                              max="999"
                              value={item.reps}
                              onChange={(e) => updateExerciseField(item.id, 'reps', Number(e.target.value))}
                              className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                            />
                          </div>

                          {/* Weight (kg) */}
                          <div className="sm:col-span-2">
                            <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                              Weight (kg)
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="0.5"
                              value={item.weight ?? ''}
                              onChange={(e) => updateExerciseField(item.id, 'weight', e.target.value ? Number(e.target.value) : undefined)}
                              placeholder="kg"
                              className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5">
                          {/* Cardio Exercise Name */}
                          <div className="sm:col-span-5">
                            <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                              Cardio Activity
                            </label>
                            <input
                              type="text"
                              value={item.name}
                              onChange={(e) => updateExerciseField(item.id, 'name', e.target.value)}
                              placeholder="e.g. Treadmill, Outdoor Cycling, Rowing"
                              className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs sm:text-sm text-white placeholder-slate-500 focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 outline-none"
                            />
                          </div>

                          {/* Distance (km) */}
                          <div className="sm:col-span-2">
                            <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                              Distance (km)
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="0.1"
                              value={item.distance}
                              onChange={(e) => updateExerciseField(item.id, 'distance', Number(e.target.value))}
                              className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 outline-none"
                            />
                          </div>

                          {/* Speed (km/h) */}
                          <div className="sm:col-span-2">
                            <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                              Speed (km/h)
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="0.1"
                              value={item.speed}
                              onChange={(e) => updateExerciseField(item.id, 'speed', Number(e.target.value))}
                              className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 outline-none"
                            />
                          </div>

                          {/* Time (minutes) */}
                          <div className="sm:col-span-3">
                            <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                              Time (minutes)
                            </label>
                            <input
                              type="number"
                              min="1"
                              value={item.time}
                              onChange={(e) => updateExerciseField(item.id, 'time', Number(e.target.value))}
                              className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 outline-none"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Action Toolbar: Analyze Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleAnalyze}
                  disabled={analyzing || exercises.length === 0}
                  className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-extrabold text-base shadow-xl shadow-emerald-500/25 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-3 relative overflow-hidden group"
                >
                  {analyzing ? (
                    <>
                      <div className="w-5 h-5 border-3 border-slate-950 border-t-transparent rounded-full animate-spin" />
                      <span>AI Coach is analyzing your workout...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5 group-hover:rotate-12 transition-transform" />
                      <span>Analyze Workout with AI Coach</span>
                      <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </button>
              </div>

              {analysisError && (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2.5">
                  <AlertOctagon className="w-4 h-4 shrink-0" />
                  <span>{analysisError}</span>
                </div>
              )}
            </div>

            {/* Right Column: AI Analysis Report Panel */}
            <div className="lg:col-span-5 space-y-6">
              {analysisResult ? (
                <div className="glass-panel p-6 rounded-2xl border-emerald-500/40 shadow-2xl space-y-6 relative overflow-hidden animate-fadeIn">
                  
                  {/* Top Badge & Score */}
                  <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-5">
                    <div>
                      <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-bold uppercase tracking-wider flex items-center gap-1.5 w-fit">
                        <Sparkles className="w-3.5 h-3.5" /> AI Coach Report
                      </span>
                      <h3 className="text-lg font-bold text-white mt-2">Analysis &amp; Recommendations</h3>
                    </div>

                    {/* Workout Score Badge */}
                    <div className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-slate-900/90 border border-slate-700/80 min-w-[70px]">
                      <span className="text-2xl font-black gradient-text">{analysisResult.score}</span>
                      <span className="text-[9px] uppercase font-bold text-slate-400">Score / 100</span>
                    </div>
                  </div>

                  {/* Summary */}
                  <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 text-xs sm:text-sm text-slate-300 leading-relaxed italic">
                    &ldquo;{analysisResult.summary}&rdquo;
                  </div>

                  {/* Key Metrics */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                        <Clock className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-semibold block">Recovery Time</span>
                        <span className="text-sm font-bold text-white">{analysisResult.estimatedRecoveryHours} Hours</span>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                        <Award className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-semibold block">Categories</span>
                        <span className="text-xs font-semibold text-emerald-300">
                          {analysisResult.tags?.join(', ') || 'Fitness'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 1. What to Remove */}
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2 text-red-400 font-bold text-xs uppercase tracking-wider">
                      <div className="w-5 h-5 rounded-md bg-red-500/15 flex items-center justify-center">
                        <AlertOctagon className="w-3.5 h-3.5" />
                      </div>
                      <span>1. What to Remove / Eliminate</span>
                    </div>
                    <div className="space-y-1.5 pl-7">
                      {analysisResult.remove.map((item, idx) => (
                        <div key={idx} className="p-2.5 rounded-lg bg-red-950/20 border border-red-900/30 text-xs text-red-200/90 leading-relaxed flex items-start gap-2">
                          <span className="text-red-400 font-bold">•</span>
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 2. What to Improve */}
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2 text-cyan-400 font-bold text-xs uppercase tracking-wider">
                      <div className="w-5 h-5 rounded-md bg-cyan-500/15 flex items-center justify-center">
                        <TrendingUp className="w-3.5 h-3.5" />
                      </div>
                      <span>2. What to Improve / Refine</span>
                    </div>
                    <div className="space-y-1.5 pl-7">
                      {analysisResult.improve.map((item, idx) => (
                        <div key={idx} className="p-2.5 rounded-lg bg-cyan-950/20 border border-cyan-900/30 text-xs text-cyan-200/90 leading-relaxed flex items-start gap-2">
                          <span className="text-cyan-400 font-bold">•</span>
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 3. What to Add */}
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
                      <div className="w-5 h-5 rounded-md bg-emerald-500/15 flex items-center justify-center">
                        <PlusCircle className="w-3.5 h-3.5" />
                      </div>
                      <span>3. What to Add Next Time</span>
                    </div>
                    <div className="space-y-1.5 pl-7">
                      {analysisResult.add.map((item, idx) => (
                        <div key={idx} className="p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-900/30 text-xs text-emerald-200/90 leading-relaxed flex items-start gap-2">
                          <span className="text-emerald-400 font-bold">•</span>
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Save to Diary Button */}
                  <div className="pt-2 border-t border-slate-800 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={handleSaveToDiary}
                      className="w-full py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs sm:text-sm border border-slate-700 flex items-center justify-center gap-2 transition-all hover:border-emerald-500/50"
                    >
                      <Save className="w-4 h-4 text-emerald-400" />
                      <span>Save Workout &amp; AI Analysis to History</span>
                    </button>

                    {savedSuccess && (
                      <div className="p-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold text-center flex items-center justify-center gap-2">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Saved to your Sports Diary!</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Empty state / placeholder before analysis */
                <div className="glass-panel p-8 rounded-2xl border-slate-800 text-center space-y-5">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto text-emerald-400">
                    <Sparkles className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">AI Coach Waiting</h3>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1.5 leading-relaxed">
                      Configure your workout blocks on the left and hit <strong className="text-emerald-300">&ldquo;Analyze Workout with AI&rdquo;</strong> to generate detailed sports science recommendations.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 text-left space-y-2 text-xs text-slate-400">
                    <div className="font-semibold text-slate-300 flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 text-cyan-400" /> What AI evaluates:
                    </div>
                    <ul className="space-y-1 list-disc list-inside text-slate-400">
                      <li>Non-cardio: Volume, rep ranges, progressive load balance</li>
                      <li>Cardio: Pace, distance duration, heart stress zone</li>
                      <li>Hybrid fatigue &amp; central nervous system recovery</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* History View */
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Calendar className="w-5 h-5 text-emerald-400" />
                <span>Your Past Workout Sessions</span>
              </h2>
              <span className="text-xs text-slate-400">
                {history.length} {history.length === 1 ? 'entry' : 'entries'} recorded
              </span>
            </div>

            {loadingHistory ? (
              <div className="py-12 text-center text-slate-400 text-sm">Loading history...</div>
            ) : history.length === 0 ? (
              <div className="glass-panel p-12 rounded-2xl border-slate-800 text-center space-y-3">
                <Calendar className="w-12 h-12 text-slate-600 mx-auto" />
                <h3 className="text-base font-bold text-white">No workouts recorded yet</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  Create and analyze a workout session on the Exercise Logger tab to save it to your diary.
                </p>
                <button
                  onClick={() => setActiveTab('logger')}
                  className="px-4 py-2 rounded-lg bg-emerald-500 text-slate-950 text-xs font-bold hover:bg-emerald-400 transition-all"
                >
                  Create Your First Workout
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {history.map((session) => (
                  <div
                    key={session.id}
                    className="glass-panel p-6 rounded-2xl border-slate-800 hover:border-slate-700 space-y-4 relative transition-all"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-bold text-white text-base">{session.title}</h3>
                        <span className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                          <Calendar className="w-3 h-3" /> {new Date(session.createdAt).toLocaleDateString()} at{' '}
                          {new Date(session.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {session.analysis && (
                          <div className="px-2 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
                            Score: {session.analysis.score}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteHistory(session.id)}
                          className="text-slate-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
                          title="Delete entry"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Exercises Summary List */}
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
                        Exercises ({session.exercises.length}):
                      </span>
                      <div className="grid grid-cols-1 gap-1.5">
                        {session.exercises.map((ex, i) => (
                          <div
                            key={i}
                            className="text-xs px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 flex items-center justify-between"
                          >
                            <span className="font-medium text-slate-200 flex items-center gap-1.5">
                              {ex.type === 'cardio' ? (
                                <HeartPulse className="w-3.5 h-3.5 text-cyan-400" />
                              ) : (
                                <Dumbbell className="w-3.5 h-3.5 text-emerald-400" />
                              )}
                              {ex.name}
                            </span>
                            <span className="text-slate-400 text-[11px]">
                              {ex.type === 'cardio'
                                ? `${ex.distance} km • ${ex.speed} km/h • ${ex.time}m`
                                : `${ex.sets} sets × ${ex.reps} reps ${ex.weight ? `(${ex.weight}kg)` : ''}`}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* AI Insights Summary if exists */}
                    {session.analysis && (
                      <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2 text-xs">
                        <span className="text-[10px] uppercase font-bold text-emerald-400 flex items-center gap-1">
                          <Sparkles className="w-3 h-3" /> Coach Takeaways:
                        </span>
                        <div className="space-y-1 text-slate-300">
                          {session.analysis.improve[0] && (
                            <p className="text-cyan-300">⚡ <strong>Improve:</strong> {session.analysis.improve[0]}</p>
                          )}
                          {session.analysis.add[0] && (
                            <p className="text-emerald-300">➕ <strong>Add:</strong> {session.analysis.add[0]}</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
