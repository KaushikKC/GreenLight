/**
 * Rights Wallet logic (BUILD_PLAN §7.3). Pure functions, unit-tested.
 * Dates are ISO calendar dates ("YYYY-MM-DD"); a null end on a perpetual
 * window means "forever".
 */

export type WindowKind = "usage" | "whitelisting" | "exclusivity";

export type RightsWindow = {
  id: string;
  dealId: string;
  brand: string;
  kind: WindowKind;
  scope: "organic" | "paid" | null;
  platforms: string[];
  territories: string[];
  category: string | null;
  startsAt: string | null;
  endsAt: string | null;
  perpetual: boolean;
  durationText?: string | null;
  sourceQuote?: string | null;
};

export type Deal = {
  id: string;
  brand: string;
  category: string | null;
  campaign: string | null;
  feeAmount: number | null;
  feeCurrency: string | null;
  paymentDueAt: string | null;
  paid: boolean;
};

export type Offer = {
  brand: string;
  category: string;
  start: string;
  end: string;
};

export type Category = { id: string; label: string; keywords: string[] };

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;
const FOREVER = "9999-12-31";

const toMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
export const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "2026-09-23" → "23 Sep 2026". Fixed month names rather than Intl, so the
 * server and every browser render the same string (no hydration mismatch).
 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** Today's date (UTC) for request-time use. */
export const todayIso = () => toIso(Date.now());

export function daysBetween(from: string, to: string): number {
  return Math.round((toMs(to) - toMs(from)) / DAY_MS);
}

export function addDays(iso: string, days: number): string {
  return toIso(toMs(iso) + days * DAY_MS);
}

/** Calendar-aware month add (31 Jan + 1 month → 28/29 Feb). */
export function addMonths(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return toIso(d.getTime());
}

const endOf = (w: Pick<RightsWindow, "endsAt" | "perpetual">) =>
  w.perpetual ? FOREVER : w.endsAt;

/** Inclusive date ranges overlap; a null end means open-ended. */
export function rangesOverlap(
  aStart: string,
  aEnd: string | null,
  bStart: string,
  bEnd: string | null,
): boolean {
  return aStart <= (bEnd ?? FOREVER) && bStart <= (aEnd ?? FOREVER);
}

// ---------------------------------------------------------------------------
// Durations ("90 days", "twelve (12) months", "1 year")
// ---------------------------------------------------------------------------

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, eighteen: 18, twenty: 20,
  thirty: 30, sixty: 60, ninety: 90,
};

export type Duration = { amount: number; unit: "day" | "week" | "month" | "year" };

export function parseDuration(text: string | null | undefined): Duration | null {
  if (!text) return null;
  const t = text.toLowerCase();
  const m = t.match(/(\d+|[a-z]+)\s*(?:\((\d+)\)\s*)?(day|week|month|year)s?\b/);
  if (!m) return null;
  const amount = m[2] ? Number(m[2]) : /^\d+$/.test(m[1]) ? Number(m[1]) : WORD_NUMBERS[m[1]];
  if (!amount) return null;
  return { amount, unit: m[3] as Duration["unit"] };
}

export function addDuration(start: string, d: Duration): string {
  switch (d.unit) {
    case "day":
      return addDays(start, d.amount);
    case "week":
      return addDays(start, d.amount * 7);
    case "month":
      return addMonths(start, d.amount);
    case "year":
      return addMonths(start, d.amount * 12);
  }
}

/** End date for a relative window once the creator supplies the start date. */
export function suggestEnd(start: string, durationText: string | null | undefined): string | null {
  const d = parseDuration(durationText);
  return d ? addDuration(start, d) : null;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function isActive(w: RightsWindow, date: string): boolean {
  if (!w.startsAt) return false;
  const end = endOf(w);
  return w.startsAt <= date && (end === null || date <= end);
}

export function activeWindows(windows: RightsWindow[], date: string): RightsWindow[] {
  return windows.filter((w) => isActive(w, date));
}

export function expiringWithin(
  windows: RightsWindow[],
  today: string,
  days: number,
): (RightsWindow & { daysLeft: number })[] {
  const limit = addDays(today, days);
  return windows
    .filter((w) => !w.perpetual && w.endsAt && w.endsAt >= today && w.endsAt <= limit)
    .map((w) => ({ ...w, daysLeft: daysBetween(today, w.endsAt!) }))
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

export function overduePayments(
  deals: Deal[],
  today: string,
): (Deal & { daysOverdue: number })[] {
  return deals
    .filter((d) => !d.paid && d.paymentDueAt && d.paymentDueAt < today)
    .map((d) => ({ ...d, daysOverdue: daysBetween(d.paymentDueAt!, today) }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue);
}

export function paymentsDueSoon(
  deals: Deal[],
  today: string,
  days: number,
): (Deal & { daysLeft: number })[] {
  const limit = addDays(today, days);
  return deals
    .filter((d) => !d.paid && d.paymentDueAt && d.paymentDueAt >= today && d.paymentDueAt <= limit)
    .map((d) => ({ ...d, daysLeft: daysBetween(today, d.paymentDueAt!) }))
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

// ---------------------------------------------------------------------------
// Categories and exclusivity
// ---------------------------------------------------------------------------

const norm = (s: string) => s.trim().toLowerCase();
const sameBrand = (a: string, b: string) => norm(a) === norm(b);

/** Free text ("face serum", "Skincare") → category id, "other" if unknown. */
export function normalizeCategory(text: string, categories: Category[]): string {
  const t = norm(text);
  if (!t) return "other";
  for (const c of categories) {
    if (c.id === t || norm(c.label) === t) return c.id;
  }
  for (const c of categories) {
    if (c.keywords.some((k) => t.includes(k))) return c.id;
  }
  return "other";
}

export type Conflict = {
  window: RightsWindow;
  from: string;
  to: string | null;
};

/** Active exclusivity windows that an offer would break. */
export function exclusivityConflicts(offer: Offer, windows: RightsWindow[]): Conflict[] {
  return windows
    .filter(
      (w) =>
        w.kind === "exclusivity" &&
        w.startsAt !== null &&
        w.category !== null &&
        w.category === offer.category &&
        w.category !== "other" &&
        !sameBrand(w.brand, offer.brand) &&
        rangesOverlap(w.startsAt, endOf(w), offer.start, offer.end),
    )
    .map((w) => {
      const end = endOf(w);
      return {
        window: w,
        from: w.startsAt! > offer.start ? w.startsAt! : offer.start,
        to: end === null || end > offer.end ? offer.end : end,
      };
    });
}

export type DealConflict = { exclusivity: RightsWindow; other: Deal; from: string; to: string | null };

/**
 * Deals already in the wallet that clash: deal B is in a category that deal
 * A's exclusivity covers, and B's rights windows overlap that exclusivity.
 */
export function dealConflicts(deals: Deal[], windows: RightsWindow[]): DealConflict[] {
  const out: DealConflict[] = [];
  for (const ex of windows) {
    if (ex.kind !== "exclusivity" || !ex.startsAt || !ex.category || ex.category === "other") continue;
    for (const other of deals) {
      if (other.id === ex.dealId || other.category !== ex.category || sameBrand(other.brand, ex.brand)) continue;
      const theirs = windows.filter((w) => w.dealId === other.id && w.startsAt);
      const clash = theirs.find((w) => rangesOverlap(ex.startsAt!, endOf(ex), w.startsAt!, endOf(w)));
      if (clash) {
        const exEnd = endOf(ex);
        const clashEnd = endOf(clash);
        out.push({
          exclusivity: ex,
          other,
          from: ex.startsAt > clash.startsAt! ? ex.startsAt : clash.startsAt!,
          to: exEnd === null ? clashEnd : clashEnd === null ? exEnd : exEnd < clashEnd ? exEnd : clashEnd,
        });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

export type AlertKind = "overdue" | "conflict" | "expiring" | "due_soon";

export type Alert = {
  kind: AlertKind;
  severity: "high" | "medium";
  title: string;
  date: string | null;
  dealId: string;
};

const KIND_LABEL: Record<WindowKind, string> = {
  usage: "Usage rights",
  whitelisting: "Whitelisting",
  exclusivity: "Exclusivity",
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function formatMoney(amount: number | null, currency: string | null): string {
  if (amount === null) return "";
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: currency ?? "GBP",
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency ?? ""}`.trim();
  }
}

export function buildAlerts(
  deals: Deal[],
  windows: RightsWindow[],
  today: string,
  cfg: { expiringDays: number; dueSoonDays: number },
): Alert[] {
  const alerts: Alert[] = [];
  for (const d of overduePayments(deals, today)) {
    const money = formatMoney(d.feeAmount, d.feeCurrency);
    alerts.push({
      kind: "overdue",
      severity: "high",
      title: `Payment${money ? ` of ${money}` : ""} from ${d.brand} was due ${plural(d.daysOverdue, "day")} ago`,
      date: d.paymentDueAt,
      dealId: d.id,
    });
  }
  for (const c of dealConflicts(deals, windows)) {
    alerts.push({
      kind: "conflict",
      severity: "high",
      title: `Exclusivity conflict: ${c.exclusivity.category} with ${c.exclusivity.brand} overlaps ${c.other.brand}`,
      date: c.from,
      dealId: c.other.id,
    });
  }
  for (const w of expiringWithin(windows, today, cfg.expiringDays)) {
    const when = w.daysLeft === 0 ? "today" : `in ${plural(w.daysLeft, "day")}`;
    alerts.push({
      kind: "expiring",
      severity: "medium",
      title: `${KIND_LABEL[w.kind]} for ${w.brand} ends ${when}`,
      date: w.endsAt,
      dealId: w.dealId,
    });
  }
  for (const d of paymentsDueSoon(deals, today, cfg.dueSoonDays)) {
    const when = d.daysLeft === 0 ? "today" : `in ${plural(d.daysLeft, "day")}`;
    alerts.push({
      kind: "due_soon",
      severity: "medium",
      title: `Payment from ${d.brand} is due ${when}`,
      date: d.paymentDueAt,
      dealId: d.id,
    });
  }
  return alerts;
}

// ---------------------------------------------------------------------------
// Calendar export
// ---------------------------------------------------------------------------

function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/** Fold lines longer than 75 octets (RFC 5545 §3.1). */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let current = "";
  let size = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (size + n > (out.length ? 74 : 75)) {
      out.push(current);
      current = "";
      size = 0;
    }
    current += ch;
    size += n;
  }
  out.push(current);
  return out.join("\r\n ");
}

const icsDate = (iso: string) => iso.replaceAll("-", "");

/**
 * All-day events for every window end date and unpaid payment due date, each
 * with a reminder 3 days before.
 */
export function toIcs(deals: Deal[], windows: RightsWindow[], now: Date): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const events: { uid: string; date: string; summary: string; description: string }[] = [];

  for (const w of windows) {
    if (w.perpetual || !w.endsAt) continue;
    events.push({
      uid: `window-${w.id}@greenlight`,
      date: w.endsAt,
      summary: `${KIND_LABEL[w.kind]} ends: ${w.brand}`,
      description: [w.scope ? `Scope: ${w.scope}` : "", w.platforms.length ? `Platforms: ${w.platforms.join(", ")}` : "", w.sourceQuote ? `Contract: "${w.sourceQuote}"` : ""]
        .filter(Boolean)
        .join("\n"),
    });
  }
  for (const d of deals) {
    if (d.paid || !d.paymentDueAt) continue;
    const money = formatMoney(d.feeAmount, d.feeCurrency);
    events.push({
      uid: `payment-${d.id}@greenlight`,
      date: d.paymentDueAt,
      summary: `Payment due: ${d.brand}${money ? ` (${money})` : ""}`,
      description: d.campaign ? `Campaign: ${d.campaign}` : "",
    });
  }

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Greenlight//Rights Wallet//EN",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:Greenlight deals",
  ];
  for (const e of events.sort((a, b) => a.date.localeCompare(b.date))) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(e.date)}`,
      `DTEND;VALUE=DATE:${icsDate(addDays(e.date, 1))}`,
      `SUMMARY:${icsEscape(e.summary)}`,
      ...(e.description ? [`DESCRIPTION:${icsEscape(e.description)}`] : []),
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "TRIGGER:-P3D",
      `DESCRIPTION:${icsEscape(e.summary)}`,
      "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
