/** Shape of preflights.report as written by the analyzer (BUILD_PLAN §6.6). */

export type CheckStatus = "pass" | "warn" | "fail" | "na" | "info" | "error";
export type Severity = "high" | "medium" | "low" | "info";
export type Group =
  | "hook"
  | "format"
  | "readability"
  | "message"
  | "compliance"
  | "audio"
  | "technical";
export type Verdict = "ready" | "fix_first" | "not_ready";

export type Check = {
  id: string;
  group: Group;
  status: CheckStatus;
  severity: Severity;
  title: string;
  explanation: string;
  fix: string | null;
  timestamp_s: number | null;
  evidence: Record<string, unknown> & { frame_url?: string; box?: number[] };
  estimate: boolean;
};

export type ProgressStep = {
  step: string;
  label: string;
  status: "pending" | "running" | "done" | "error";
};

export type FixItem = {
  n: number;
  check_id: string;
  fix: string;
  timestamp_s: number | null;
  status: CheckStatus;
};

export type GroupScore = {
  group: Group;
  weight: number;
  effective_weight: number;
  score: number;
  counted: number;
  excluded: number;
};

export type Report = {
  version: number;
  progress: ProgressStep[];
  error?: string;
  score?: number;
  verdict?: Verdict;
  score_breakdown?: {
    groups: GroupScore[];
    uncounted_groups: Group[];
    caps: string[];
    raw_score: number;
  };
  checks?: Check[];
  fix_list?: FixItem[];
  transcript?: { start: number; end: number; text: string }[];
  meta?: {
    duration_s: number;
    width: number;
    height: number;
    platform: string;
    ai_review_error?: string | null;
  };
};

/** Normalised [x, y, w, h], origin top-left. */
export type Box = [number, number, number, number];

export type Region = {
  name: string;
  platform: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type OcrBox = { text: string; confidence: number; box: Box };
export type ReportFrame = { t: number; url: string; ocr: OcrBox[] };
