export type Question = {
  id: number;
  section: 'A' | 'B';
  topic: string;
  topic_label: string;
  stem: string;
  options: string[];
};

export type AttemptResult = {
  score_total: number;
  score_a: number;
  score_b: number;
  pct: number;
  passed: boolean;
  pass_mark?: number;
  time_taken_seconds: number | null;
  detail?: QuestionDetail[];
};

export type QuestionDetail = {
  id: number;
  section: 'A' | 'B';
  topic: string;
  topic_label: string;
  your_answer: string | null;
  correct_answer: string;
  correct: boolean;
};

export type Attempt = {
  id: string;
  first_name: string;
  last_name: string;
  deadline: string;
  submitted: boolean;
  answers: (number | null)[];
  questions: Question[];
  result?: AttemptResult;
};

export type AdminAttemptSummary = {
  id: string;
  first_name: string;
  last_name: string;
  started_at: string | null;
  finished_at: string | null;
  submitted: boolean;
  score_total: number | null;
  score_a: number | null;
  score_b: number | null;
  pct: number | null;
  passed: boolean | null;
  time_taken_seconds: number | null;
};

export type TopicStat = { label: string; correct: number; total: number; pct: number };
