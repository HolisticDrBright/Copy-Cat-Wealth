import { Worker, type Job } from "bullmq";
import { redisConnection, distributeQueue } from "../lib/queue";
import { supabase } from "../lib/supabase";
import type { MarketType, TradeSide, TradeDirection, OrderType } from "@copy-cat/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface TradeSignal {
  portfolio_id: string;
  symbol: string;
  market: MarketType;
  side: TradeSide;
  direction: TradeDirection;
  order_type: OrderType;
  quantity: number;
  price: number;
  source_id?: string;
}

interface SignalJobData {
  portfolio_trade_id: string;
  portfolio_id: string;
  trader_id: string;
  signal: TradeSignal;
}

interface NormalizedSignal extends TradeSignal {
  /** Weight of this position relative to portfolio total value (0-1) */
  weight: number;
  /** Change in weight from previous position */
  weight_delta: number;
}

// ---------------------------------------------------------------------------
// Signal normalization: calculate weight relative to portfolio
// ---------------------------------------------------------------------------
async function normalizeSignal(signal: TradeSignal): Promise<NormalizedSignal> {
  // Fetch portfolio total value for weight calculation
  const { data: portfolio } = await supabase
    .from("portfolios")
    .select("total_value, cash_balance")
    .eq("id", signal.portfolio_id)
    .single();

  const portfolioValue = portfolio?.total_value ?? 0;
  const tradeValue = signal.quantity * signal.price;
  const weight = portfolioValue > 0 ? tradeValue / portfolioValue : 0;

  // Fetch current position to calculate weight delta
  const { data: currentPosition } = await supabase
    .from("portfolio_positions")
    .select("quantity, avg_entry_price")
    .eq("portfolio_id", signal.portfolio_id)
    .eq("symbol", signal.symbol)
    .eq("direction", signal.direction)
    .single();

  let previousWeight = 0;
  if (currentPosition && portfolioValue > 0) {
    const currentValue = currentPosition.quantity * currentPosition.avg_entry_price;
    previousWeight = currentValue / portfolioValue;
  }

  const newWeight = signal.side === "buy" ? previousWeight + weight : previousWeight - weight;
  const weightDelta = newWeight - previousWeight;

  return {
    ...signal,
    weight: Math.max(0, newWeight),
    weight_delta: weightDelta,
  };
}

// ---------------------------------------------------------------------------
// Process signal: normalize and enqueue distribution
// ---------------------------------------------------------------------------
async function processSignal(job: Job<SignalJobData>): Promise<void> {
  const { portfolio_trade_id, portfolio_id, trader_id, signal } = job.data;

  console.log(`[signal-ingestor] Processing signal ${portfolio_trade_id} for ${signal.symbol}`);

  // Step 1: Normalize signal to standard schema with weights
  const normalized = await normalizeSignal(signal);

  console.log(
    `[signal-ingestor] Normalized: ${signal.symbol} weight=${normalized.weight.toFixed(4)} delta=${normalized.weight_delta.toFixed(4)}`,
  );

  // Step 2: Enqueue copy-distribute job to fan out to subscribers
  await distributeQueue.add(
    "distribute",
    {
      portfolio_trade_id,
      portfolio_id,
      trader_id,
      normalized_signal: normalized,
    },
    {
      jobId: `distribute-${portfolio_trade_id}`,
    },
  );

  console.log(`[signal-ingestor] Enqueued distribute job for trade ${portfolio_trade_id}`);
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
