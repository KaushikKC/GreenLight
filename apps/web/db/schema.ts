import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: id(),
  email: text("email").unique(),
  name: text("name"),
  isGuest: boolean("is_guest").notNull().default(false),
  createdAt: createdAt(),
});
