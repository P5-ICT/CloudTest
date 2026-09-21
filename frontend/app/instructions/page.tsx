'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createAttempt } from '@/lib/api';

export default function InstructionsPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const f = sessionStorage.getItem('candidateFirstName');
    const l = sessionStorage.getItem('candidateLastName');
    if (!f || !l) {
      router.replace('/');
      return;
    }
    setFirstName(f);
    setLastName(l);
  }, [router]);

  async function handleStart() {
    setStarting(true);
    setError(null);
    try {
      await document.documentElement.requestFullscreen?.()?.catch(() => {});
      const attempt = await createAttempt(firstName, lastName);
      localStorage.setItem(`attempt:${attempt.id}`, JSON.stringify(attempt));
      localStorage.setItem('lastAttemptId', attempt.id);
      router.push(`/test/${attempt.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the test. Please try again.');
      setStarting(false);
    }
  }

  return (
    <div className="center-screen">
      <div className="card fade-in">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/pillar5-logo.png" alt="Pillar 5" className="brand-logo" />
        <div className="eyebrow">HI, {firstName.toUpperCase()} {lastName.toUpperCase()}</div>
        <h1 className="title">Assessment overview</h1>
        <div className="subtitle">Read this before you press start — the timer begins the moment you do.</div>

        <div className="section-list">
          <div className="section-row">
            <div className="section-tag a">A</div>
            <div>
              <h3>Section A — Foundations · Q1–50</h3>
              <p>Core definitions and concepts. Easier warm-up questions.</p>
            </div>
          </div>
          <div className="section-row">
            <div className="section-tag b">B</div>
            <div>
              <h3>Section B — Applied Scenarios · Q51–120</h3>
              <p>Scenario-based questions — pick the best recommendation for the situation described.</p>
            </div>
          </div>
        </div>

        <div className="meta-grid">
          <div className="meta-item"><div className="num">120</div><div className="lbl">Total questions</div></div>
          <div className="meta-item"><div className="num">2:00:00</div><div className="lbl">Time limit</div></div>
          <div className="meta-item"><div className="num">1</div><div className="lbl">Mark per question</div></div>
          <div className="meta-item"><div className="num">MCQ</div><div className="lbl">Single best answer</div></div>
        </div>

        <div className="notice">
          The timer runs continuously once started and auto-submits your test at 00:00:00. You can move
          freely between questions and change answers any time before submitting. Your progress is saved
          to the server as you go, so an accidental refresh won&apos;t lose your answers — but don&apos;t
          close the tab or switch devices mid-test.
        </div>

        {error && <div className="error-text" style={{ marginBottom: 14 }}>{error}</div>}

        <button className="btn btn-primary btn-full" onClick={handleStart} disabled={starting || !firstName}>
          {starting ? 'Starting…' : 'Start test'}
        </button>
      </div>
    </div>
  );
}
