import { Worker, type Job } from "bullmq";
import { redisConnection } from "../lib/queue";
import { supabase } from "../lib/supabase";
import type { BrokerProvider, MarketType, TradeSide, TradeDirection, OrderType } from "@copy-cat/shared";
import { AlpacaAdapter } from "../brokers/alpaca";
import { CoinbaseAdapter } from "../brokers/coinbase";
import { OandaAdapter } from "../brokers/oanda";
import { PolymarketAdapter } from "../brokers/polymarket";
import type { BrokerAdapter, TradeParams, TradeResult } from "../brokers/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ExecuteJobData {
  copy_subscription_id: string;
  user_id: string;
  broker_connection_id: string;
  portfolio_trade_id: string;
  symbol: string;
  market: MarketType;
  side: TradeSide;
  direction: TradeDirection;
  order_type: OrderType;
  quantity: number;
  price: number;
  dollar_amount: number;
}

// ---------------------------------------------------------------------------
// Broker adapter factory
// ---------------------------------------------------------------------------
function getBrokerAdapter(provider: BrokerProvider, credentials: { accessToken: string; refreshToken?: string }): BrokerAdapter {
  switch (provider) {
    case "alpaca":
      return new AlpacaAdapter(credentials);
    case "coinbase":
      return new CoinbaseAdapter(credentials);
    case "oanda":
      return new OandaAdapter(credentials);
    case "polymarket":
      return new PolymarketAdapter(credentials);
    default:
      throw new Error(`Unsupported broker provider: ${provider}`);
  }
}

// ---------------------------------------------------------------------------
// Execute trade for individual subscriber
// ---------------------------------------------------------------------------
async function executeTrade(job: Job<ExecuteJobData>): Promise<void> {
  const data = job.data;

  console.log(
    `[trade-executor] Executing trade for user ${data.user_id}: ${data.side} ${data.quantity} ${data.symbol}`,
  );

  // Fetch broker connection details
  const { data: connection, error: connErr } = await supabase
    .from("broker_connections")
    .select("provider, access_token_encrypted, refresh_token_encrypted, status")
    .eq("id", data.broker_connection_id)
    .single();

  if (connErr || !connection) {
    await storeFailedTrade(data, "Broker connection not found");
    throw new Error("Broker connection not found");
  }

  if (connection.status !== "connected") {
    await storeFailedTrade(data, `Broker is ${connection.status}`);
    throw new Error(`Broker is ${connection.status}`);
  }

  const adapter = getBrokerAdapter(connection.provider as BrokerProvider, {
    accessToken: connection.access_token_encrypted,
    refreshToken: connection.refresh_token_encrypted ?? undefined,
  });

  const tradeParams: TradeParams = {
    symbol: data.symbol,
    market: data.market,
    side: data.side,
    direction: data.direction,
    orderType: data.order_type,
    quantity: data.quantity,
    price: data.price,
  };

  let result: TradeResult;

  try {
    result = await adapter.executeTrade(tradeParams);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown broker error";
    console.error(`[trade-executor] Broker execution failed for user ${data.user_id}:`, errorMessage);
    await storeFailedTrade(data, errorMessage);
    throw err; // Re-throw so BullMQ retries (3 attempts with exponential backoff)
  }

  // Store successful trade result
  const { error: insertErr } = await supabase.from("user_trades").insert({
    user_id: data.user_id,
    copy_subscription_id: data.copy_subscription_id,
    source_trade_id: data.portfolio_trade_id,
    broker_connection_id: data.broker_connection_id,
    symbol: data.symbol,
    market: data.market,
    side: data.side,
    direction: data.direction,
    order_type: data.order_type,
    quantity: result.filledQuantity,
    price: result.filledPrice,
    total_value: result.filledQuantity * result.filledPrice,
    realized_pnl: null,
    realized_pnl_pct: null,
    status: result.status,
    broker_order_id: result.orderId,
    error_message: null,
    executed_at: new Date().toISOString(),
  });

  if (insertErr) {
    console.error(`[trade-executor] Failed to store trade result:`, insertErr.message);
  }

  // Update copy subscription trade count
  await supabase.rpc("increment_trades_copied", {
    subscription_id: data.copy_subscription_id,
  });

  console.log(
    `[trade-executor] Trade executed for user ${data.user_id}: ${result.status} ${result.filledQuantity} ${data.symbol} @ ${result.filledPrice}`,
  );
}

// ---------------------------------------------------------------------------
// Store failed trade with error reason
// ---------------------------------------------------------------------------
async function storeFailedTrade(data: ExecuteJobData, reason: string): Promise<void> {
  const { error } = await supabase.from("user_trades").insert({
    user_id: data.user_id,
    copy_subscription_id: data.copy_subscription_id,
    source_trade_id: data.portfolio_trade_id,
    broker_connection_id: data.broker_connection_id,
    symbol: data.symbol,
    market: data.market,
    side: data.side,
    direction: data.direction,
    order_type: data.order_type,
    quantity: data.quantity,
    price: data.price,
    total_value: data.dollar_amount,
    realized_pnl: null,
    realized_pnl_pct: null,
    status: "rejected",
    broker_order_id: null,
    error_message: reason,
    executed_at: null,
  });

  if (error) {
    console.error(`[trade-executor] Failed to store failed trade record:`, error.message);
  }
}

// ---------------------------------------------------------------------------
// Worker - 3 retry attempts with exponential backoff (configured in queue.ts)
// ---------------------------------------------------------------------------
const executorWorker = new Worker<ExecuteJobData>("trade-execute", executeTrade, {
  connection: redisConnection,
  concurrency: 20,
});

executorWorker.on("completed", (job) => {
  console.log(`[trade-executor] Job ${job.id} completed`);
});

executorWorker.on("failed", (job, err) => {
  console.error(`[trade-executor] Job ${job?.id} failed after ${job?.attemptsMade} attempt(s):`, err.message);

  // Log permanent failure after all retries exhausted
  if (job && job.attemptsMade >= 3) {
    console.error(
      `[trade-executor] PERMANENT FAILURE: Job ${job.id} for user ${job.data.user_id}, symbol ${job.data.symbol}`,
    );
  }
});

executorWorker.on("error", (err) => {
  console.error("[trade-executor] Worker error:", err.message);
});

export default executorWorker;
