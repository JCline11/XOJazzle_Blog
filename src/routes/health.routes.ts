import { Router } from "express";

type DatabaseCheck = () => Promise<unknown>;

export function createHealthRouter(
  checkDatabase: DatabaseCheck
) {
  const healthRouter = Router();

  healthRouter.get("/healthz", async (_req, res) => {
    res.set({
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow, noarchive"
    });

    try {
      await checkDatabase();

      return res.status(200).json({
        status: "ok"
      });
    } catch {
      return res.status(503).json({
        status: "unavailable"
      });
    }
  });

  return healthRouter;
}