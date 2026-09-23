// Shared with the analyzer. Imported so the bundle carries exactly these files.
import categoriesJson from "../../../services/analyzer/rules/categories.json";
import contractsJson from "../../../services/analyzer/rules/contracts.json";

import type { Category } from "./rights";

export const CATEGORIES: Category[] = categoriesJson.categories;

export const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c.label]),
);

export const ALERT_CONFIG = {
  expiringDays: contractsJson.expiring_alert_days,
  dueSoonDays: contractsJson.payment_due_soon_days,
};

export const DISCLAIMER = "Greenlight organises your contracts; it isn't legal advice.";
