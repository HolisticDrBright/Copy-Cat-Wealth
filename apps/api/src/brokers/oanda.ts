import type {
  BrokerAdapter,
  BrokerCredentials,
  TradeParams,
  TradeResult,
  Position,
  AccountInfo,
} from "./types";

/**
 * OANDA v20 REST API adapter for forex trading.
 *
 * Uses OANDA's v20 REST API. Supports live and practice environments
 * based on the OANDA_ENVIRONMENT env var.
 */
export class OandaAdapter implements BrokerAdapter {
  readonly provider = "oanda";
  private accessToken: string;
  private baseUrl: string;
  private accountId: string;

  constructor(credentials: BrokerCredentials) {
    this.accessToken = credentials.accessToken;
    const isPractice = process.env.OANDA_ENVIRONMENT !== "live";
    this.baseUrl = isPractice
      ? "https://api-fxpractice.oanda.com/v3"
      : "https://api-fxtrade.oanda.com/v3";
    this.accountId = process.env.OANDA_ACCOUNT_ID ?? "";
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OANDA API error (${response.status}): ${errorBody}`);
    }

    return response.json() as Promise<T>;
  }

  async executeTrade(params: TradeParams): Promise<TradeResult> {
    // Convert symbol to OANDA instrument format (e.g., EUR/USD -> EUR_USD)
    const instrument = toOandaInstrument(params.symbol);

    // Convert quantity to OANDA units (apply lot size conversion)
    const units = convertToUnits(params.quantity, params.side);

    const orderRequest = buildOandaOrder(instrument, units, params);

    const result = await this.request<{
      orderCreateTransaction?: {
        id: string;
        type: string;
      };
      orderFillTransaction?: {
        id: string;
        tradeOpened?: { tradeID: string; units: string; price: string };
        tradeClosed?: Array<{ tradeID: string; units: string; price: string }>;
        fullPrice?: { asks: Array<{ price: string }>; bids: Array<{ price: string }> };
        price: string;
        units: string;
        pl: string;
        financing: string;
        commission: string;
      };
      orderCancelTransaction?: {
        id: string;
        reason: string;
      };
    }>(`/accounts/${this.accountId}/orders`, {
      method: "POST",
      body: JSON.stringify({ order: orderRequest }),
    });

    // Market orders fill immediately in OANDA
    if (result.orderFillTransaction) {
      const fill = result.orderFillTransaction;
      return {
        orderId: fill.id,
        status: "filled",
        filledQuantity: Math.abs(parseFloat(fill.units)),
        filledPrice: parseFloat(fill.price),
        fee: parseFloat(fill.commission ?? "0") + parseFloat(fill.financing ?? "0"),
        rawResponse: result,
      };
    }

    if (result.orderCancelTransaction) {
      return {
        orderId: result.orderCancelTransaction.id,
        status: "rejected",
        filledQuantity: 0,
        filledPrice: 0,
        fee: 0,
        rawResponse: result,
      };
    }

    // Pending order (limit/stop) - return with pending status
    const orderId = result.orderCreateTransaction?.id ?? "unknown";
    return {
      orderId,
      status: "pending",
      filledQuantity: 0,
      filledPrice: 0,
      fee: 0,
      rawResponse: result,
    };
  }

  async getPositions(): Promise<Position[]> {
    const result = await this.request<{
      positions: Array<{
        instrument: string;
        long: { units: string; averagePrice: string; unrealizedPL: string };
        short: { units: string; averagePrice: string; unrealizedPL: string };
      }>;
    }>(`/accounts/${this.accountId}/openPositions`);

    const positions: Position[] = [];

    for (const pos of result.positions) {
      const symbol = fromOandaInstrument(pos.instrument);

      // Long position
      const longUnits = parseFloat(pos.long.units);
      if (longUnits > 0) {
        positions.push({
          symbol,
          market: "forex",
          quantity: longUnits,
          averageEntryPrice: parseFloat(pos.long.averagePrice),
          currentPrice: parseFloat(pos.long.averagePrice), // Would need separate pricing call
          unrealizedPnl: parseFloat(pos.long.unrealizedPL),
          direction: "long",
        });
      }

      // Short position
      const shortUnits = Math.abs(parseFloat(pos.short.units));
      if (shortUnits > 0) {
        positions.push({
          symbol,
          market: "forex",
          quantity: shortUnits,
          averageEntryPrice: parseFloat(pos.short.averagePrice),
          currentPrice: parseFloat(pos.short.averagePrice),
          unrealizedPnl: parseFloat(pos.short.unrealizedPL),
          direction: "short",
        });
      }
    }

    return positions;
  }

  async getAccount(): Promise<AccountInfo> {
    const result = await this.request<{
      account: {
        id: string;
        balance: string;
        nav: string;
        marginAvailable: string;
        currency: string;
      };
    }>(`/accounts/${this.accountId}`);

    const acct = result.account;
    return {
      accountId: acct.id,
      buyingPower: parseFloat(acct.marginAvailable),
      portfolioValue: parseFloat(acct.nav),
      cash: parseFloat(acct.balance),
      currency: acct.currency,
    };
  }
}

// ---------------------------------------------------------------------------
// OANDA instrument formatting utilities
// ---------------------------------------------------------------------------

/** Convert user-friendly symbol (EUR/USD, EURUSD) to OANDA format (EUR_USD) */
function toOandaInstrument(symbol: string): string {
  // Already in OANDA format
  if (symbol.includes("_")) return symbol;
  // Slash format
  if (symbol.includes("/")) return symbol.replace("/", "_");
  // 6-char format like EURUSD
  if (symbol.length === 6 && /^[A-Z]+$/.test(symbol)) {
    return `${symbol.slice(0, 3)}_${symbol.slice(3)}`;
  }
  return symbol;
}

/** Convert OANDA format (EUR_USD) back to slash format (EUR/USD) */
function fromOandaInstrument(instrument: string): string {
  return instrument.replace("_", "/");
}

// ---------------------------------------------------------------------------
// Lot size conversion
// ---------------------------------------------------------------------------

/**
 * Convert quantity to OANDA units.
 * OANDA uses signed units: positive for long, negative for short.
 * Standard lot = 100,000 units, mini = 10,000, micro = 1,000.
 */
function convertToUnits(quantity: number, side: string): number {
  // If quantity looks like lot sizes (< 100), convert to standard units
  const units = quantity < 100 ? Math.round(quantity * 100000) : Math.round(quantity);
  return side === "sell" ? -units : units;
}

// ---------------------------------------------------------------------------
// Order building
// ---------------------------------------------------------------------------
function buildOandaOrder(
  instrument: string,
  units: number,
  params: TradeParams,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    instrument,
    units: units.toString(),
    timeInForce: "FOK", // Fill or Kill for market orders
    positionFill: "DEFAULT",
  };

  switch (params.orderType) {
    case "market":
      return { ...base, type: "MARKET" };
    case "limit":
      return {
        ...base,
        type: "LIMIT",
        price: params.price.toFixed(5),
        timeInForce: "GTC",
      };
    case "stop":
      return {
        ...base,
        type: "STOP",
        price: params.price.toFixed(5),
        timeInForce: "GTC",
      };
    case "stop_limit":
      return {
        ...base,
        type: "STOP",
        price: params.price.toFixed(5),
        priceBound: params.price.toFixed(5),
        timeInForce: "GTC",
      };
    default:
      return { ...base, type: "MARKET" };
  }
}
