import { supabase } from "../lib/supabase";
import type { TraderStats } from "@copy-cat/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type StatsPeriod = TraderStats["period"];

interface ComputedStats {
  trader_id: string;
  period: StatsPeriod;
  total_return_pct: number;
  win_rate: number;
  avg_gain_pct: number;
  avg_loss_pct: number;
  profit_factor: number;
  sharpe_ratio: number;
  max_drawdown_pct: number;
  total_trades: number;
  avg_hold_time_hours: number;
  best_trade_pct: number;
  worst_trade_pct: number;
}

interface CompositeScoreWeights {
  return_weight: number;
  sharpe_weight: number;
  drawdown_weight: number;
  consistency_weight: number;
  volume_weight: number;
}

type Badge = "hot" | "consistent" | "low_risk" | "high_volume" | "top_performer";

const DEFAULT_WEIGHTS: CompositeScoreWeights = {
  return_weight: 0.30,
  sharpe_weight: 0.25,
  drawdown_weight: 0.20,
  consistency_weight: 0.15,
  volume_weight: 0.10,
};

// ---------------------------------------------------------------------------
// Period to days mapping
// ---------------------------------------------------------------------------
const PERIOD_DAYS: Record<StatsPeriod, number | null> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "1y": 365,
  all: null,
};

// ---------------------------------------------------------------------------
// computeTraderStats - calculates stats for a trader over a period
// ---------------------------------------------------------------------------
export async function computeTraderStats(
  traderId: string,
  period: StatsPeriod,
): Promise<ComputedStats> {
  // Resolve portfolio IDs for this trader
  const { data: portfolios } = await supabase
    .from("portfolios")
    .select("id")
    .eq("trader_id", traderId);

  const portfolioIds = (portfolios ?? []).map((p: any) => p.id);

  if (portfolioIds.length === 0) {
    return emptyStats(traderId, period);
  }

  // Fetch trades within the period
  let query = supabase
    .from("portfolio_trades")
    .select("*")
    .in("portfolio_id", portfolioIds)
    .eq("status", "filled")
    .order("executed_at", { ascending: true });

  const days = PERIOD_DAYS[period];
  if (days !== null) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    query = query.gte("executed_at", since);
  }

  const { data: trades, error } = await query;

  if (error || !trades || trades.length === 0) {
    return emptyStats(traderId, period);
  }

  // Calculate basic stats
  const totalTrades = trades.length;
  const tradesWithPnl = trades.filter((t: any) => t.realized_pnl !== null);
  const winners = tradesWithPnl.filter((t: any) => t.realized_pnl > 0);
  const losers = tradesWithPnl.filter((t: any) => t.realized_pnl < 0);

  const winRate = tradesWithPnl.length > 0 ? winners.length / tradesWithPnl.length : 0;

  // Average gain/loss percentages
  const avgGainPct =
    winners.length > 0
      ? winners.reduce((s: number, t: any) => s + (t.realized_pnl_pct ?? 0), 0) / winners.length
      : 0;

  const avgLossPct =
    losers.length > 0
      ? losers.reduce((s: number, t: any) => s + Math.abs(t.realized_pnl_pct ?? 0), 0) / losers.length
      : 0;

  // Profit factor = gross profit / gross loss
  const grossProfit = winners.reduce((s: number, t: any) => s + (t.realized_pnl ?? 0), 0);
  const grossLoss = Math.abs(losers.reduce((s: number, t: any) => s + (t.realized_pnl ?? 0), 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  // Total return percentage
  const totalPnl = tradesWithPnl.reduce((s: number, t: any) => s + (t.realized_pnl ?? 0), 0);
  const totalInvested = trades.reduce((s: number, t: any) => s + (t.total_value ?? 0), 0);
  const totalReturnPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

  // Sharpe ratio (simplified: using trade returns)
  const returns = tradesWithPnl.map((t: any) => t.realized_pnl_pct ?? 0);
  const sharpeRatio = computeSharpeRatio(returns);

  // Max drawdown
  const maxDrawdownPct = computeMaxDrawdown(trades);

  // Average hold time in hours
  const holdTimes = trades
    .filter((t: any) => t.executed_at)
    .map((t: any) => {
      const created = new Date(t.created_at).getTime();
      const executed = new Date(t.executed_at).getTime();
      return Math.max(0, (executed - created) / (1000 * 60 * 60));
    });
  const avgHoldTimeHours =
    holdTimes.length > 0 ? holdTimes.reduce((a, b) => a + b, 0) / holdTimes.length : 0;

  // Best and worst trades
  const pnlPcts = tradesWithPnl.map((t: any) => t.realized_pnl_pct ?? 0);
  const bestTradePct = pnlPcts.length > 0 ? Math.max(...pnlPcts) : 0;
  const worstTradePct = pnlPcts.length > 0 ? Math.min(...pnlPcts) : 0;

  return {
    trader_id: traderId,
    period,
    total_return_pct: round(totalReturnPct),
    win_rate: round(winRate),
    avg_gain_pct: round(avgGainPct),
    avg_loss_pct: round(avgLossPct),
    profit_factor: round(Math.min(profitFactor, 999)),
    sharpe_ratio: round(sharpeRatio),
    max_drawdown_pct: round(maxDrawdownPct),
    total_trades: totalTrades,
    avg_hold_time_hours: round(avgHoldTimeHours),
    best_trade_pct: round(bestTradePct),
    worst_trade_pct: round(worstTradePct),
  };
}

// ---------------------------------------------------------------------------
// computeCompositeScore - weighted score for leaderboard ranking
// ---------------------------------------------------------------------------
export function computeCompositeScore(
  stats: ComputedStats,
  weights: CompositeScoreWeights = DEFAULT_WEIGHTS,
): number {
  // Normalize each metric to a 0-100 scale
  const returnScore = normalizeReturn(stats.total_return_pct);
  const sharpeScore = normalizeSharpe(stats.sharpe_ratio);
  const drawdownScore = normalizeDrawdown(stats.max_drawdown_pct);
  const consistencyScore = normalizeConsistency(stats.win_rate, stats.profit_factor);
  const volumeScore = normalizeVolume(stats.total_trades);

  const composite =
    returnScore * weights.return_weight +
    sharpeScore * weights.sharpe_weight +
    drawdownScore * weights.drawdown_weight +
    consistencyScore * weights.consistency_weight +
    volumeScore * weights.volume_weight;

  return round(Math.max(0, Math.min(100, composite)));
}

// ---------------------------------------------------------------------------
// assignBadges - determines badges based on stats
// ---------------------------------------------------------------------------
export function assignBadges(stats: ComputedStats): Badge[] {
  const badges: Badge[] = [];

  // "hot" - high recent returns (top performer in short term)
  if (stats.total_return_pct > 20 && stats.period === "7d") {
    badges.push("hot");
  } else if (stats.total_return_pct > 30 && stats.period === "30d") {
    badges.push("hot");
  }

  // "consistent" - high win rate with good profit factor
  if (stats.win_rate > 0.6 && stats.profit_factor > 1.5 && stats.total_trades >= 20) {
    badges.push("consistent");
  }

  // "low_risk" - low max drawdown with positive returns
  if (stats.max_drawdown_pct < 10 && stats.total_return_pct > 0 && stats.total_trades >= 10) {
    badges.push("low_risk");
  }

  // "high_volume" - active trader with many trades
  if (stats.total_trades >= 100) {
    badges.push("high_volume");
  }

  // "top_performer" - exceptional overall stats
  if (
    stats.total_return_pct > 50 &&
    stats.sharpe_ratio > 2 &&
    stats.win_rate > 0.55
  ) {
    badges.push("top_performer");
  }

  return badges;
}

// ---------------------------------------------------------------------------
// updateAllTraderStats - cron job function to refresh all trader stats
// ---------------------------------------------------------------------------
export async function updateAllTraderStats(): Promise<{
  updated: number;
  failed: number;
  errors: string[];
}> {
  const periods: StatsPeriod[] = ["7d", "30d", "90d", "1y", "all"];
  let updated = 0;
  let failed = 0;
  const errors: string[] = [];

  // Fetch all public traders
  const { data: traders, error } = await supabase
    .from("traders")
    .select("id")
    .eq("is_public", true);

  if (error || !traders) {
    return { updated: 0, failed: 0, errors: [error?.message ?? "Failed to fetch traders"] };
  }

  console.log(`[leaderboard] Updating stats for ${traders.length} trader(s) across ${periods.length} period(s)`);

  for (const trader of traders) {
    for (const period of periods) {
      try {
        const stats = await computeTraderStats(trader.id, period);
        const compositeScore = computeCompositeScore(stats);
        const badges = assignBadges(stats);

        // Upsert stats into trader_stats table
        const { error: upsertErr } = await supabase
          .from("trader_stats")
          .upsert(
            {
              ...stats,
              composite_score: compositeScore,
              badges,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "trader_id,period" },
          );

        if (upsertErr) {
          failed++;
          errors.push(`Trader ${trader.id} (${period}): ${upsertErr.message}`);
        } else {
          updated++;
        }
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : "Unknown error";
        errors.push(`Trader ${trader.id} (${period}): ${msg}`);
      }
    }
  }

  console.log(`[leaderboard] Stats update complete: ${updated} updated, ${failed} failed`);
  return { updated, failed, errors };
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function emptyStats(traderId: string, period: StatsPeriod): ComputedStats {
  return {
    trader_id: traderId,
    period,
    total_return_pct: 0,
    win_rate: 0,
    avg_gain_pct: 0,
    avg_loss_pct: 0,
    profit_factor: 0,
    sharpe_ratio: 0,
    max_drawdown_pct: 0,
    total_trades: 0,
    avg_hold_time_hours: 0,
    best_trade_pct: 0,
    worst_trade_pct: 0,
  };
}

function computeSharpeRatio(returns: number[], riskFreeRate = 0): number {
  if (returns.length < 2) return 0;

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (returns.length - 1);
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return 0;

  // Annualize: assume ~252 trading days
  const annualizedReturn = mean * 252;
  const annualizedStdDev = stdDev * Math.sqrt(252);

  return (annualizedReturn - riskFreeRate) / annualizedStdDev;
}

function computeMaxDrawdown(trades: any[]): number {
  if (trades.length === 0) return 0;

  let peak = 0;
  let cumulative = 0;
  let maxDrawdown = 0;

  for (const trade of trades) {
    cumulative += trade.realized_pnl ?? 0;
    if (cumulative > peak) peak = cumulative;
    const drawdown = peak > 0 ? ((peak - cumulative) / peak) * 100 : 0;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  return maxDrawdown;
}

/** Normalize total return to 0-100 score */
function normalizeReturn(returnPct: number): number {
  // Cap at 200% for scoring purposes, -100% maps to 0
  return Math.max(0, Math.min(100, ((returnPct + 100) / 300) * 100));
}

/** Normalize Sharpe ratio to 0-100 score */
function normalizeSharpe(sharpe: number): number {
  // Sharpe of 3+ = excellent = 100, 0 = 50, -2 = 0
  return Math.max(0, Math.min(100, ((sharpe + 2) / 5) * 100));
}

/** Normalize drawdown to 0-100 score (lower drawdown = higher score) */
function normalizeDrawdown(drawdownPct: number): number {
  // 0% drawdown = 100, 50%+ drawdown = 0
  return Math.max(0, Math.min(100, (1 - drawdownPct / 50) * 100));
}

/** Normalize consistency (win rate + profit factor) to 0-100 */
function normalizeConsistency(winRate: number, profitFactor: number): number {
  const wrScore = winRate * 100;
  const pfScore = Math.min(profitFactor / 3, 1) * 100;
  return (wrScore + pfScore) / 2;
}

/** Normalize trade volume to 0-100 score */
function normalizeVolume(totalTrades: number): number {
  // Log scale: 1 trade = ~0, 10 trades = ~50, 100+ = ~100
  if (totalTrades <= 0) return 0;
  return Math.min(100, (Math.log10(totalTrades) / 2) * 100);
}

function round(n: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}
