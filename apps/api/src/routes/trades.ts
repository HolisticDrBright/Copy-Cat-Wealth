import { Hono } from "hono";
import { supabase } from "../lib/supabase";
import type {
  UserTrade,
  TradeStatus,
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

// ---------------------------------------------------------------------------
// GET /trades  -  user's trade execution history with filters
// ---------------------------------------------------------------------------
trades.get("/", async (c) => {
  const userId = c.get("userId");
  const limit = Math.min(Number(c.req.query("limit") ?? 20), 100);
  const offset = Number(c.req.query("offset") ?? 0);
  const status = c.req.query("status") as TradeStatus | undefined;
  const market = c.req.query("market") as MarketType | undefined;
  const copyId = c.req.query("copy_id");

  let query = supabase
    .from("user_trades")
    .select("*", { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) {
    query = query.eq("status", status);
  }

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

// ---------------------------------------------------------------------------
// GET /trades/:id  -  single trade detail
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// GET /portfolio/summary  -  aggregated portfolio value, PnL, positions
// ---------------------------------------------------------------------------
trades.get("/portfolio/summary", async (c) => {
  const userId = c.get("userId");

  // Fetch all active/paused copy subscriptions for the user
  const { data: copies, error: copiesErr } = await supabase
    .from("copy_subscriptions")
    .select(
      "id, trader_id, portfolio_id, allocation_amount, total_pnl, total_pnl_pct, status, traders(display_name)",
    )
    .eq("user_id", userId)
    .in("status", ["active", "paused"]);

  if (copiesErr) {
    return c.json<ApiResult<null>>(
      { data: null, error: { code: "QUERY_FAILED", message: copiesErr.message } },
      500,
    );
  }

  // Fetch filled user trades for position and PnL calculation
  const { data: filledTrades, error: tradesErr } = await supabase
    .from("user_trades")
    .select("symbol, market, side, direction, quantity, price, realized_pnl, status")
    .eq("user_id", userId)
    .eq("status", "filled")
    .order("created_at", { ascending: false })
    .limit(500);

  if (tradesErr) {
    return c.json<ApiResult<null>>(
      { data: null, error: { code: "QUERY_FAILED", message: tradesErr.message } },
      500,
    );
  }

  // Aggregate net positions by symbol+direction
  const positionMap = new Map<
    string,
    { symbol: string; market: string; net_quantity: number; cost_basis: number; direction: string }
  >();

  for (const trade of filledTrades ?? []) {
    const key = `${trade.symbol}:${trade.direction}`;
    const existing = positionMap.get(key);
    const signedQty = trade.side === "buy" ? trade.quantity : -trade.quantity;

    if (existing) {
      existing.net_quantity += signedQty;
      if (trade.side === "buy") {
        existing.cost_basis += trade.quantity * trade.price;
      }
    } else {
      positionMap.set(key, {
        symbol: trade.symbol,
        market: trade.market,
        net_quantity: signedQty,
        cost_basis: trade.side === "buy" ? trade.quantity * trade.price : 0,
        direction: trade.direction,
      });
    }
  }

  // Only keep positions with non-zero quantity
  const openPositions = Array.from(positionMap.values()).filter(
    (p) => Math.abs(p.net_quantity) > 0.0001,
  );

  // Realized PnL from all filled trades
  const realizedPnl = (filledTrades ?? []).reduce(
    (sum: number, t: any) => sum + (t.realized_pnl ?? 0),
    0,
  );

  // Compute totals across all copies
  const totalAllocated = (copies ?? []).reduce(
    (sum: number, c: any) => sum + (c.allocation_amount ?? 0),
    0,
  );
  const totalPnl = (copies ?? []).reduce(
    (sum: number, c: any) => sum + (c.total_pnl ?? 0),
    0,
  );
  const totalValue = totalAllocated + totalPnl;
  const totalPnlPct = totalAllocated > 0 ? (totalPnl / totalAllocated) * 100 : 0;

  const winningTrades = (filledTrades ?? []).filter((t: any) => (t.realized_pnl ?? 0) > 0).length;
  const winRate = (filledTrades ?? []).length > 0 ? winningTrades / (filledTrades ?? []).length : 0;

  // Breakdown by market
  const byMarket: Record<string, { count: number; pnl: number }> = {};
  for (const t of filledTrades ?? []) {
    const m = t.market;
    if (!byMarket[m]) byMarket[m] = { count: 0, pnl: 0 };
    byMarket[m].count += 1;
    byMarket[m].pnl += t.realized_pnl ?? 0;
  }

  const summary = {
    total_value: totalValue,
    total_allocated: totalAllocated,
    total_pnl: totalPnl,
    total_pnl_pct: Math.round(totalPnlPct * 100) / 100,
    realized_pnl: realizedPnl,
    total_trades: (filledTrades ?? []).length,
    win_rate: Math.round(winRate * 10000) / 10000,
    active_copies: (copies ?? []).filter((c: any) => c.status === "active").length,
    paused_copies: (copies ?? []).filter((c: any) => c.status === "paused").length,
    open_positions_count: openPositions.length,
    positions: openPositions,
    by_market: byMarket,
    copies: (copies ?? []).map((c: any) => ({
      id: c.id,
      trader_id: c.trader_id,
      trader_name: c.traders?.display_name ?? null,
      portfolio_id: c.portfolio_id,
      allocation_amount: c.allocation_amount,
      total_pnl: c.total_pnl,
      total_pnl_pct: c.total_pnl_pct,
      status: c.status,
    })),
  };

  return c.json<ApiResult<typeof summary>>({ data: summary, error: null });
});

export default trades;
