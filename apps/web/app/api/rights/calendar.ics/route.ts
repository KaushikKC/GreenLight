import { loadWallet } from "@/lib/contracts";
import { toIcs } from "@/lib/rights";
import { getUserId } from "@/lib/session";

/** Calendar of every rights end date and payment due date, with reminders. */
export async function GET() {
  const userId = await getUserId();
  if (!userId) return new Response("Not found", { status: 404 });
  const { deals, windows } = await loadWallet(userId);
  return new Response(toIcs(deals, windows, new Date()), {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'attachment; filename="greenlight-deals.ics"',
      "cache-control": "no-store",
    },
  });
}
