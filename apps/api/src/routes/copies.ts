import { Hono } from "hono";
import { supabase } from "../lib/supabase";
import type {
  CopySubscription,
  CopyStatus,
  MarketType,
  SubscriptionTier,
  ApiResult,
} from "@copy-cat/shared";

type Env = {
  Variables: {
    userId: string;
    accessToken: string;
  };
};

const copies = new Hono<Env>();

// ---------------------------------------------------------------------------
// Subscription tier gates
// ---------------------------------------------------------------------------
interface TierLimits {
  maxCopies: number;
  allowedMarkets: MarketType[];
}

const TIER_LIMITS: Record<SubscriptionTier, TierLimits> = {
  free: { maxCopies: 1, allowedMarkets: ["stocks"] },
  pro: { maxCopies: 5, allowedMarkets: ["stocks", "crypto"] },
  elite: { maxCopies: Infinity, allowedMarkets: ["stocks", "crypto", "forex", "polymarket", "all"] },
};

copies.get("/", async (c) => {
  const userId = c.get("userId");
  const status = c.req.query("status") as CopyStatus | undefined;

  let query = supabase
    .from("copy_subscriptions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    return c.json<ApiResult<null>>(
      { data: null, error: { code: "QUERY_FAILED", message: error.message } },
      500,
    );
  }

  return c.json<ApiResult<CopySubscription[]>>({
    data: data as CopySubscription[],
    error: null,
  });
});

copies.get("/:id", async (c) => {
  const userId = c.get("userId");
  const copyId = c.req.param("id");

  const { data, error } = await supabase
    .from("copy_subscriptions")
    .select("*")
    .eq("id", copyId)
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    const status = error?.code === "PGRST116" ? 404 : 500;
    return c.json<ApiResult<null>>(
      {
        data: null,
        error: {
          code: status === 404 ? "NOT_FOUND" : "QUERY_FAILED",
          message: status === 404 ? "Copy subscription not found" : error!.message,
        },
      },
      status,
    );
  }

  return c.json<ApiResult<CopySubscription>>({ data: data as CopySubscription, error: null });
});

copies.post("/", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<{
    trader_id: string;
    portfolio_id: string;
    broker_connection_id: string;
    allocation_amount: number;
    max_position_pct?: number;
    copy_ratio?: number;
    stop_loss_pct?: number | null;
    take_profit_pct?: number | null;
    markets_filter?: MarketType[] | null;
  }>();

  const { data: broker, error: brokerErr } = await supabase
    .from("broker_connections")
    .select("id, status, buying_power")
    .eq("id", body.broker_connection_id)
    .eq("user_id", userId)
    .single();

  if (brokerErr || !broker) {
    return c.json<ApiResult<null>>(
      { data: null, error: { code: "INVALID_BROKER", message: "Broker connection not found or not owned by user" } },
      400,
    );
  }

  if (broker.status !== "connected") {
    return c.json<ApiResult<null>>(
      { data: null, error: { code: "BROKER_DISCONNECTED", message: "Broker connection is not active" } },
      400,
    );
  }

  if (broker.buying_power < body.allocation_amount) {
    return c.json<ApiResult<null>>(
      { data: null, error: { code: "INSUFFICIENT_FUNDS", message: "Allocation exceeds available buying power" } },
      400,
    );
  }

  // -----------------------------------------------------------------------
  // Subscription tier validation
  // -----------------------------------------------------------------------
  const { data: user, error: userErr } = await supabase
    .from("users")
    .select("subscription_tier")
    .eq("id", userId)
    .single();

  if (userErr || !user) {
    return c.json<ApiResult<null>>(
      { data: null, error: { code: "USER_NOT_FOUND", message: "Could not load user profile" } },
      500,
    );
  }

  const tier = (user.subscription_tier ?? "free") as SubscriptionTier;
  const limits = TIER_LIMITS[tier];

  // Check copy count limit
  const { count: activeCopyCount } = await supabase
    .from("copy_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("status", ["active", "paused"]);

  if ((activeCopyCount ?? 0) >= limits.maxCopies) {
    return c.json<ApiResult<null>>(
      {
        data: null,
        error: {
          code: "TIER_LIMIT_COPIES",
          message: `Your ${tier} plan allows up to ${limits.maxCopies === Infinity ? "unlimited" : limits.maxCopies} active copy subscription(s). Upgrade to add more.`,
        },
      },
      403,
    );
  }

  // Check market access
  const requestedMarkets: MarketType[] = body.markets_filter ?? ["all"];
  const disallowed = requestedMarkets.filter(
    (m) => !limits.allowedMarkets.includes(m) && m !== "all",
  );

  // For non-elite tiers, also verify that "all" isn't used if they lack full access
  if (tier !== "elite" && requestedMarkets.includes("all")) {
    return c.json<ApiResult<null>>(
      {
        data: null,
        error: {
          code: "TIER_LIMIT_MARKETS",
          message: `Your ${tier} plan does not support copying all markets. Allowed: ${limits.allowedMarkets.join(", ")}.`,
        },
      },
      403,
    );
  }

  if (disallowed.length > 0) {
    return c.json<ApiResult<null>>(
      {
        data: null,
        error: {
          code: "TIER_LIMIT_MARKETS",
          message: `Your ${tier} plan does not support these markets: ${disallowed.join(", ")}. Allowed: ${limits.allowedMarkets.join(", ")}.`,
        },
      },
      403,
    );
  }

  const { data, error } = await supabase
    .from("copy_subscriptions")
    .insert({
      user_id: userId,
      trader_id: body.trader_id,
      portfolio_id: body.portfolio_id,
      broker_connection_id: body.broker_connection_id,
      status: "active",
      allocation_amount: body.allocation_amount,
      max_position_pct: body.max_position_pct ?? 10,
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
      { data: null, error: { code: "CREATE_FAILED", message: error.message } },
      500,
    );
  }

  return c.json<ApiResult<CopySubscription>>({ data: data as CopySubscription, error: null }, 201);
});

copies.patch("/:id", async (c) => {
  const userId = c.get("userId");
  const copyId = c.req.param("id");
  const body = await c.req.json<{
    status?: CopyStatus;
    allocation_amount?: number;
    max_position_pct?: number;
    copy_ratio?: number;
    stop_loss_pct?: number | null;
    take_profit_pct?: number | null;
    markets_filter?: MarketType[] | null;
  }>();

  const { data, error } = await supabase
    .from("copy_subscriptions")
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq("id", copyId)
    .eq("user_id", userId)
    .select()
    .single();

  if (error || !data) {
    const status = error?.code === "PGRST116" ? 404 : 500;
    return c.json<ApiResult<null>>(
      {
        data: null,
        error: {
          code: status === 404 ? "NOT_FOUND" : "UPDATE_FAILED",
          message: status === 404 ? "Copy subscription not found" : error!.message,
        },
      },
      status,
    );
  }

  return c.json<ApiResult<CopySubscription>>({ data: data as CopySubscription, error: null });
});

copies.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const copyId = c.req.param("id");

  const { data, error } = await supabase
    .from("copy_subscriptions")
    .update({ status: "stopped", updated_at: new Date().toISOString() })
    .eq("id", copyId)
    .eq("user_id", userId)
    .select()
    .single();

  if (error || !data) {
    return c.json<ApiResult<null>>(
      { data: null, error: { code: "NOT_FOUND", message: "Copy subscription not found" } },
      404,
    );
  }

  return c.json<ApiResult<CopySubscription>>({ data: data as CopySubscription, error: null });
});

export default copies;
