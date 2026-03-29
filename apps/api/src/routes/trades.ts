import { Hono } from "hono";
import { supabase } from "../lib/supabase";
import type {
  UserTrade,
  ApiResult,
  PaginatedResponse,
  MarketType,
} from "@copy-cat/shared";

type Env = {
  Variables: {
    userId: string;
    accessToken: string;
  };
};

const trades = new Hono<Env>();

trades.get("/", async (c) => {
  const userId = c.get("userId");
  const limit = Math.min(Number(c.req.query("limit") ?? 20), 100);
  const offset = Number(c.req.query("offset") ?? 0);
  const market = c.req.query("market") as MarketType | undefined;
  const copyId = c.req.query("copy_id");

  let query = supabase
    .from("user_trades")
    .select("*", { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (market) {
    query = query.eq("market", market);
  }

  if (copyId) {
    query = query.eq("copy_subscription_id", copyId);
  }

  const { data, count, error } = await query;

  if (error) {
    return c.json<ApiResult<null>>(
      { data: null, error: { code: "QUERY_FAILED", message: error.message } },
      500,
    );
  }

  return c.json<PaginatedResponse<UserTrade>>({
    data: (data ?? []) as UserTrade[],
    total: count ?? 0,
    page: Math.floor(offset / limit) + 1,
    per_page: limit,
    has_more: offset + limit < (count ?? 0),
  });
});

trades.get("/:id", async (c) => {
  const userId = c.get("userId");
  const tradeId = c.req.param("id");

  const { data, error } = await supabase
    .from("user_trades")
    .select("*")
    .eq("id", tradeId)
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    const status = error?.code === "PGRST116" ? 404 : 500;
    return c.json<ApiResult<null>>(
      {
        data: null,
        error: {
          code: status === 404 ? "NOT_FOUND" : "QUERY_FAILED",
          message: status === 404 ? "Trade not found" : error!.message,
        },
      },
      status,
    );
  }

  return c.json<ApiResult<UserTrade>>({ data: data as UserTrade, error: null });
});

trades.get("/summary", async (c) => {
  const userId = c.get("userId");

  const { data, error } = await supabase
    .from("user_trades")
    .select("realized_pnl, status, market")
    .eq("user_id", userId)
    .eq("status", "filled");

  if (error) {
    return c.json<ApiResult<null>>(
      { data: null, error: { code: "QUERY_FAILED", message: error.message } },
      500,
    );
  }

  const trades = data ?? [];
  const totalPnl = trades.reduce((sum, t) => sum + (t.realized_pnl ?? 0), 0);
  const winningTrades = trades.filter((t) => (t.realized_pnl ?? 0) > 0).length;
  const winRate = trades.length > 0 ? winningTrades / trades.length : 0;

  const byMarket: Record<string, { count: number; pnl: number }> = {};
  for (const t of trades) {
    const m = t.market;
    if (!byMarket[m]) {
      byMarket[m] = { count: 0, pnl: 0 };
    }
    byMarket[m].count += 1;
    byMarket[m].pnl += t.realized_pnl ?? 0;
  }

  return c.json<ApiResult<{
    total_trades: number;
    total_pnl: number;
    win_rate: number;
    by_market: Record<string, { count: number; pnl: number }>;
  }>>({
    data: {
      total_trades: trades.length,
      total_pnl: totalPnl,
      win_rate: winRate,
      by_market: byMarket,
    },
    error: null,
  });
});

export default trades;
