/**
 * Parse the creator's own posts from pasted text or a CSV (BUILD_PLAN §8.1).
 * No scraping: we only ever read what the creator gives us. Pure.
 */

export type ImportedPost = {
  url: string | null;
  platform: "tiktok" | "instagram" | "youtube" | "other" | null;
  postedAt: string | null; // YYYY-MM-DD
  caption: string;
};

export type ImportResult = { posts: ImportedPost[]; skipped: { line: number; reason: string }[] };

export const MAX_POSTS = 500;
export const MAX_CAPTION = 5000;

const URL_RE = /^https?:\/\/\S+/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function platformOf(url: string | null): ImportedPost["platform"] {
  if (!url) return null;
  let host: string;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
  if (host.endsWith("tiktok.com")) return "tiktok";
  if (host.endsWith("instagram.com")) return "instagram";
  if (host.endsWith("youtube.com") || host === "youtu.be") return "youtube";
  return "other";
}

function isoDate(v: string | undefined): string | null {
  const s = (v ?? "").trim();
  if (DATE_RE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`))) return s;
  const t = Date.parse(s);
  return s && !Number.isNaN(t) ? new Date(t).toISOString().slice(0, 10) : null;
}

function finish(result: ImportResult): ImportResult {
  const seen = new Set<string>();
  const posts: ImportedPost[] = [];
  for (const p of result.posts) {
    const caption = p.caption.trim().slice(0, MAX_CAPTION);
    if (!caption) continue;
    if (p.url) {
      if (seen.has(p.url)) continue;
      seen.add(p.url);
    }
    posts.push({ ...p, caption });
  }
  return { posts: posts.slice(0, MAX_POSTS), skipped: result.skipped };
}

/**
 * One post per URL. The caption follows the URL on the same line and/or on
 * the lines below it, up to the next URL. A leading YYYY-MM-DD in the caption
 * is taken as the posting date.
 */
export function parsePasted(text: string): ImportResult {
  const posts: ImportedPost[] = [];
  const skipped: ImportResult["skipped"] = [];
  let current: ImportedPost | null = null;

  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const match = line.match(URL_RE);
    if (match) {
      if (current) posts.push(current);
      const url = match[0].replace(/[),.]+$/, "");
      let rest = line.slice(match[0].length).replace(/^[\s|,;:–-]+/, "");
      const date = rest.match(/^(\d{4}-\d{2}-\d{2})[\s|,;:–-]*/);
      let postedAt: string | null = null;
      if (date) {
        postedAt = isoDate(date[1]);
        rest = rest.slice(date[0].length);
      }
      current = { url, platform: platformOf(url), postedAt, caption: rest };
    } else if (current) {
      current.caption += (current.caption ? "\n" : "") + line;
    } else {
      skipped.push({ line: i + 1, reason: "Text before the first post link" });
    }
  });
  if (current) posts.push(current);
  return finish({ posts, skipped });
}

/** RFC 4180-ish CSV: quoted fields, "" escapes, commas and newlines inside quotes. */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim()));
}

/** CSV with a header row containing `caption` and optionally `url`, `posted_at`. */
export function parseCsv(text: string): ImportResult {
  const rows = parseCsvRows(text.replace(/^﻿/, ""));
  if (rows.length === 0) return { posts: [], skipped: [] };
  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const col = (names: string[]) => header.findIndex((h) => names.includes(h));
  const urlCol = col(["url", "link", "post_url"]);
  const dateCol = col(["posted_at", "date", "posted", "created_at"]);
  const captionCol = col(["caption", "text", "description"]);
  if (captionCol === -1) {
    return { posts: [], skipped: [{ line: 1, reason: "No `caption` column in the header" }] };
  }
  const posts: ImportedPost[] = [];
  const skipped: ImportResult["skipped"] = [];
  rows.slice(1).forEach((r, i) => {
    const caption = (r[captionCol] ?? "").trim();
    if (!caption) {
      skipped.push({ line: i + 2, reason: "Empty caption" });
      return;
    }
    const rawUrl = urlCol >= 0 ? (r[urlCol] ?? "").trim() : "";
    const url = URL_RE.test(rawUrl) ? rawUrl : null;
    posts.push({
      url,
      platform: platformOf(url),
      postedAt: dateCol >= 0 ? isoDate(r[dateCol]) : null,
      caption,
    });
  });
  return finish({ posts, skipped });
}
