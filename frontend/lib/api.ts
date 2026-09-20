import type { Attempt, AttemptResult, AdminAttemptSummary, TopicStat } from './types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.detail) message = body.detail;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export function createAttempt(firstName: string, lastName: string): Promise<Attempt> {
  return request<Attempt>('/api/attempts', {
    method: 'POST',
    body: JSON.stringify({ first_name: firstName, last_name: lastName }),
  });
}

export function getAttempt(id: string): Promise<Attempt> {
  return request<Attempt>(`/api/attempts/${id}`);
}

export function saveAnswers(id: string, answers: (number | null)[]): Promise<{ ok: true }> {
  return request(`/api/attempts/${id}/answers`, {
    method: 'PATCH',
    body: JSON.stringify({ answers }),
  });
}

export function submitAttempt(id: string): Promise<AttemptResult> {
  return request<AttemptResult>(`/api/attempts/${id}/submit`, { method: 'POST' });
}

export function adminListAttempts(passcode: string): Promise<AdminAttemptSummary[]> {
  return request<AdminAttemptSummary[]>('/api/admin/attempts', {
    headers: { 'X-Admin-Passcode': passcode },
  });
}

export function adminAttemptDetail(id: string, passcode: string) {
  return request<{
    first_name: string;
    last_name: string;
    submitted: boolean;
    score_total: number;
    pct: number;
    passed: boolean;
    topic_stats: Record<string, TopicStat>;
  }>(`/api/admin/attempts/${id}/detail`, { headers: { 'X-Admin-Passcode': passcode } });
}

export function adminTopics(passcode: string): Promise<Record<string, TopicStat>> {
  return request(`/api/admin/topics`, { headers: { 'X-Admin-Passcode': passcode } });
}
