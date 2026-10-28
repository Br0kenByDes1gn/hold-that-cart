import { serve } from "@hono/node-server";
import "dotenv/config";
import app from "./index.js";

const port = Number(process.env.PORT ?? 3001);
console.log(`[server] listening on :${port}`);
serve({ fetch: app.fetch, port });
