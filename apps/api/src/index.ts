import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { HTTPException } from "hono/http-exception";
import { serve } from "@hono/node-server";
import { supabaseForUser } from "./lib/supabase";
import traders from "./routes/traders";
import copies from "./routes/copies";
import brokers from "./routes/brokers";
import trades from "./routes/trades";
import type { ApiResult } from "@copy-cat/shared";

type Env = {
  Variables: {
    userId: string;
    accessToken: string;
  };
};

const app = new Hono<Env>();

app.use("*", logger());

app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  }),
);

app.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

const authenticated = new Hono<Env>();

authenticated.use("*", async (c, next) => {
  const authHeader = c.req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return c.json<ApiResult<null>>(
      { data: null, error: { code: "UNAUTHORIZED", message: "Missing or invalid authorization header" } },
      401,
    );
  }

  const token = authHeader.slice(7);
  const sb = supabaseForUser(token);
  const { data: { user }, error } = await sb.auth.getUser(token);

  if (error || !user) {
    return c.json<ApiResult<null>>(
      { data: null, error: { code: "UNAUTHORIZED", message: "Invalid or expired token" } },
      401,
    );
  }

  c.set("userId", user.id);
  c.set("accessToken", token);

  await next();
});

authenticated.route("/traders", traders);
authenticated.route("/copies", copies);
authenticated.route("/brokers", brokers);
authenticated.route("/trades", trades);

app.route("/api", authenticated);

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json<ApiResult<null>>(
      { data: null, error: { code: "HTTP_ERROR", message: err.message } },
      err.status,
    );
  }

  console.error("Unhandled error:", err);

  return c.json<ApiResult<null>>(
    { data: null, error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } },
    500,
  );
});

app.notFound((c) =>
  c.json<ApiResult<null>>(
    { data: null, error: { code: "NOT_FOUND", message: `Route not found: ${c.req.method} ${c.req.path}` } },
    404,
  ),
);

const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Copy Cat Trader API running on http://localhost:${info.port}`);
});

export default app;
