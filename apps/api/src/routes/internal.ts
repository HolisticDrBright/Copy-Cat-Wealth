import { Hono } from "hono";
import { supabase } from "../lib/supabase";
import { signalQueue } from "../lib/queue";
import type {
  MarketType,
  TradeSide,
  TradeDirection,
  OrderType,
  ApiResult,
} from "@copy-cat/shared";

const internal = new Hono();

// ---------------------------------------------------------------------------
// Signal schema for incoming trade signals
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
  /** Optional external signal source identifier */
  source_id?: string;
}

function validateSignal(body: unknown): { valid: true; signal: TradeSignal } | { valid: false; message: string } {
  if (!body || typeof body !== "object") {
    return { valid: false, message: "Request body must be a JSON object" };
  }

  const s = body as Record<string, unknown>;

  if (typeof s.portfolio_id !== "string" || !s.portfolio_id) {
    return { valid: false, message: "portfolio_id is required and must be a string" };
  }
  if (typeof s.symbol !== "string" || !s.symbol) {
    return { valid: false, message: "symbol is required and must be a string" };
  }
  const validMarkets: MarketType[] = ["stocks", "options", "crypto", "forex", "futures"];
  if (!validMarkets.includes(s.market as MarketType)) {
    return { valid: false, message: `market must be one of: ${validMarkets.join(", ")}` };
  }
  const validSides: TradeSide[] = ["buy", "sell"];
  if (!validSides.includes(s.side as TradeSide)) {
    return { valid: false, message: `side must be one of: ${validSides.join(", ")}` };
  }
  const validDirections: TradeDirection[] = ["long", "short"];
  if (!validDirections.includes(s.direction as TradeDirection)) {
    return { valid: false, message: `direction must be one of: ${validDirections.join(", ")}` };
  }
  const validOrderTypes: OrderType[] = ["market", "limit", "stop", "stop_limit"];
  if (!validOrderTypes.includes(s.order_type as OrderType)) {
    return { valid: false, message: `order_type must be one of: ${validOrderTypes.join(", ")}` };
  }
  if (typeof s.quantity !== "number" || s.quantity <= 0) {
    return { valid: false, message: "quantity must be a positive number" };
  }
  if (typeof s.price !== "number" || s.price <= 0) {
    return { valid: false, message: "price must be a positive number" };
  }

  return {
    valid: true,
    signal: {
      portfolio_id: s.portfolio_id as string,
      symbol: s.symbol as string,
      market: s.market as MarketType,
      side: s.side as TradeSide,
      direction: s.direction as TradeDirection,
      order_type: s.order_type as OrderType,
      quantity: s.quantity as number,
      price: s.price as number,
      source_id: typeof s.source_id === "string" ? s.source_id : undefined,
    },
  };
}

// ---------------------------------------------------------------------------
// Internal auth middleware - verify shared secret
// ---------------------------------------------------------------------------
internal.use("*", async (c, next) => {
  const secret = c.req.header("x-internal-secret");
  const expected = process.env.INTERNAL_API_SECRET;

  if (!expected || secret !== expected) {
    return c.json<ApiResult<null>>(
      { data: null, error: { code: "UNAUTHORIZED", message: "Invalid internal secret" } },
      401,
    );
  }

  await next();
});

// ---------------------------------------------------------------------------
// POST /internal/signal  -  ingest trade signal from signal workers
// ---------------------------------------------------------------------------
internal.post("/signal", async (c) => {
  const body = await c.req.json();
  const result = validateSignal(body);

  if (!result.valid) {
    return c.json<ApiResult<null>>(
      { data: null, error: { code: "VALIDATION_ERROR", message: result.message } },
      400,
    );
  }

  const signal = result.signal;

  // Verify portfolio exists
  const { data: portfolio, error: portfolioErr } = await supabase
    .from("portfolios")
    .select("id, trader_id")
    .eq("id", signal.portfolio_id)
    .single();

  if (portfolioErr || !portfolio) {
    return c.json<ApiResult<null>>(
      { data: null, error: { code: "NOT_FOUND", message: "Portfolio not found" } },
      404,
    );
  }

  // Create portfolio_trade record
  const totalValue = signal.quantity * signal.price;
  const { data: trade, error: tradeErr } = await supabase
    .from("portfolio_trades")
    .insert({
      portfolio_id: signal.portfolio_id,
      symbol: signal.symbol,
      market: signal.market,
      side: signal.side,
      direction: signal.direction,
      order_type: signal.order_type,
      quantity: signal.quantity,
      price: signal.price,
      total_value: totalValue,
      realized_pnl: null,
      realized_pnl_pct: null,
      status: "filled",
      executed_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (tradeErr) {
    return c.json<ApiResult<null>>(
      { data: null, error: { code: "INSERT_FAILED", message: tradeErr.message } },
      500,
    );
  }

  // Enqueue signal for distribution to copy subscribers
  await signalQueue.add(
    "ingest",
    {
      portfolio_trade_id: trade.id,
      portfolio_id: signal.portfolio_id,
      trader_id: portfolio.trader_id,
      signal,
    },
    {
      jobId: `signal-${trade.id}`,
    },
  );

  return c.json<ApiResult<{ portfolio_trade_id: string; queued: true }>>(
    {
      data: { portfolio_trade_id: trade.id, queued: true },
      error: null,
    },
    201,
  );
});

export default internal;
