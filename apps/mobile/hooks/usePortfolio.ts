import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { PnlDataPoint } from "@copy-cat/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PortfolioSummary {
  total_value: number;
  total_pnl: number;
  total_pnl_pct: number;
  day_pnl: number;
  day_pnl_pct: number;
  buying_power: number;
  positions: PositionSummary[];
}

export interface PositionSummary {
  symbol: string;
  market: string;
  quantity: number;
  avg_entry_price: number;
  current_price: number;
  unrealized_pnl: number;
  unrealized_pnl_pct: number;
  allocation_pct: number;
}

export type HistoryPeriod = "1D" | "1W" | "1M" | "All";

// ---------------------------------------------------------------------------
// Mock data for development
// ---------------------------------------------------------------------------

const MOCK_POSITIONS: PositionSummary[] = [
  {
    symbol: "NVDA",
    market: "stocks",
    quantity: 10,
    avg_entry_price: 820,
    current_price: 875.5,
    unrealized_pnl: 555,
    unrealized_pnl_pct: 6.77,
    allocation_pct: 32.1,
  },
  {
    symbol: "BTC",
    market: "crypto",
    quantity: 0.15,
    avg_entry_price: 62000,
    current_price: 67400,
    unrealized_pnl: 810,
    unrealized_pnl_pct: 8.71,
    allocation_pct: 24.8,
  },
  {
    symbol: "AAPL",
    market: "stocks",
    quantity: 25,
    avg_entry_price: 215,
    current_price: 228.4,
    unrealized_pnl: 335,
    unrealized_pnl_pct: 6.23,
    allocation_pct: 18.5,
  },
  {
    symbol: "ETH",
    market: "crypto",
    quantity: 2.5,
    avg_entry_price: 3200,
    current_price: 3450,
    unrealized_pnl: 625,
    unrealized_pnl_pct: 7.81,
    allocation_pct: 12.4,
  },
];

const MOCK_SUMMARY: PortfolioSummary = {
  total_value: 86200,
  total_pnl: 12450,
  total_pnl_pct: 16.88,
  day_pnl: 720,
  day_pnl_pct: 0.84,
  buying_power: 23700,
  positions: MOCK_POSITIONS,
};

function generateMockHistory(period: HistoryPeriod): PnlDataPoint[] {
  const now = Date.now();
  const points: PnlDataPoint[] = [];

  let count: number;
  let intervalMs: number;
  switch (period) {
    case "1D":
      count = 78; // ~5 min candles in a trading day
      intervalMs = 5 * 60 * 1000;
      break;
    case "1W":
      count = 35; // ~5 points per day for 7 days
      intervalMs = 4 * 60 * 60 * 1000;
      break;
    case "1M":
      count = 30;
      intervalMs = 24 * 60 * 60 * 1000;
      break;
    case "All":
    default:
      count = 90;
      intervalMs = 24 * 60 * 60 * 1000;
      break;
  }

  let value = 73000;
  for (let i = 0; i < count; i++) {
    const timestamp = new Date(now - (count - i) * intervalMs).toISOString();
    // Random walk with slight upward bias
    value += (Math.random() - 0.45) * 400;
    value = Math.max(value, 60000);
    points.push({ timestamp, value: Math.round(value * 100) / 100 });
  }

  // Make the last point match the summary total value
  if (points.length > 0) {
    points[points.length - 1].value = 86200;
  }

  return points;
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

const portfolioKeys = {
  all: ["portfolio"] as const,
  summary: () => ["portfolio", "summary"] as const,
  history: (period: HistoryPeriod) =>
    ["portfolio", "history", period] as const,
};

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function usePortfolioSummary() {
  return useQuery({
    queryKey: portfolioKeys.summary(),
    queryFn: async ({ signal }) => {
      try {
        return await api.get<PortfolioSummary>("/portfolio/summary", {
          signal,
        });
      } catch {
        await new Promise((r) => setTimeout(r, 300));
        return MOCK_SUMMARY;
      }
    },
  });
}

export function usePortfolioHistory(period: HistoryPeriod = "1M") {
  return useQuery({
    queryKey: portfolioKeys.history(period),
    queryFn: async ({ signal }) => {
      try {
        return await api.get<PnlDataPoint[]>(
          `/portfolio/history?period=${period}`,
          { signal }
        );
      } catch {
        await new Promise((r) => setTimeout(r, 200));
        return generateMockHistory(period);
      }
    },
  });
}
