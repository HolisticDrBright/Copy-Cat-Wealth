import { Hono } from "hono";
import { supabase } from "../lib/supabase";
import type {
  Trader,
  TraderStats,
  Portfolio,
  PortfolioTrade,
  LeaderboardEntry,
  ApiResult,
  PaginatedResponse,
  MarketType,
} from "@copy-cat/shared";

const traders = new Hono();

// ---------------------------------------------------------------------------
// GET /traders  –  leaderboard
// ---------------------------------------------------------------------------
traders.get("/", async (c) => {
  const market = c.req.query("market") as MarketType | undefined;
  const sort = c.req.query("sort") ?? "composite_score";
  const period = c.req.query("period") ?? "30d";
  const limit = Math.min(Number(c.req.query("limit") ?? 20), 100);
  const offset = Number(c.req.query("offset") ?? 0);

  let query = supabase
    .from("traders")
    .select(
      `
      *,
      trader_stats!inner(*)
    `,
      { count: "exact" },
    )
    .eq("is_public", true)
    .eq("trader_stats.period", period)
    .range(offset, offset + limit - 1);

  if (market) {
    query = query.contains("markets", [market]);
  }

  // Map user-facing sort keys to database columns
  const sortColumn = (() => {
    switch (sort) {
      case "return":
        return "trader_stats.total_return_pct";
      case "sharpe":
        return "trader_stats.sharpe_ratio";
      case "win_rate":
        return "trader_stats.win_rate";
      case "copiers":
        return "copier_count";
      default:
        return "trader_stats.total_return_pct";
    }
  })();

  query = query.order(sortColumn, { ascending: false });

  const { data, count, error } = await query;

  if (error) {
    return c.json<ApiResult<null>>(
      { data: null, error: { code: "QUERY_FAILED", message: error.message } },
      500,
    );
  }

  const entries: LeaderboardEntry[] = (data ?? []).map((row: any, idx: number) => ({
    trader: {
      id: row.id,
      user_id: row.user_id,
      display_name: row.display_name,
      avatar_url: row.avatar_url,
      bio: row.bio,
      markets: row.markets,
      is_verified: row.is_verified,
      is_public: row.is_public,
      follower_count: row.follower_count,
      copier_count: row.copier_count,
      created_at: row.created_at,
      updated_at: row.updated_at,
    } as Trader,
    stats: row.trader_stats[0] as TraderStats,
    rank: offset + idx + 1,
  }));

  return c.json<PaginatedResponse<LeaderboardEntry>>({
    data: entries,
    total: count ?? 0,
    page: Math.floor(offset / limit) + 1,
    per_page: limit,
    has_more: offset + limit < (count ?? 0),
  });
});

// ---------------------------------------------------------------------------
// GET /traders/:id  –  single trader profile
// ---------------------------------------------------------------------------
traders.get("/:id", async (c) => {
  const traderId = c.req.param("id");

  const { data: trader, error } = await supabase
    .from("traders")
    .select("*, trader_stats(*)")
    .eq("id", traderId)
    .single();

  if (error || !trader) {
    const status = error?.code === "PGRST116" ? 404 : 500;
    return c.json<ApiResult<null>>(
      {
        data: null,
        error: {
          code: status === 404 ? "NOT_FOUND" : "QUERY_FAILED",
          message: status === 404 ? "Trader not found" : error!.message,
        },
      },
      status,
    );
  }

  return c.json<ApiResult<typeof trader>>({ data: trader, error: null });
});

// ---------------------------------------------------------------------------
// GET /traders/:id/portfolios  –  trader's active portfolios
// ---------------------------------------------------------------------------
traders.get("/:id/portfolios", async (c) => {
  const traderId = c.req.param("id");

  const { data, error } = await supabase
    .from("portfolios")
    .select("*")
    .eq("trader_id", traderId)
    .eq("is_public", true)
    .order("created_at", { ascending: false });

  if (error) {
    return c.json<ApiResult<null>>(
      { data: null, error: { code: "QUERY_FAILED", message: error.message } },
      500,
    );
  }

  return c.json<ApiResult<Portfolio[]>>({ data: data as Portfolio[], error: null });
});

// ---------------------------------------------------------------------------
// GET /traders/:id/trades  –  recent trade history (paginated)
// ---------------------------------------------------------------------------
traders.get("/:id/trades", async (c) => {
  const traderId = c.req.param("id");
  const limit = Math.min(Number(c.req.query("limit") ?? 20), 100);
  const offset = Number(c.req.query("offset") ?? 0);

  // First resolve portfolio IDs for this trader
  const { data: portfolios, error: pErr } = await supabase
    .from("portfolios")
    .select("id")
    .eq("trader_id", traderId)
    .eq("is_public", true);

  if (pErr) {
    return c.json<ApiResult<null>>(
      { data: null, error: { code: "QUERY_FAILED", message: pErr.message } },
      500,
    );
  }

  const portfolioIds = (portfolios ?? []).map((p: any) => p.id);

  if (portfolioIds.length === 0) {
    return c.json<PaginatedResponse<PortfolioTrade>>({
      data: [],
      total: 0,
      page: 1,
      per_page: limit,
      has_more: false,
    });
  }

  const { data, count, error } = await supabase
    .from("portfolio_trades")
    .select("*", { count: "exact" })
    .in("portfolio_id", portfolioIds)
    .order("executed_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return c.json<ApiResult<null>>(
      { data: null, error: { code: "QUERY_FAILED", message: error.message } },
      500,
    );
  }

  return c.json<PaginatedResponse<PortfolioTrade>>({
    data: (data ?? []) as PortfolioTrade[],
    total: count ?? 0,
    page: Math.floor(offset / limit) + 1,
    per_page: limit,
    has_more: offset + limit < (count ?? 0),
  });
});

export default traders;
