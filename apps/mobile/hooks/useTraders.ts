import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type {
  Trader,
  TraderStats,
  Portfolio,
  PortfolioTrade,
  LeaderboardEntry,
  MarketType,
  PaginatedResponse,
} from "@copy-cat/shared";

// ---------------------------------------------------------------------------
// Mock data for development
// ---------------------------------------------------------------------------

const MOCK_TRADERS: LeaderboardEntry[] = [
  {
    rank: 1,
    trader: {
      id: "t1",
      user_id: "u1",
      display_name: "Alex Morgan",
      avatar_url: "https://i.pravatar.cc/150?u=alex",
      bio: "Momentum & swing trader focused on tech and crypto",
      markets: ["stocks", "crypto"],
      is_verified: true,
      is_public: true,
      follower_count: 2341,
      copier_count: 812,
      created_at: "2024-01-15T00:00:00Z",
      updated_at: "2025-03-01T00:00:00Z",
    },
    stats: {
      trader_id: "t1",
      period: "30d",
      total_return_pct: 184.5,
      win_rate: 0.724,
      avg_gain_pct: 4.2,
      avg_loss_pct: 1.8,
      profit_factor: 2.8,
      sharpe_ratio: 2.1,
      max_drawdown_pct: 12.4,
      total_trades: 156,
      avg_hold_time_hours: 18,
      best_trade_pct: 32.5,
      worst_trade_pct: -8.2,
      updated_at: "2025-03-01T00:00:00Z",
    },
  },
  {
    rank: 2,
    trader: {
      id: "t2",
      user_id: "u2",
      display_name: "Sarah Chen",
      avatar_url: "https://i.pravatar.cc/150?u=sarah",
      bio: "Value investor with a focus on dividend aristocrats",
      markets: ["stocks"],
      is_verified: true,
      is_public: true,
      follower_count: 1856,
      copier_count: 623,
      created_at: "2024-03-10T00:00:00Z",
      updated_at: "2025-03-01T00:00:00Z",
    },
    stats: {
      trader_id: "t2",
      period: "30d",
      total_return_pct: 42.3,
      win_rate: 0.681,
      avg_gain_pct: 2.8,
      avg_loss_pct: 1.2,
      profit_factor: 2.4,
      sharpe_ratio: 1.8,
      max_drawdown_pct: 6.1,
      total_trades: 89,
      avg_hold_time_hours: 72,
      best_trade_pct: 15.2,
      worst_trade_pct: -4.5,
      updated_at: "2025-03-01T00:00:00Z",
    },
  },
  {
    rank: 3,
    trader: {
      id: "t3",
      user_id: "u3",
      display_name: "Marcus Webb",
      avatar_url: "https://i.pravatar.cc/150?u=marcus",
      bio: "High-conviction DeFi & altcoin specialist",
      markets: ["crypto"],
      is_verified: false,
      is_public: true,
      follower_count: 3102,
      copier_count: 1204,
      created_at: "2024-02-01T00:00:00Z",
      updated_at: "2025-03-01T00:00:00Z",
    },
    stats: {
      trader_id: "t3",
      period: "30d",
      total_return_pct: 312.1,
      win_rate: 0.558,
      avg_gain_pct: 8.6,
      avg_loss_pct: 4.2,
      profit_factor: 1.9,
      sharpe_ratio: 1.4,
      max_drawdown_pct: 28.3,
      total_trades: 201,
      avg_hold_time_hours: 6,
      best_trade_pct: 68.5,
      worst_trade_pct: -22.1,
      updated_at: "2025-03-01T00:00:00Z",
    },
  },
  {
    rank: 4,
    trader: {
      id: "t4",
      user_id: "u4",
      display_name: "Elena Rodriguez",
      avatar_url: "https://i.pravatar.cc/150?u=elena",
      bio: "Conservative forex trader, major pairs only",
      markets: ["forex"],
      is_verified: true,
      is_public: true,
      follower_count: 945,
      copier_count: 302,
      created_at: "2024-05-20T00:00:00Z",
      updated_at: "2025-03-01T00:00:00Z",
    },
    stats: {
      trader_id: "t4",
      period: "30d",
      total_return_pct: 18.4,
      win_rate: 0.712,
      avg_gain_pct: 1.1,
      avg_loss_pct: 0.6,
      profit_factor: 3.1,
      sharpe_ratio: 2.6,
      max_drawdown_pct: 3.2,
      total_trades: 312,
      avg_hold_time_hours: 4,
      best_trade_pct: 5.8,
      worst_trade_pct: -2.1,
      updated_at: "2025-03-01T00:00:00Z",
    },
  },
];

const MOCK_PORTFOLIOS: Portfolio[] = [
  {
    id: "p1",
    trader_id: "t1",
    name: "Tech Momentum",
    description: "Swing trades on high-momentum tech names",
    markets: ["stocks"],
    is_public: true,
    total_value: 125400,
    cash_balance: 18200,
    day_pnl: 1340,
    day_pnl_pct: 1.08,
    total_pnl: 45200,
    total_pnl_pct: 56.3,
    created_at: "2024-01-20T00:00:00Z",
    updated_at: "2025-03-01T00:00:00Z",
  },
  {
    id: "p2",
    trader_id: "t1",
    name: "Crypto Alpha",
    description: "Short-term altcoin trades",
    markets: ["crypto"],
    is_public: true,
    total_value: 48300,
    cash_balance: 8100,
    day_pnl: -620,
    day_pnl_pct: -1.27,
    total_pnl: 18300,
    total_pnl_pct: 60.9,
    created_at: "2024-03-05T00:00:00Z",
    updated_at: "2025-03-01T00:00:00Z",
  },
];

const MOCK_TRADES: PortfolioTrade[] = [
  {
    id: "tr1",
    portfolio_id: "p1",
    symbol: "NVDA",
    market: "stocks",
    side: "buy",
    direction: "long",
    order_type: "market",
    quantity: 10,
    price: 875.5,
    total_value: 8755,
    realized_pnl: null,
    realized_pnl_pct: null,
    status: "filled",
    executed_at: "2025-02-28T14:30:00Z",
    created_at: "2025-02-28T14:30:00Z",
  },
  {
    id: "tr2",
    portfolio_id: "p1",
    symbol: "AAPL",
    market: "stocks",
    side: "sell",
    direction: "long",
    order_type: "limit",
    quantity: 25,
    price: 228.4,
    total_value: 5710,
    realized_pnl: 420,
    realized_pnl_pct: 7.9,
    status: "filled",
    executed_at: "2025-02-27T15:45:00Z",
    created_at: "2025-02-27T15:45:00Z",
  },
];

// ---------------------------------------------------------------------------
// Query key factory
// ---------------------------------------------------------------------------

const traderKeys = {
  all: ["traders"] as const,
  list: (market?: string, sort?: string, period?: string) =>
    ["traders", "list", { market, sort, period }] as const,
  detail: (id: string) => ["traders", "detail", id] as const,
  portfolios: (traderId: string) =>
    ["traders", "portfolios", traderId] as const,
  trades: (traderId: string, limit?: number) =>
    ["traders", "trades", traderId, { limit }] as const,
};

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

type SortOption = "return" | "copiers" | "win_rate" | "sharpe";
type PeriodOption = "7d" | "30d" | "90d" | "1y" | "all";

export function useTraders(
  market?: MarketType | "all",
  sort: SortOption = "return",
  period: PeriodOption = "30d"
) {
  return useQuery({
    queryKey: traderKeys.list(market, sort, period),
    queryFn: async ({ signal }) => {
      try {
        const params = new URLSearchParams();
        if (market && market !== "all") params.set("market", market);
        params.set("sort", sort);
        params.set("period", period);
        return await api.get<LeaderboardEntry[]>(
          `/traders?${params.toString()}`,
          { signal }
        );
      } catch {
        // Fallback to mock data in development
        await new Promise((r) => setTimeout(r, 300));
        let entries = [...MOCK_TRADERS];
        if (market && market !== "all") {
          entries = entries.filter((e) =>
            e.trader.markets.includes(market as MarketType)
          );
        }
        return entries;
      }
    },
  });
}

export function useTrader(id: string) {
  return useQuery({
    queryKey: traderKeys.detail(id),
    queryFn: async ({ signal }) => {
      try {
        return await api.get<{ trader: Trader; stats: TraderStats }>(
          `/traders/${id}`,
          { signal }
        );
      } catch {
        const entry = MOCK_TRADERS.find((e) => e.trader.id === id);
        if (!entry) throw new Error("Trader not found");
        return { trader: entry.trader, stats: entry.stats };
      }
    },
    enabled: !!id,
  });
}

export function useTraderPortfolios(traderId: string) {
  return useQuery({
    queryKey: traderKeys.portfolios(traderId),
    queryFn: async ({ signal }) => {
      try {
        return await api.get<Portfolio[]>(
          `/traders/${traderId}/portfolios`,
          { signal }
        );
      } catch {
        await new Promise((r) => setTimeout(r, 200));
        return MOCK_PORTFOLIOS.filter((p) => p.trader_id === traderId);
      }
    },
    enabled: !!traderId,
  });
}

export function useTraderTrades(traderId: string, limit: number = 20) {
  return useQuery({
    queryKey: traderKeys.trades(traderId, limit),
    queryFn: async ({ signal }) => {
      try {
        return await api.get<PortfolioTrade[]>(
          `/traders/${traderId}/trades?limit=${limit}`,
          { signal }
        );
      } catch {
        await new Promise((r) => setTimeout(r, 200));
        return MOCK_TRADES.slice(0, limit);
      }
    },
    enabled: !!traderId,
  });
}
