'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, Fragment } from 'react';
import { adminAttemptDetail, adminListAttempts, adminTopics } from '@/lib/api';
import type { AdminAttemptSummary, TopicStat } from '@/lib/types';

function fmtTime(seconds: number | null): string {
  if (seconds === null) return '—';
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((v) => String(v).padStart(2, '0')).join(':');
}
function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}
function tierClass(pct: number): string {
  return pct >= 80 ? 'strong' : pct >= 60 ? 'ok' : 'weak';
}
function csvEscape(v: unknown): string {
  const s = String(v === undefined || v === null ? '' : v);
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export default function AdminPage() {
  const router = useRouter();
  const [passcode, setPasscode] = useState('');
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState(false);

  const [attempts, setAttempts] = useState<AdminAttemptSummary[]>([]);
  const [topics, setTopics] = useState<Record<string, TopicStat>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, Record<string, TopicStat>>>({});
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(
    async (code: string) => {
      try {
        const [a, t] = await Promise.all([adminListAttempts(code), adminTopics(code)]);
        setAttempts(a.slice().sort((x, y) => (y.pct ?? -1) - (x.pct ?? -1)));
        setTopics(t);
        setLoadError(null);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : 'Could not load results.');
      }
    },
    []
  );

  async function login() {
    try {
      await adminListAttempts(passcode);
      setAuthed(true);
      setAuthError(false);
      refresh(passcode);
    } catch {
      setAuthError(true);
    }
  }

  // light auto-refresh so "in progress" candidates update without a manual click
  useEffect(() => {
    if (!authed) return;
    const interval = setInterval(() => refresh(passcode), 20000);
    return () => clearInterval(interval);
  }, [authed, passcode, refresh]);

  async function toggleDetail(a: AdminAttemptSummary) {
    const key = a.id;
    if (expanded === key) {
      setExpanded(null);
      return;
    }
    setExpanded(key);
    if (!detailCache[key] && a.submitted) {
      try {
        const d = await adminAttemptDetail(a.id, passcode);
        setDetailCache((prev) => ({ ...prev, [key]: d.topic_stats }));
      } catch {
        /* silently ignore — row still expands, just without topic detail */
      }
    }
  }

  function downloadCohortCsv() {
    const rows: (string | number)[][] = [];
    rows.push(['Generated', new Date().toLocaleString()]);
    const submittedCount = attempts.filter((a) => a.submitted).length;
    const passed = attempts.filter((a) => a.passed).length;
    rows.push(['Submissions', submittedCount]);
    rows.push(['In progress', attempts.length - submittedCount]);
    rows.push(['Passed', passed]);
    rows.push(['Failed', submittedCount - passed]);
    rows.push([]);
    rows.push(['Topic', 'Cohort % correct', 'Correct', 'Total']);
    Object.values(topics).forEach((t) => rows.push([t.label, `${t.pct}%`, t.correct, t.total]));
    rows.push([]);
    rows.push(['Name', 'Status', 'Score', '%', 'Section A', 'Section B', 'Result', 'Time taken', 'Started', 'Finished']);
    attempts.forEach((a) =>
      rows.push([
        `${a.first_name} ${a.last_name}`,
        a.submitted ? 'Submitted' : 'In progress',
        a.score_total ?? '',
        a.pct ?? '',
        a.score_a ?? '',
        a.score_b ?? '',
        a.passed === null ? '' : a.passed ? 'PASS' : 'FAIL',
        fmtTime(a.time_taken_seconds),
        fmtDate(a.started_at),
        fmtDate(a.finished_at),
      ])
    );
    const csv = rows.map((r) => r.map(csvEscape).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const el = document.createElement('a');
    el.href = url;
    el.download = 'cloud-test-cohort-summary.csv';
    document.body.appendChild(el);
    el.click();
    el.remove();
    URL.revokeObjectURL(url);
  }

  if (!authed) {
    return (
      <div className="center-screen">
        <div className="card fade-in">
          <div className="eyebrow">FACILITATOR ACCESS</div>
          <h1 className="title">Results dashboard</h1>
          <div className="subtitle">Enter the facilitator passcode to continue.</div>
          <div className="field">
            <label htmlFor="passcode">Passcode</label>
            <input
              id="passcode"
              className="text-input"
              type="password"
              autoComplete="off"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && login()}
            />
            {authError && <div className="error-text">Incorrect passcode.</div>}
          </div>
          <button className="btn btn-primary btn-full" onClick={login}>Enter</button>
          <button className="btn btn-secondary btn-full" style={{ marginTop: 10 }} onClick={() => router.push('/')}>
            Back to test
          </button>
        </div>
      </div>
    );
  }

  const submittedCount = attempts.filter((a) => a.submitted).length;
  const inProgressCount = attempts.length - submittedCount;
  const passedCount = attempts.filter((a) => a.passed).length;
  const failedCount = submittedCount - passedCount;
  const avgPct = submittedCount
    ? Math.round((attempts.filter((a) => a.submitted).reduce((s, a) => s + (a.pct ?? 0), 0) / submittedCount) * 10) / 10
    : 0;
  const sortedTopics = Object.values(topics).sort((a, b) => a.pct - b.pct);

  return (
    <div className="admin-page fade-in">
      <div className="admin-header">
        <div className="admin-header-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/pillar5-logo.png" alt="Pillar 5" className="brand-logo-sm" />
          <div>
            <div className="eyebrow">FACILITATOR DASHBOARD</div>
            <h1 className="title" style={{ fontSize: '1.5rem' }}>Cloud Computing Knowledge Check — results</h1>
          </div>
        </div>
        <button className="btn btn-secondary" onClick={() => router.push('/')}>Exit dashboard</button>
      </div>

      {loadError && <div className="notice" style={{ borderLeftColor: 'var(--danger)' }}>{loadError}</div>}

      {attempts.length === 0 ? (
        <div className="notice">No one has started the test yet. This page refreshes automatically every 20 seconds.</div>
      ) : (
        <>
          <div className="admin-summary-grid">
            <div className="meta-item"><div className="num">{attempts.length}</div><div className="lbl">Started</div></div>
            <div className="meta-item"><div className="num" style={{ color: 'var(--sectionB)' }}>{inProgressCount}</div><div className="lbl">In progress</div></div>
            <div className="meta-item"><div className="num" style={{ color: 'var(--accent-dim)' }}>{passedCount}</div><div className="lbl">Passed</div></div>
            <div className="meta-item"><div className="num" style={{ color: 'var(--danger)' }}>{failedCount}</div><div className="lbl">Failed</div></div>
          </div>

          {submittedCount > 0 && (
            <>
              <h4 className="admin-subhead">Cohort strength by topic <span className="admin-subhead-note">(weakest first, {avgPct}% average)</span></h4>
              <div className="topic-bars">
                {sortedTopics.map((t) => (
                  <div className="topic-bar-row" key={t.label}>
                    <div className="topic-bar-label">{t.label}</div>
                    <div className="topic-bar-track"><div className={`topic-bar-fill ${tierClass(t.pct)}`} style={{ width: `${t.pct}%` }} /></div>
                    <div className="topic-bar-pct">{t.pct}%</div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="admin-table-head">
            <h4 className="admin-subhead" style={{ marginBottom: 0 }}>Candidates</h4>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-secondary" style={{ padding: '9px 14px', fontSize: '.82rem' }} onClick={() => refresh(passcode)}>
                Refresh
              </button>
              <button className="btn btn-secondary" style={{ padding: '9px 14px', fontSize: '.82rem' }} onClick={downloadCohortCsv}>
                Download cohort CSV
              </button>
            </div>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>Name</th><th>Status</th><th>Score</th><th>%</th><th>Sec A</th><th>Sec B</th><th>Time</th><th>Started</th><th></th></tr>
              </thead>
              <tbody>
                {attempts.map((a) => {
                  const key = a.id;
                  const isOpen = expanded === key;
                  const statusLabel = !a.submitted ? 'In progress' : a.passed ? 'PASS' : 'FAIL';
                  const statusClass = !a.submitted ? 'progress' : a.passed ? 'pass' : 'fail';
                  const candTopics = detailCache[key] ? Object.values(detailCache[key]).sort((x, y) => x.pct - y.pct) : null;
                  return (
                    <Fragment key={key}>
                      <tr>
                        <td>{a.first_name} {a.last_name}</td>
                        <td><span className={`status-tag ${statusClass}`}>{statusLabel}</span></td>
                        <td>{a.submitted ? `${a.score_total}/120` : '—'}</td>
                        <td>{a.submitted ? `${a.pct}%` : '—'}</td>
                        <td>{a.submitted ? `${a.score_a}/50` : '—'}</td>
                        <td>{a.submitted ? `${a.score_b}/70` : '—'}</td>
                        <td>{a.submitted ? fmtTime(a.time_taken_seconds) : '—'}</td>
                        <td>{fmtDate(a.started_at)}</td>
                        <td><button className="row-link" onClick={() => toggleDetail(a)}>{isOpen ? 'Hide' : 'Details'}</button></td>
                      </tr>
                      {isOpen && (
                        <tr className="cand-detail">
                          <td colSpan={9}>
                            {!a.submitted ? (
                              <span style={{ color: 'var(--muted)', fontSize: '.85rem' }}>Still in progress — topic breakdown appears once submitted.</span>
                            ) : candTopics ? (
                              <div className="topic-bars" style={{ marginTop: 4, padding: '14px 16px' }}>
                                {candTopics.map((t) => (
                                  <div className="topic-bar-row" key={t.label}>
                                    <div className="topic-bar-label">{t.label}</div>
                                    <div className="topic-bar-track"><div className={`topic-bar-fill ${tierClass(t.pct)}`} style={{ width: `${t.pct}%` }} /></div>
                                    <div className="topic-bar-pct">{t.pct}%</div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span style={{ color: 'var(--muted)', fontSize: '.85rem' }}>Loading…</span>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
