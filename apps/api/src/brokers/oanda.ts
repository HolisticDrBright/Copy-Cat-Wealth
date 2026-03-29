import type {
  BrokerAdapter,
  BrokerCredentials,
  TradeParams,
  TradeResult,
  Position,
  AccountInfo,
} from "./types";

const OANDA_LIVE_BASE = "https://api-fxtrade.oanda.com";
const OANDA_PRACTICE_BASE = "https://api-fxpractice.oanda.com";

/** Minimum allocation per trade in USD */
const MIN_ALLOCATION_USD = 1000;

/**
 * OANDA v20 REST API adapter for forex trading.
 *
 * Auth model: NO OAuth. Users provide a personal access token and accountID.
 * The personal access token is stored in broker_connections.access_token_encrypted
 * and the accountID is stored in broker_connections.extra_encrypted.
 *
 * Base URLs:
 *   Live:     https://api-fxtrade.oanda.com
 *   Practice: https://api-fxpractice.oanda.com
 *
 * Environment selected via OANDA_ENVIRONMENT env var (live|practice).
 */
export class OandaAdapter implements BrokerAdapter {
  readonly provider = "oanda";
  private accessToken: string;
  private baseUrl: string;
  private accountId: string;

  constructor(credentials: BrokerCredentials & { accountId?: string }) {
    this.accessToken = credentials.accessToken;
    const isPractice = process.env.OANDA_ENVIRONMENT !== "live";
    this.baseUrl = isPractice ? OANDA_PRACTICE_BASE : OANDA_LIVE_BASE;
    this.accountId = credentials.accountId ?? process.env.OANDA_ACCOUNT_ID ?? "";

    if (!this.accountId) {
      throw new Error("OANDA accountID is required. Provide it via credentials or OANDA_ACCOUNT_ID env var.");
    }
  }

  // -------------------------------------------------------------------------
  // HTTP helper
  // -------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // Pricing helper — fetch current ask price for unit sizing
  // -------------------------------------------------------------------------

  private async getCurrentAskPrice(instrument: string): Promise<number> {
    const result = await this.request<{
      prices: Array<{
        asks: Array<{ price: string }>;
        bids: Array<{ price: string }>;
        instrument: string;
      }>;
    }>(`/v3/accounts/${this.accountId}/pricing?instruments=${instrument}`);

    const pricing = result.prices?.[0];
    if (!pricing || !pricing.asks?.length) {
      throw new Error(`Unable to get pricing for ${instrument}`);
    }

    return parseFloat(pricing.asks[0].price);
  }

  // -------------------------------------------------------------------------
  // BrokerAdapter — executeTrade
  // -------------------------------------------------------------------------

  async executeTrade(params: TradeParams): Promise<TradeResult> {
    const instrument = toOandaInstrument(params.symbol);
    const dollarAmount = params.quantity * params.price;

    if (dollarAmount < MIN_ALLOCATION_USD) {
      throw new Error(
        `OANDA minimum allocation is $${MIN_ALLOCATION_USD}. Requested: $${dollarAmount.toFixed(2)}`,
      );
    }

    // Calculate units based on dollar amount and current ask price
    let units: number;
    if (params.orderType === "market") {
      const askPrice = await this.getCurrentAskPrice(instrument);
      units = Math.floor(dollarAmount / askPrice);
    } else {
      // For limit/stop orders, use the provided price for unit calculation
      units = Math.floor(dollarAmount / params.price);
    }

    // Negative units = sell, positive = buy
    if (params.side === "sell") {
      units = -units;
    }

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
    }>(`/v3/accounts/${this.accountId}/orders`, {
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

    // Pending order (limit/stop) — return with pending status
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

  // -------------------------------------------------------------------------
  // BrokerAdapter — getPositions
  // -------------------------------------------------------------------------

  async getPositions(): Promise<Position[]> {
    const result = await this.request<{
      positions: Array<{
        instrument: string;
        long: { units: string; averagePrice: string; unrealizedPL: string };
        short: { units: string; averagePrice: string; unrealizedPL: string };
      }>;
    }>(`/v3/accounts/${this.accountId}/openPositions`);

    const positions: Position[] = [];

    for (const pos of result.positions) {
      const symbol = fromOandaInstrument(pos.instrument);

      // Long position
      const longUnits = parseFloat(pos.long.units);
      if (longUnits > 0) {
        let currentPrice = parseFloat(pos.long.averagePrice);
        try {
          currentPrice = await this.getCurrentAskPrice(pos.instrument);
        } catch {
          // Fall back to average price if pricing call fails
        }

        positions.push({
          symbol,
          market: "forex",
          quantity: longUnits,
          averageEntryPrice: parseFloat(pos.long.averagePrice),
          currentPrice,
          unrealizedPnl: parseFloat(pos.long.unrealizedPL),
          direction: "long",
        });
      }

      // Short position
      const shortUnits = Math.abs(parseFloat(pos.short.units));
      if (shortUnits > 0) {
        let currentPrice = parseFloat(pos.short.averagePrice);
        try {
          currentPrice = await this.getCurrentAskPrice(pos.instrument);
        } catch {
          // Fall back to average price if pricing call fails
        }

        positions.push({
          symbol,
          market: "forex",
          quantity: shortUnits,
          averageEntryPrice: parseFloat(pos.short.averagePrice),
          currentPrice,
          unrealizedPnl: parseFloat(pos.short.unrealizedPL),
          direction: "short",
        });
      }
    }

    return positions;
  }

  // -------------------------------------------------------------------------
  // BrokerAdapter — getAccount
  // -------------------------------------------------------------------------

  async getAccount(): Promise<AccountInfo> {
    const result = await this.request<{
      account: {
        id: string;
        balance: string;
        nav: string;
        marginAvailable: string;
        currency: string;
      };
    }>(`/v3/accounts/${this.accountId}`);

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
  if (symbol.includes("_")) return symbol;
  if (symbol.includes("/")) return symbol.replace("/", "_");
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
    timeInForce: "FOK",
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
