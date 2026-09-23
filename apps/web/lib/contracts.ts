import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";

import { db, schema } from "@/db";

import type { ConfirmContractInput, CreateContractInput } from "./contract-schema";
import type { Deal, RightsWindow } from "./rights";
import { presignRead } from "./storage";

export type Contract = typeof schema.contracts.$inferSelect;

const isoDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const toDate = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00Z`) : null);

/** Contract row + queued extraction job, all or nothing. */
export async function createContract(userId: string, input: CreateContractInput): Promise<Contract> {
  return db.transaction(async (tx) => {
    const [contract] = await tx
      .insert(schema.contracts)
      .values(
        input.source === "text"
          ? { userId, source: "text", rawText: input.text }
          : { userId, source: input.source, storageKey: input.key, filename: input.filename },
      )
      .returning();
    await tx.insert(schema.jobs).values({ type: "contract", refId: contract.id });
    return contract;
  });
}

export async function getContractForUser(id: string, userId: string): Promise<Contract | undefined> {
  const [row] = await db
    .select()
    .from(schema.contracts)
    .where(and(eq(schema.contracts.id, id), eq(schema.contracts.userId, userId)))
    .limit(1);
  return row;
}

export type ContractDto = {
  id: string;
  status: Contract["status"];
  source: Contract["source"];
  filename: string | null;
  rawText: string | null;
  fileUrl: string | null;
  extracted: Record<string, unknown> | null;
  dealId: string | null;
  createdAt: string;
};

export async function toContractDto(c: Contract): Promise<ContractDto> {
  const [deal] =
    c.status === "confirmed"
      ? await db
          .select({ id: schema.deals.id })
          .from(schema.deals)
          .where(eq(schema.deals.contractId, c.id))
          .limit(1)
      : [];
  return {
    id: c.id,
    status: c.status,
    source: c.source,
    filename: c.filename,
    rawText: c.rawText,
    fileUrl: c.storageKey ? await presignRead(c.storageKey) : null,
    extracted: (c.extracted as Record<string, unknown> | null) ?? null,
    dealId: deal?.id ?? null,
    createdAt: c.createdAt.toISOString(),
  };
}

export class AlreadyConfirmedError extends Error {}

/** Turn the reviewed terms into a deal + rights windows. */
export async function confirmContract(
  contract: Contract,
  input: ConfirmContractInput,
): Promise<string> {
  if (contract.status === "confirmed") throw new AlreadyConfirmedError();
  return db.transaction(async (tx) => {
    const [deal] = await tx
      .insert(schema.deals)
      .values({
        userId: contract.userId,
        contractId: contract.id,
        brand: input.brand,
        category: input.category,
        campaign: input.campaign,
        signedAt: toDate(input.signedAt),
        feeAmount: input.feeAmount === null ? null : String(input.feeAmount),
        feeCurrency: input.feeCurrency,
        paymentTermsDays: input.paymentTermsDays,
        paymentDueAt: toDate(input.paymentDueAt),
        deliverables: input.deliverables,
        notes: input.notes,
      })
      .returning({ id: schema.deals.id });
    if (input.windows.length) {
      await tx.insert(schema.rightsWindows).values(
        input.windows.map((w) => ({
          dealId: deal.id,
          kind: w.kind,
          scope: w.kind === "usage" ? w.scope : null,
          platforms: w.platforms,
          territories: w.territories,
          category: w.kind === "exclusivity" ? w.category : null,
          startsAt: toDate(w.startsAt),
          endsAt: w.perpetual ? null : toDate(w.endsAt),
          perpetual: w.perpetual,
          durationText: w.durationText,
          sourceQuote: w.sourceQuote,
        })),
      );
    }
    await tx
      .update(schema.contracts)
      .set({ status: "confirmed" })
      .where(eq(schema.contracts.id, contract.id));
    return deal.id;
  });
}

export type WalletDeal = Deal & {
  contractId: string | null;
  signedAt: string | null;
  deliverables: unknown;
};

/** Everything the wallet page needs for one user. */
export async function loadWallet(userId: string): Promise<{
  deals: WalletDeal[];
  windows: RightsWindow[];
  pending: { id: string; status: Contract["status"]; filename: string | null; createdAt: string }[];
}> {
  const dealRows = await db
    .select()
    .from(schema.deals)
    .where(eq(schema.deals.userId, userId))
    .orderBy(asc(schema.deals.signedAt));
  const ids = dealRows.map((d) => d.id);
  const windowRows = ids.length
    ? await db
        .select()
        .from(schema.rightsWindows)
        .where(inArray(schema.rightsWindows.dealId, ids))
        .orderBy(asc(schema.rightsWindows.startsAt))
    : [];
  const brandOf = new Map(dealRows.map((d) => [d.id, d.brand]));
  const pendingRows = await db
    .select({
      id: schema.contracts.id,
      status: schema.contracts.status,
      filename: schema.contracts.filename,
      createdAt: schema.contracts.createdAt,
    })
    .from(schema.contracts)
    .where(
      and(
        eq(schema.contracts.userId, userId),
        inArray(schema.contracts.status, ["extracting", "needs_review", "error"]),
      ),
    );

  return {
    deals: dealRows.map((d) => ({
      id: d.id,
      brand: d.brand,
      category: d.category,
      campaign: d.campaign,
      feeAmount: d.feeAmount === null ? null : Number(d.feeAmount),
      feeCurrency: d.feeCurrency,
      paymentDueAt: isoDate(d.paymentDueAt),
      paid: d.paid,
      contractId: d.contractId,
      signedAt: isoDate(d.signedAt),
      deliverables: d.deliverables,
    })),
    windows: windowRows.map((w) => ({
      id: w.id,
      dealId: w.dealId,
      brand: brandOf.get(w.dealId) ?? "",
      kind: w.kind,
      scope: (w.scope as RightsWindow["scope"]) ?? null,
      platforms: w.platforms ?? [],
      territories: w.territories ?? [],
      category: w.category,
      startsAt: isoDate(w.startsAt),
      endsAt: isoDate(w.endsAt),
      perpetual: w.perpetual,
      durationText: w.durationText,
      sourceQuote: w.sourceQuote,
    })),
    pending: pendingRows.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() })),
  };
}

export async function setDealPaid(dealId: string, userId: string, paid: boolean): Promise<boolean> {
  const rows = await db
    .update(schema.deals)
    .set({ paid })
    .where(and(eq(schema.deals.id, dealId), eq(schema.deals.userId, userId)))
    .returning({ id: schema.deals.id });
  return rows.length > 0;
}
