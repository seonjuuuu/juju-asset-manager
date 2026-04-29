import type { VercelRequest, VercelResponse } from "@vercel/node";
import { runStockPriceUpdate } from "../../server/cron";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    await runStockPriceUpdate();
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[Cron] stock update error:", err);
    res.status(500).json({ ok: false });
  }
}
