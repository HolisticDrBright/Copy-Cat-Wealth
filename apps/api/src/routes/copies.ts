import { Hono } from "hono";
import { supabase } from "../lib/supabase";
import type {
  CopySubscription,
  SubscriptionTier,
  ApiResult,
} from "@copy-cat/shared";

type Env = { Variables: { userId: string; subscriptionTier: SubscriptionTier } };

const copies = new Hono<Env>();

// ---------------------------------------------------------------------------
// Tier limits
// ---------------------------------------------------------------------------
const COPY_LIMITS: Record<SubscriptionTier, number> = {
  free: 1,
  basic: 3,
  pro: 5,
  elite: Infinity,
};

// ---------------------------------------------------------------------------
// Middleware: require auth (userId populated upstream)
// ---------------------------------------------------------------------------
copies.use("*", async (c, next) => {
  const userId = c.req.header("x-user-id");
  if (!userId) {
    return c.json<ApiResult<null>>(
      { data: null, error: { code: "UNAUTHORIZED", message: "Authentication required" } },
      401,
    );
  }

  // Fetch subscription tier
  const { data: user, error } = await supabase
    .from("users")
    .select("subscription_tier")
    .eq("id", userId)
    .single();

  if (error || !user) {
    return c.json<ApiResult<null>>(
      { data: null, error: { code: "UNAUTHORIZED", message: "User not found" } },
      401,
    );
  }

  c.set("userId", userId);
  c.set("subscriptionTier", user.subscription_tier as SubscriptionTier);
  await next();
});

// ---------------------------------------------------------------------------
// GET /copies  –  user's active copy subscriptions
// ---------------------------------------------------------------------------
copies.get("/", async (c) => {
  const userId = c.get("userId");

  const { data, error } = await supabase
    .from("copy_subscriptions")
    .select("*, traders(display_name, avatar_url), portfolios(name)")
    .eq("user_id", userId)
    .neq("status", "stopped")
    .order("created_at", { ascending: false });

  if (error) {
    return c.json<ApiResult<null>>(
      { data: null, error: { code: "QUERY_FAILED", message: error.message } },
      500,
    );
  }

  return c.json<ApiResult<CopySubscription[]>>({
    data: data as unknown as CopySubscription[],
    error: null,
  });
});

// ---------------------------------------------------------------------------
// POST /copies  –  create new copy subscription
// ---------------------------------------------------------------------------
copies.post("/", async (c) => {
  const userId = c.get("userId");
  const tier = c.get("subscriptionTier");

  const body = await c.req.json<{
    trader_id: string;
    portfolio_id: string;
    broker_connection_id: string;
    allocation_amount: number;
    max_position_pct?: number;
    copy_ratio?: number;
    stop_loss_pct?: number | null;
    take_profit_pct?: number | null;
    markets_filter?: string[] | null;
  }>();

  // Validate required fields
  if (!body.trader_id || !body.portfolio_id || !body.broker_connection_id || !body.allocation_amount) {
    return c.json<ApiResult<null>>(
      {
        data: null,
        error: {
          code: "VALIDATION_ERROR",
          message: "trader_id, portfolio_id, broker_connection_id, and allocation_amount are required",
        },
      },
      400,
    );
  }

  if (body.allocation_amount <= 0) {
    return c.json<ApiResult<null>>(
      { data: null, error: { code: "VALIDATION_ERROR", message: "allocation_amount must be positive" } },
      400,
    );
  }

  // Check tier limits
  const { count, error: countErr } = await supabase
    .from("copy_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("status", ["active", "paused"]);

  if (countErr) {
    return c.json<ApiResult<null>>(
      { data: null, error: { code: "QUERY_FAILED", message: countErr.message } },
      500,
    );
  }

  const currentCount = count ?? 0;
  const limit = COPY_LIMITS[tier];

  if (currentCount >= limit) {
    return c.json<ApiResult<null>>(
      {
        data: null,
        error: {
          code: "TIER_LIMIT_REACHED",
          message: `Your ${tier} plan allows ${limit} active copy subscription(s). Upgrade to add more.`,
        },
      },
      403,
    );
  }

  // Verify broker connection belongs to user
  const { data: broker, error: brokerErr } = await supabase
    .from("broker_connections")
    .select("id")
    .eq("id", body.broker_connection_id)
    .eq("user_id", userId)
    .eq("status", "connected")
    .single();

  if (brokerErr || !broker) {
    return c.json<ApiResult<null>>(
      {
        data: null,
        error: { code: "INVALID_BROKER", message: "Broker connection not found or not connected" },
      },
      400,
    );
  }

  // Create subscription
  const { data, error } = await supabase
    .from("copy_subscriptions")
    .insert({
      user_id: userId,
      trader_id: body.trader_id,
      portfolio_id: body.portfolio_id,
      broker_connection_id: body.broker_connection_id,
      status: "active",
      allocation_amount: body.allocation_amount,
      max_position_pct: body.max_position_pct ?? 25,
      copy_ratio: body.copy_ratio ?? 1,
      stop_loss_pct: body.stop_loss_pct ?? null,
      take_profit_pct: body.take_profit_pct ?? null,
      markets_filter: body.markets_filter ?? null,
      total_pnl: 0,
      total_pnl_pct: 0,
      trades_copied: 0,
    })
    .select()
    .single();

  if (error) {
    return c.json<ApiResult<null>>(
      { data: null, error: { code: "INSERT_FAILED", message: error.message } },
      500,
    );
  }

  return c.json<ApiResult<CopySubscription>>(
    { data: data as CopySubscription, error: null },
    201,
  );
});

// ---------------------------------------------------------------------------
// PATCH /copies/:id  –  update settings or pause/resume
// ---------------------------------------------------------------------------
copies.patch("/:id", async (c) => {
  const userId = c.get("userId");
  const copyId = c.req.param("id");

  const body = await c.req.json<{
    status?: "active" | "paused";
    allocation_amount?: number;
    max_position_pct?: number;
    copy_ratio?: number;
    stop_loss_pct?: number | null;
    take_profit_pct?: number | null;
    markets_filter?: string[] | null;
  }>();

  // Verify ownership
  const { data: existing, error: fetchErr } = await supabase
    .from("copy_subscriptions")
    .select("id, status")
    .eq("id", copyId)
    .eq("user_id", userId)
    .single();

  if (fetchErr || !existing) {
    return c.json<ApiResult<null>>(
      { data: null, error: { code: "NOT_FOUND", message: "Copy subscription not found" } },
      404,
    );
  }

  if (existing.status === "stopped") {
    return c.json<ApiResult<null>>(
      { data: null, error: { code: "ALREADY_STOPPED", message: "Cannot update a stopped subscription" } },
      400,
    );
  }

  const updates: Record<string, unknown> = {};
  if (body.status !== undefined) updates.status = body.status;
  if (body.allocation_amount !== undefined) updates.allocation_amount = body.allocation_amount;
  if (body.max_position_pct !== undefined) updates.max_position_pct = body.max_position_pct;
  if (body.copy_ratio !== undefined) updates.copy_ratio = body.copy_ratio;
  if (body.stop_loss_pct !== undefined) updates.stop_loss_pct = body.stop_loss_pct;
  if (body.take_profit_pct !== undefined) updates.take_profit_pct = body.take_profit_pct;
  if (body.markets_filter !== undefined) updates.markets_filter = body.markets_filter;

  if (Object.keys(updates).length === 0) {
    return c.json<ApiResult<null>>(
      { data: null, error: { code: "VALIDATION_ERROR", message: "No fields to update" } },
      400,
    );
  }

  const { data, error } = await supabase
    .from("copy_subscriptions")
    .update(updates)
    .eq("id", copyId)
    .select()
    .single();

  if (error) {
    return c.json<ApiResult<null>>(
      { data: null, error: { code: "UPDATE_FAILED", message: error.message } },
      500,
    );
  }

  return c.json<ApiResult<CopySubscription>>({ data: data as CopySubscription, error: null });
});

// ---------------------------------------------------------------------------
// DELETE /copies/:id  –  stop copying, flag to close positions
// ---------------------------------------------------------------------------
copies.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const copyId = c.req.param("id");

  // Verify ownership
  const { data: existing, error: fetchErr } = await supabase
    .from("copy_subscriptions")
    .select("id, status")
    .eq("id", copyId)
    .eq("user_id", userId)
    .single();

  if (fetchErr || !existing) {
    return c.json<ApiResult<null>>(
      { data: null, error: { code: "NOT_FOUND", message: "Copy subscription not found" } },
      404,
    );
  }

  if (existing.status === "stopped") {
    return c.json<ApiResult<null>>(
      { data: null, error: { code: "ALREADY_STOPPED", message: "Subscription already stopped" } },
      400,
    );
  }

  const { data, error } = await supabase
    .from("copy_subscriptions")
    .update({ status: "stopped", updated_at: new Date().toISOString() })
    .eq("id", copyId)
    .select()
    .single();

  if (error) {
    return c.json<ApiResult<null>>(
      { data: null, error: { code: "UPDATE_FAILED", message: error.message } },
      500,
    );
  }

  // Flag: close open positions is handled asynchronously
  // A separate worker can pick up stopped subscriptions and unwind positions

  return c.json<ApiResult<CopySubscription & { close_positions: boolean }>>({
    data: { ...(data as CopySubscription), close_positions: true },
    error: null,
  });
});

export default copies;
