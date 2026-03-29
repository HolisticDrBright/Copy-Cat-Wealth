import { Worker, type Job } from "bullmq";
import { redisConnection, executeQueue } from "../lib/queue";
import { supabase } from "../lib/supabase";
import type { MarketType, TradeSide, TradeDirection, OrderType, CopyStatus } from "@copy-cat/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface NormalizedSignal {
  portfolio_id: string;
  symbol: string;
  market: MarketType;
  side: TradeSide;
  direction: TradeDirection;
  order_type: OrderType;
  quantity: number;
  price: number;
  weight: number;
  weight_delta: number;
  source_id?: string;
}

interface DistributeJobData {
  portfolio_trade_id: string;
  portfolio_id: string;
  trader_id: string;
  normalized_signal: NormalizedSignal;
}

interface CopySubscriptionRow {
  id: string;
  user_id: string;
  broker_connection_id: string;
  allocation_amount: number;
  max_position_pct: number;
  copy_ratio: number;
  stop_loss_pct: number | null;
  markets_filter: MarketType[] | null;
  total_pnl: number;
  total_pnl_pct: number;
  status: CopyStatus;
}

// ---------------------------------------------------------------------------
// Fan-out: distribute signal to all copy subscribers
// ---------------------------------------------------------------------------
async function distributeSignal(job: Job<DistributeJobData>): Promise<void> {
  const { portfolio_trade_id, portfolio_id, trader_id, normalized_signal } = job.data;

  console.log(
    `[copy-distributor] Distributing trade ${portfolio_trade_id} for portfolio ${portfolio_id}`,
  );

  // Load all active copy subscriptions for this portfolio
  const { data: subscriptions, error } = await supabase
    .from("copy_subscriptions")
    .select("*")
    .eq("portfolio_id", portfolio_id)
    .eq("status", "active");

  if (error) {
    throw new Error(`Failed to load subscriptions: ${error.message}`);
  }

  if (!subscriptions || subscriptions.length === 0) {
    console.log(`[copy-distributor] No active subscribers for portfolio ${portfolio_id}`);
    return;
  }

  console.log(
    `[copy-distributor] Found ${subscriptions.length} active subscriber(s) for portfolio ${portfolio_id}`,
  );

  const executeJobs: Array<{ name: string; data: Record<string, unknown>; opts: Record<string, unknown> }> = [];

  for (const sub of subscriptions as CopySubscriptionRow[]) {
    // Check market filter - skip if subscriber doesn't want this market
    if (sub.markets_filter && sub.markets_filter.length > 0) {
      if (!sub.markets_filter.includes(normalized_signal.market)) {
        console.log(
          `[copy-distributor] Skipping user ${sub.user_id}: market ${normalized_signal.market} not in filter`,
        );
        continue;
      }
    }

    // Calculate dollar amount based on allocation and copy ratio
    const tradeValue = normalized_signal.quantity * normalized_signal.price;
    const rawDollarAmount = tradeValue * sub.copy_ratio;
    const allocatedAmount = sub.allocation_amount;

    // Apply max_position_pct guard
    const maxPositionValue = allocatedAmount * (sub.max_position_pct / 100);
    const dollarAmount = Math.min(rawDollarAmount, maxPositionValue);

    if (dollarAmount <= 0) {
      console.log(`[copy-distributor] Skipping user ${sub.user_id}: calculated amount <= 0`);
      continue;
    }

    // Apply stop-loss check: if subscriber's total PnL has breached stop_loss_pct, skip
    if (sub.stop_loss_pct !== null && sub.stop_loss_pct > 0) {
      const lossThreshold = -(sub.stop_loss_pct / 100) * allocatedAmount;
      if (sub.total_pnl <= lossThreshold) {
        console.log(
          `[copy-distributor] Skipping user ${sub.user_id}: stop-loss hit (PnL: ${sub.total_pnl}, threshold: ${lossThreshold})`,
        );

        // Pause the subscription automatically
        await supabase
          .from("copy_subscriptions")
          .update({ status: "paused", updated_at: new Date().toISOString() })
          .eq("id", sub.id);

        continue;
      }
    }

    // Calculate quantity based on dollar amount and price
    const executionQuantity = dollarAmount / normalized_signal.price;

    // Use portfolioTradeId + userId as idempotency key
    const idempotencyKey = `exec-${portfolio_trade_id}-${sub.user_id}`;

    executeJobs.push({
      name: "execute",
      data: {
        copy_subscription_id: sub.id,
        user_id: sub.user_id,
        broker_connection_id: sub.broker_connection_id,
        portfolio_trade_id,
        symbol: normalized_signal.symbol,
        market: normalized_signal.market,
        side: normalized_signal.side,
        direction: normalized_signal.direction,
        order_type: normalized_signal.order_type,
        quantity: Math.round(executionQuantity * 10000) / 10000, // 4 decimal precision
        price: normalized_signal.price,
        dollar_amount: dollarAmount,
      },
      opts: {
        jobId: idempotencyKey,
      },
    });
  }

  // Bulk enqueue all trade-execute jobs
  if (executeJobs.length > 0) {
    await executeQueue.addBulk(executeJobs);
    console.log(
      `[copy-distributor] Enqueued ${executeJobs.length} trade-execute job(s) for trade ${portfolio_trade_id}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------
const distributorWorker = new Worker<DistributeJobData>("copy-distribute", distributeSignal, {
  connection: redisConnection,
  concurrency: 5,
});

distributorWorker.on("completed", (job) => {
  console.log(`[copy-distributor] Job ${job.id} completed`);
});

distributorWorker.on("failed", (job, err) => {
  console.error(`[copy-distributor] Job ${job?.id} failed:`, err.message);
});

distributorWorker.on("error", (err) => {
  console.error("[copy-distributor] Worker error:", err.message);
});

export default distributorWorker;
