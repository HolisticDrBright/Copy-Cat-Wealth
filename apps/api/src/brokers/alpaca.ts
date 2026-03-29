import type {
  BrokerAdapter,
  BrokerCredentials,
  TradeParams,
  TradeResult,
  Position,
  AccountInfo,
} from "./types";

const ALPACA_LIVE_BASE = "https://api.alpaca.markets";
const ALPACA_PAPER_BASE = "https://paper-api.alpaca.markets";

/** Alpaca API response types */
interface AlpacaAccount {
  id: string;
  account_number: string;
  status: string;
  buying_power: string;
  portfolio_value: string;
  cash: string;
  currency: string;
}

interface AlpacaPosition {
  asset_id: string;
  symbol: string;
  qty: string;
  avg_entry_price: string;
  current_price: string;
  unrealized_pl: string;
  side: string;
}

interface AlpacaOrder {
  id: string;
  client_order_id: string;
  status: string;
  symbol: string;
  qty: string | null;
  notional: string | null;
  filled_qty: string;
  filled_avg_price: string | null;
  side: string;
  type: string;
  time_in_force: string;
  created_at: string;
  updated_at: string;
  submitted_at: string;
  filled_at: string | null;
  expired_at: string | null;
  canceled_at: string | null;
  failed_at: string | null;
}

/**
 * Alpaca Trading API adapter.
 *
 * Uses the Alpaca v2 REST API for US stock and ETF trading.
 * Supports both live and paper trading environments via ALPACA_ENV.
 * Auth uses Bearer token from broker_connections.access_token_encrypted.
 */
export class AlpacaAdapter implements BrokerAdapter {
  readonly provider = "alpaca";
  private accessToken: string;
  private baseUrl: string;

  constructor(credentials: BrokerCredentials) {
    this.accessToken = credentials.accessToken;
    const env = process.env.ALPACA_ENV ?? "paper";
    this.baseUrl = env === "live" ? ALPACA_LIVE_BASE : ALPACA_PAPER_BASE;
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
      throw new Error(`Alpaca API error (${response.status}): ${errorBody}`);
    }

    // DELETE endpoints may return 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  async getAccount(): Promise<AccountInfo> {
    const account = await this.request<AlpacaAccount>("/v2/account");

    return {
      accountId: account.account_number,
      buyingPower: parseFloat(account.buying_power),
      portfolioValue: parseFloat(account.portfolio_value),
      cash: parseFloat(account.cash),
      currency: account.currency ?? "USD",
    };
  }

  async getPositions(): Promise<Position[]> {
    const positions = await this.request<AlpacaPosition[]>("/v2/positions");

    return positions.map((pos) => ({
      symbol: pos.symbol,
      market: "stocks" as const,
      quantity: parseFloat(pos.qty),
      averageEntryPrice: parseFloat(pos.avg_entry_price),
      currentPrice: parseFloat(pos.current_price),
      unrealizedPnl: parseFloat(pos.unrealized_pl),
      direction: pos.side === "short" ? ("short" as const) : ("long" as const),
    }));
  }

  async executeTrade(params: TradeParams): Promise<TradeResult> {
    const dollarAmount = params.quantity * params.price;

    const orderPayload: Record<string, unknown> = {
      symbol: params.symbol,
      notional: dollarAmount.toFixed(2),
      side: params.side,
      type: "market",
      time_in_force: "day",
    };

    const order = await this.request<AlpacaOrder>("/v2/orders", {
      method: "POST",
      body: JSON.stringify(orderPayload),
    });

    // Poll for fill status since market orders may not fill immediately
    const filledOrder = await this.pollOrderStatus(order.id);

    return {
      orderId: filledOrder.id,
      status: mapAlpacaStatus(filledOrder.status),
      filledQuantity: parseFloat(filledOrder.filled_qty),
      filledPrice: parseFloat(filledOrder.filled_avg_price ?? params.price.toString()),
      fee: 0, // Alpaca is commission-free
      rawResponse: filledOrder,
    };
  }

  /**
   * Close an entire position for a given symbol.
   * DELETE /v2/positions/{symbol}
   */
  async closePosition(symbol: string): Promise<AlpacaOrder> {
    return this.request<AlpacaOrder>(`/v2/positions/${encodeURIComponent(symbol)}`, {
      method: "DELETE",
    });
  }

  /**
   * Cancel an open order by ID.
   * DELETE /v2/orders/{orderId}
   */
  async cancelOrder(orderId: string): Promise<void> {
    await this.request<void>(`/v2/orders/${encodeURIComponent(orderId)}`, {
      method: "DELETE",
    });
  }

  /**
   * Get the current status of an order by ID.
   * GET /v2/orders/{orderId}
   */
  async getOrderStatus(orderId: string): Promise<AlpacaOrder> {
    return this.request<AlpacaOrder>(`/v2/orders/${encodeURIComponent(orderId)}`);
  }

  /**
   * Poll order status until it reaches a terminal state or times out.
   */
  private async pollOrderStatus(
    orderId: string,
    maxAttempts = 15,
    delayMs = 1000,
  ): Promise<AlpacaOrder> {
    const terminalStatuses = ["filled", "canceled", "expired", "rejected"];

    for (let i = 0; i < maxAttempts; i++) {
      const order = await this.request<AlpacaOrder>(
        `/v2/orders/${encodeURIComponent(orderId)}`,
      );

      if (terminalStatuses.includes(order.status)) {
        return order;
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    // Return last known state after timeout
    return this.request<AlpacaOrder>(`/v2/orders/${encodeURIComponent(orderId)}`);
  }
}

function mapAlpacaStatus(
  status: string,
): "filled" | "partially_filled" | "cancelled" | "rejected" | "pending" {
  switch (status) {
    case "filled":
      return "filled";
    case "partially_filled":
      return "partially_filled";
    case "canceled":
    case "expired":
      return "cancelled";
    case "rejected":
      return "rejected";
    case "new":
    case "accepted":
    case "pending_new":
    case "accepted_for_processing":
      return "pending";
    default:
      return "pending";
  }
}
