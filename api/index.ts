import "dotenv/config";
import express from "express";
import { clerkMiddleware } from "@clerk/express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerStorageProxy } from "../server/_core/storageProxy";
import { appRouter } from "../server/routers";
import { createContext } from "../server/_core/context";

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.use(clerkMiddleware({
  secretKey: process.env.CLERK_SECRET_KEY,
}));

registerStorageProxy(app);

app.get("/api/health", (_req: any, res: any) => {
  res.json({ ok: true });
});

app.use(
  "/api/trpc",
  createExpressMiddleware({ router: appRouter, createContext })
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error("[API Error]", err?.message ?? err);
  res.status(500).json({ error: { message: err?.message ?? "Internal Server Error" } });
});

export default app;
