import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'FitPulse AI | Спортивний щоденник з ШІ',
  description: 'Smart sports diary that analyzes your strength & cardio workouts with AI to recommend improvements, eliminate junk volume, and optimize performance.',
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="uk" className="dark">
      <body className="bg-slate-950 text-slate-100 min-h-screen antialiased selection:bg-emerald-500/30 selection:text-emerald-200">
        <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl" />
          <div className="absolute top-1/3 -left-40 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-40 right-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl" />
        </div>
        {children}
      </body>
    </html>
  );
}
