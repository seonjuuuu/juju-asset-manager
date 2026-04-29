import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "../../server/routers";
import { createContextFromRequest } from "../../server/_core/context";

export const config = { runtime: "nodejs" };

export default function handler(req: Request) {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createContextFromRequest(req),
  });
}
