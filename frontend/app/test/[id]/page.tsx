'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getAttempt, saveAnswers, submitAttempt } from '@/lib/api';
import type { Attempt } from '@/lib/types';

function fmtTime(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

export default function TestPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();

  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const warnedTen = useRef(false);
  const warnedTwo = useRef(false);
  const finishing = useRef(false);

  // trap the back/forward buttons — once the test has started, leaving via
  // browser navigation just re-lands back on this same page
  useEffect(() => {
    window.history.pushState(null, '', window.location.href);
    const onPopState = () => {
      window.history.pushState(null, '', window.location.href);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // warn on accidental tab close/refresh mid-test
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  // load attempt (cache-first, then refresh from server)
  useEffect(() => {
    const cached = localStorage.getItem(`attempt:${id}`);
    if (cached) {
      try {
        const parsed: Attempt = JSON.parse(cached);
        setAttempt(parsed);
        setAnswers(parsed.answers);
      } catch {
        /* ignore bad cache */
      }
    }
    getAttempt(id)
      .then((fresh) => {
        if (fresh.submitted) {
          router.replace(`/results/${id}`);
          return;
        }
        setAttempt(fresh);
        setAnswers(fresh.answers);
        localStorage.setItem(`attempt:${id}`, JSON.stringify(fresh));
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Could not load this attempt.'));
  }, [id, router]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4500);
  }, []);

  const doSubmit = useCallback(
    async (auto: boolean) => {
      if (finishing.current) return;
      finishing.current = true;
      setSubmitting(true);
      try {
        await submitAttempt(id);
        localStorage.removeItem(`attempt:${id}`);
        if (document.fullscreenElement) {
          await document.exitFullscreen().catch(() => {});
        }
        router.push(`/results/${id}${auto ? '?auto=1' : ''}`);
      } catch (e) {
        finishing.current = false;
        setSubmitting(false);
        showToast(e instanceof Error ? e.message : 'Could not submit — please try again.');
      }
    },
    [id, router, showToast]
  );

  // timer
  useEffect(() => {
    if (!attempt) return;
    const deadline = new Date(attempt.deadline).getTime();
    const tick = () => {
      const remaining = deadline - Date.now();
      setRemainingMs(remaining);
      if (remaining <= 10 * 60 * 1000 && !warnedTen.current) {
        warnedTen.current = true;
        showToast('10 minutes remaining.');
      }
      if (remaining <= 2 * 60 * 1000 && !warnedTwo.current) {
        warnedTwo.current = true;
        showToast('2 minutes remaining — wrap up.');
      }
      if (remaining <= 0) {
        doSubmit(true);
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [attempt, doSubmit, showToast]);

  function selectOption(optionIndex: number) {
    setAnswers((prev) => {
      const next = prev.slice();
      next[currentIndex] = optionIndex;
      if (attempt) {
        const updatedAttempt = { ...attempt, answers: next };
        localStorage.setItem(`attempt:${id}`, JSON.stringify(updatedAttempt));
      }
      saveAnswers(id, next).catch(() => showToast("Couldn't save that answer — check your connection."));
      return next;
    });
  }

  function goTo(i: number) {
    if (!attempt) return;
    setCurrentIndex(Math.max(0, Math.min(attempt.questions.length - 1, i)));
  }

  if (loadError) {
    return (
      <div className="center-screen">
        <div className="card fade-in">
          <div className="eyebrow">SOMETHING WENT WRONG</div>
          <h1 className="title">Couldn&apos;t load this test</h1>
          <div className="subtitle">{loadError}</div>
          <button className="btn btn-primary btn-full" onClick={() => router.push('/')}>Start over</button>
        </div>
      </div>
    );
  }

  if (!attempt) {
    return (
      <div className="center-screen">
        <div className="subtitle">Loading…</div>
      </div>
    );
  }

  const total = attempt.questions.length;
  const q = attempt.questions[currentIndex];
  const answeredCount = answers.filter((a) => a !== null && a !== undefined).length;
  const secLabel = q.section === 'A' ? 'Section A · Foundations' : 'Section B · Applied Scenarios';
  const timerClass =
    remainingMs !== null && remainingMs <= 2 * 60 * 1000
      ? 'critical'
      : remainingMs !== null && remainingMs <= 10 * 60 * 1000
      ? 'low'
      : '';

  function NavDots({ from, to, small }: { from: number; to: number; small?: boolean }) {
    return (
      <div className={small ? 'q-mobile-nav' : 'nav-grid'}>
        {Array.from({ length: to - from }, (_, k) => {
          const i = from + k;
          const isAnswered = answers[i] !== null && answers[i] !== undefined;
          const isCurrent = i === currentIndex;
          return (
            <button
              key={i}
              className={`nav-dot ${isAnswered ? 'answered' : ''} ${isCurrent ? 'current' : ''}`}
              onClick={() => goTo(i)}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div>
      {toast && <div className="toast">{toast}</div>}

      <div className="topbar">
        <div className="who">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/pillar5-logo.png" alt="Pillar 5" className="brand-logo-sm" />
          <div>
            <div className="name">{attempt.first_name} {attempt.last_name}</div>
            <div className="progress-txt">{answeredCount} / {total} answered</div>
          </div>
        </div>
        <div className="timer-wrap">
          <div className={`timer ${timerClass}`}>{remainingMs !== null ? fmtTime(remainingMs) : '--:--:--'}</div>
          <button className="btn btn-danger" style={{ padding: '10px 16px', fontSize: '.85rem' }} onClick={() => setShowSubmitModal(true)}>
            Submit
          </button>
        </div>
      </div>

      <div className="test-layout">
        <div className="nav-panel">
          <h4>SECTION A · Q1–50</h4>
          <NavDots from={0} to={50} />
          <h4>SECTION B · Q51–120</h4>
          <NavDots from={50} to={total} />
          <div className="legend">
            <span><i className="answered" />Answered</span>
            <span><i className="unanswered" />Unanswered</span>
          </div>
        </div>

        <div className="question-col">
          <NavDots from={0} to={total} small />
          <div className="q-card fade-in" key={currentIndex}>
            <div className="q-topline">
              <span className="q-num">Question {currentIndex + 1} of {total}</span>
              <span className={`q-badge ${q.section === 'A' ? 'a' : 'b'}`}>{secLabel}</span>
            </div>
            <div className="q-stem">{q.stem}</div>
            <div className="options">
              {q.options.map((opt, i) => (
                <button
                  key={i}
                  className={`option ${answers[currentIndex] === i ? 'selected' : ''}`}
                  onClick={() => selectOption(i)}
                >
                  <span className="opt-badge">{String.fromCharCode(65 + i)}</span>
                  <span>{opt}</span>
                </button>
              ))}
            </div>
            <div className="q-footer-nav">
              <button className="btn btn-secondary" disabled={currentIndex === 0} onClick={() => goTo(currentIndex - 1)}>
                ← Previous
              </button>
              <button
                className="btn btn-primary"
                onClick={() => (currentIndex === total - 1 ? setShowSubmitModal(true) : goTo(currentIndex + 1))}
              >
                {currentIndex === total - 1 ? 'Review & submit' : 'Next →'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="bottombar">
        <button className="btn btn-secondary" disabled={currentIndex === 0} onClick={() => goTo(currentIndex - 1)}>←</button>
        <button className="btn btn-danger" onClick={() => setShowSubmitModal(true)}>Submit</button>
        <button className="btn btn-primary" onClick={() => (currentIndex === total - 1 ? setShowSubmitModal(true) : goTo(currentIndex + 1))}>
          {currentIndex === total - 1 ? 'Review' : 'Next →'}
        </button>
      </div>

      {showSubmitModal && (
        <div className="modal-backdrop">
          <div className="modal fade-in">
            <h3>Submit your test?</h3>
            <p>
              {total - answeredCount > 0
                ? `You have ${total - answeredCount} unanswered question${total - answeredCount === 1 ? '' : 's'}. Once submitted, you can't change any answers.`
                : `All questions answered. Once submitted, you can't change any answers.`}
            </p>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowSubmitModal(false)} disabled={submitting}>
                Keep working
              </button>
              <button className="btn btn-danger" onClick={() => doSubmit(false)} disabled={submitting}>
                {submitting ? 'Submitting…' : 'Submit now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
