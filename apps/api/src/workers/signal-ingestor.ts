import { Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import { redisConnection, distributeQueue } from "../lib/queue";
import { supabase } from "../lib/supabase";
import type { MarketType, TradeAction, TradeDirection, TradeSignal } from "@copy-cat/shared";

// ---------------------------------------------------------------------------
// Redis client for snapshot storage
// ---------------------------------------------------------------------------
const redis = new Redis({
  host: redisConnection.host,
  port: redisConnection.port,
  password: redisConnection.password,
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
/** Minimum absolute weight change (in percent) to emit a signal */
const WEIGHT_DIFF_THRESHOLD = 0.5;
/** Snapshot TTL: 7 days in seconds */
const SNAPSHOT_TTL_SECONDS = 7 * 24 * 60 * 60;

// ---------------------------------------------------------------------------
// Rate limit configuration per broker (informational — applied at poll layer)
// ---------------------------------------------------------------------------
export const BROKER_RATE_LIMITS: Record<
  string,
  { maxPerWindow: number; windowSeconds: number; pollIntervalSeconds: number; transport: "poll" | "websocket" }
> = {
  alpaca: { maxPerWindow: 200, windowSeconds: 60, pollIntervalSeconds: 60, transport: "poll" },
  coinbase: { maxPerWindow: Infinity, windowSeconds: 0, pollIntervalSeconds: 0, transport: "websocket" },
  oanda: { maxPerWindow: 100, windowSeconds: 1, pollIntervalSeconds: 60, transport: "poll" },
  polymarket: { maxPerWindow: 60, windowSeconds: 60, pollIntervalSeconds: 120, transport: "poll" },
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface PositionWeight {
  symbol: string;
  market: MarketType;
  direction: TradeDirection;
  weight_pct: number;
  price: number;
}

interface SnapshotData {
  positions: Record<string, PositionWeight>;
  total_value: number;
  timestamp: string;
}

interface SignalJobData {
  portfolio_trade_id: string;
  portfolio_id: string;
  trader_id: string;
  market: MarketType;
  signal: {
    portfolio_id: string;
    symbol: string;
    market: MarketType;
    side: "buy" | "sell";
    direction: TradeDirection;
    order_type: string;
    quantity: number;
    price: number;
    source_id?: string;
  };
}

// ---------------------------------------------------------------------------
// Snapshot helpers
// ---------------------------------------------------------------------------
function snapshotKey(traderId: string, market: MarketType): string {
  return `snapshot:${traderId}:${market}`;
}

async function getSnapshot(traderId: string, market: MarketType): Promise<SnapshotData | null> {
  const raw = await redis.get(snapshotKey(traderId, market));
  if (!raw) return null;
  return JSON.parse(raw) as SnapshotData;
}

async function setSnapshot(traderId: string, market: MarketType, snapshot: SnapshotData): Promise<void> {
  await redis.set(snapshotKey(traderId, market), JSON.stringify(snapshot), "EX", SNAPSHOT_TTL_SECONDS);
}

// ---------------------------------------------------------------------------
// Build current snapshot from portfolio positions
// ---------------------------------------------------------------------------
async function buildCurrentSnapshot(portfolioId: string, market: MarketType): Promise<SnapshotData> {
  const { data: portfolio } = await supabase
    .from("portfolios")
    .select("total_value")
    .eq("id", portfolioId)
    .single();

  const totalValue = portfolio?.total_value ?? 0;

  const { data: positions } = await supabase
    .from("portfolio_positions")
    .select("symbol, market, direction, quantity, avg_entry_price, current_price")
    .eq("portfolio_id", portfolioId);

  const posMap: Record<string, PositionWeight> = {};

  for (const pos of positions ?? []) {
    if (market !== "all" && pos.market !== market) continue;
    const posValue = pos.quantity * (pos.current_price ?? pos.avg_entry_price);
    const weightPct = totalValue > 0 ? (posValue / totalValue) * 100 : 0;
    const key = `${pos.symbol}:${pos.direction}`;
    posMap[key] = {
      symbol: pos.symbol,
      market: pos.market,
      direction: pos.direction,
      weight_pct: Math.round(weightPct * 100) / 100,
      price: pos.current_price ?? pos.avg_entry_price,
    };
  }

  return {
    positions: posMap,
    total_value: totalValue,
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Determine trade action from weight change
// ---------------------------------------------------------------------------
function determineAction(before: number, after: number): TradeAction {
  if (after === 0) return "close";
  if (before === 0) return "open";
  if (after > before) return "add";
  return "reduce";
}

// ---------------------------------------------------------------------------
// Diff algorithm: compare previous snapshot to current, emit signals
// ---------------------------------------------------------------------------
async function diffAndEmitSignals(
  portfolioId: string,
  traderId: string,
  market: MarketType,
  portfolioTradeId: string,
): Promise<TradeSignal[]> {
  const previous = await getSnapshot(traderId, market);
  const current = await buildCurrentSnapshot(portfolioId, market);

  // Persist the new snapshot
  await setSnapshot(traderId, market, current);

  const signals: TradeSignal[] = [];
  const allKeys = new Set<string>();

  // Collect all position keys from both snapshots
  if (previous) {
    for (const key of Object.keys(previous.positions)) allKeys.add(key);
  }
  for (const key of Object.keys(current.positions)) allKeys.add(key);

  for (const key of allKeys) {
    const prev = previous?.positions[key];
    const curr = current.positions[key];

    const weightBefore = prev?.weight_pct ?? 0;
    const weightAfter = curr?.weight_pct ?? 0;
    const weightDiff = Math.abs(weightAfter - weightBefore);

    // Only emit signal if weight change exceeds threshold
    if (weightDiff <= WEIGHT_DIFF_THRESHOLD) continue;

    const pos = curr ?? prev!;
    const action = determineAction(weightBefore, weightAfter);
    const side: TradeDirection = pos.direction;

    const signal: TradeSignal = {
      portfolioId,
      tradeId: portfolioTradeId,
      symbol: pos.symbol,
      market: pos.market,
      action,
      side,
      weight_pct_before: weightBefore,
      weight_pct_after: weightAfter,
      price: pos.price,
      timestamp: current.timestamp,
    };

    signals.push(signal);
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Process signal: snapshot + diff + enqueue distribution
// ---------------------------------------------------------------------------
async function processSignal(job: Job<SignalJobData>): Promise<void> {
  const { portfolio_trade_id, portfolio_id, trader_id, signal } = job.data;
  const market = signal.market;

  console.log(`[signal-ingestor] Processing signal ${portfolio_trade_id} for ${signal.symbol}`);

  // Run diff algorithm against stored snapshot
  const tradeSignals = await diffAndEmitSignals(portfolio_id, trader_id, market, portfolio_trade_id);

  if (tradeSignals.length === 0) {
    console.log(
      `[signal-ingestor] No weight changes above ${WEIGHT_DIFF_THRESHOLD}% threshold — skipping distribution`,
    );
    return;
  }

  console.log(`[signal-ingestor] Emitting ${tradeSignals.length} signal(s) from diff`);

  // Enqueue a distribute job for each emitted signal
  for (const ts of tradeSignals) {
    await distributeQueue.add(
      "distribute",
      {
        portfolio_trade_id,
        portfolio_id,
        trader_id,
        trade_signal: ts,
      },
      {
        jobId: `distribute-${portfolio_trade_id}-${ts.symbol}-${ts.action}`,
      },
    );
  }

  console.log(`[signal-ingestor] Enqueued ${tradeSignals.length} distribute job(s) for trade ${portfolio_trade_id}`);
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------
const signalWorker = new Worker<SignalJobData>("signal-ingest", processSignal, {
  connection: redisConnection,
  concurrency: 10,
  limiter: {
    max: 50,
    duration: 1000,
  },
});

signalWorker.on("completed", (job) => {
  console.log(`[signal-ingestor] Job ${job.id} completed`);
});

signalWorker.on("failed", (job, err) => {
  console.error(`[signal-ingestor] Job ${job?.id} failed:`, err.message);
});

signalWorker.on("error", (err) => {
  console.error("[signal-ingestor] Worker error:", err.message);
});

export default signalWorker;
