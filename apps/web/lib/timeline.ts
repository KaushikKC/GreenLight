/** Gantt geometry for the Rights Wallet timeline. Pure. */

import { addDays, addMonths, daysBetween, type Deal, type RightsWindow } from "./rights";

const MAX_SPAN_DAYS = 3 * 365;
const PAD_DAYS = 14;

export type Bar = {
  window: RightsWindow;
  leftPct: number;
  widthPct: number;
  /** Runs past the right edge (perpetual, or ends after the visible range). */
  continues: boolean;
};

export type Timeline = {
  start: string;
  end: string;
  todayPct: number;
  months: { label: string; pct: number }[];
  rows: { deal: Deal; bars: Bar[] }[];
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function buildTimeline(deals: Deal[], windows: RightsWindow[], today: string): Timeline {
  const dated = windows.filter((w) => w.startsAt);
  const starts = dated.map((w) => w.startsAt!);
  const ends = dated.flatMap((w) => (w.perpetual || !w.endsAt ? [] : [w.endsAt]));
  let start = addDays([today, ...starts].sort()[0], -PAD_DAYS);
  let end = addDays([addDays(today, 60), ...ends].sort().at(-1)!, PAD_DAYS);
  if (daysBetween(start, end) > MAX_SPAN_DAYS) {
    // Keep today in view: a year back at most, the rest forward.
    start = [start, addDays(today, -365)].sort().at(-1)!;
    end = addDays(start, MAX_SPAN_DAYS);
  }
  const span = daysBetween(start, end);
  const pct = (d: string) => Math.min(100, Math.max(0, (daysBetween(start, d) / span) * 100));

  const months: Timeline["months"] = [];
  let m = `${start.slice(0, 7)}-01`;
  if (m < start) m = addMonths(m, 1);
  const step = span > 540 ? 3 : 1;
  while (m <= end) {
    const [y, mo] = m.split("-").map(Number);
    months.push({ label: mo === 1 ? `${MONTHS[mo - 1]} ${y}` : MONTHS[mo - 1], pct: pct(m) });
    m = addMonths(m, step);
  }

  const rows = deals.map((deal) => ({
    deal,
    bars: dated
      .filter((w) => w.dealId === deal.id)
      .map((w) => {
        const open = w.perpetual || !w.endsAt || w.endsAt > end;
        const left = pct(w.startsAt!);
        const right = open ? 100 : pct(w.endsAt!);
        return { window: w, leftPct: left, widthPct: Math.max(right - left, 0.8), continues: open };
      })
      .filter((b) => b.leftPct < 100),
  }));

  return { start, end, todayPct: pct(today), months, rows };
}
