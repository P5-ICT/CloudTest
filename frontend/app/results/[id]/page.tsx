'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { submitAttempt } from '@/lib/api';
import type { AttemptResult } from '@/lib/types';

function fmtTime(seconds: number | null): string {
  if (seconds === null) return '—';
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((v) => String(v).padStart(2, '0')).join(':');
}

function csvEscape(v: unknown): string {
  const s = String(v === undefined || v === null ? '' : v);
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export default function ResultsPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const searchParams = useSearchParams();
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [name, setName] = useState<{ first: string; last: string }>({ first: '', last: '' });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const f = sessionStorage.getItem('candidateFirstName') || '';
    const l = sessionStorage.getItem('candidateLastName') || '';
    setName({ first: f, last: l });

    submitAttempt(id)
      .then(setResult)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load your results.'));
  }, [id]);

  function downloadCsv() {
    if (!result?.detail) return;
    const rows: (string | number)[][] = [];
    rows.push(['Name', `${name.first} ${name.last}`]);
    rows.push(['Total score', `${result.score_total} / ${result.detail.length}`]);
    rows.push(['Section A score', `${result.score_a} / 50`]);
    rows.push(['Section B score', `${result.score_b} / 70`]);
    rows.push(['Percentage', `${result.pct}%`]);
    rows.push(['Pass mark', `${result.pass_mark ?? 80}%`]);
    rows.push(['Result', result.passed ? 'PASS' : 'FAIL']);
    rows.push(['Time taken', fmtTime(result.time_taken_seconds)]);
    rows.push([]);
    rows.push(['Q#', 'Section', 'Topic', 'Your answer', 'Correct answer', 'Correct?']);
    result.detail.forEach((d) => {
      rows.push([d.id, d.section, d.topic_label, d.your_answer ?? '(no answer)', d.correct_answer, d.correct ? 'Yes' : 'No']);
    });
    const csv = rows.map((r) => r.map(csvEscape).join(',')).join('\r\n');
    const filename = `${(name.last || 'candidate').replace(/[^a-zA-Z0-9\-_]+/g, '_')}_${(name.first || '').replace(/[^a-zA-Z0-9\-_]+/g, '_')}_cloud-test-results.csv`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function copySummary() {
    if (!result) return;
    const text = `${name.first} ${name.last} — Cloud Computing Knowledge Check\nResult: ${result.passed ? 'PASS' : 'FAIL'} (pass mark ${result.pass_mark ?? 80}%)\nScore: ${result.score_total}/120 (${result.pct}%)\nSection A: ${result.score_a}/50 · Section B: ${result.score_b}/70\nTime taken: ${fmtTime(result.time_taken_seconds)}`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard may be unavailable; CSV download still works */
    }
  }

  if (error) {
    return (
      <div className="center-screen">
        <div className="card fade-in">
          <div className="eyebrow">SOMETHING WENT WRONG</div>
          <h1 className="title">Couldn&apos;t load your results</h1>
          <div className="subtitle">{error}</div>
          <button className="btn btn-primary btn-full" onClick={() => router.push('/')}>Back to start</button>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="center-screen">
        <div className="subtitle">Scoring your test…</div>
      </div>
    );
  }

  return (
    <div className="center-screen">
      <div className="card results-wrap fade-in">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/pillar5-logo.png" alt="Pillar 5" className="brand-logo" />
        <div className="eyebrow">RESULTS · {name.first.toUpperCase()} {name.last.toUpperCase()}</div>

        {searchParams.get('auto') === '1' && (
          <div className="notice">Time&apos;s up — your test was submitted automatically.</div>
        )}

        <div className="score-hero">
          <div className={`tier-pill ${result.passed ? 'pass' : 'fail'}`}>{result.passed ? 'PASS' : 'FAIL'}</div>
          <div className="score-big">{result.score_total}<span style={{ fontSize: '1.6rem', color: 'var(--muted)' }}>/120</span></div>
          <div className="score-sub">{result.pct}% overall · pass mark is {result.pass_mark ?? 80}%</div>
        </div>

        <div className="results-grid">
          <div className="meta-item"><div className="num">{result.score_a}/50</div><div className="lbl">Section A — Foundations</div></div>
          <div className="meta-item"><div className="num">{result.score_b}/70</div><div className="lbl">Section B — Applied</div></div>
          <div className="meta-item"><div className="num">{fmtTime(result.time_taken_seconds)}</div><div className="lbl">Time taken</div></div>
          <div className="meta-item"><div className="num">120</div><div className="lbl">Questions total</div></div>
        </div>

        <div className="results-actions">
          <button className="btn btn-primary btn-full" onClick={downloadCsv}>Download my results (CSV)</button>
          <button className="btn btn-secondary btn-full" onClick={copySummary}>Copy summary to clipboard</button>
        </div>
        <div className="small-note">Your results are already saved — no need to send them anywhere unless your facilitator asks.</div>
      </div>
    </div>
  );
}
