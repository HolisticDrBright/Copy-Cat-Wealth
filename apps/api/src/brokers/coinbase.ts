import type {
  BrokerAdapter,
  BrokerCredentials,
  TradeParams,
  TradeResult,
  Position,
  AccountInfo,
} from "./types";

const COINBASE_BASE = "https://api.coinbase.com/api/v3/brokerage";

/**
 * Coinbase Advanced Trade API adapter.
 *
 * Uses the Coinbase Advanced Trade REST API for order execution
 * and a WebSocket connection for real-time fill notifications.
 */
export class CoinbaseAdapter implements BrokerAdapter {
  readonly provider = "coinbase";
  private accessToken: string;
  private refreshToken?: string;
  private ws: WebSocket | null = null;
  private fillCallbacks: Map<string, (fill: unknown) => void> = new Map();

  constructor(credentials: BrokerCredentials) {
    this.accessToken = credentials.accessToken;
    this.refreshToken = credentials.refreshToken;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${COINBASE_BASE}${path}`;
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
      throw new Error(`Coinbase API error (${response.status}): ${errorBody}`);
    }

    return response.json() as Promise<T>;
  }

  async executeTrade(params: TradeParams): Promise<TradeResult> {
    // Coinbase uses product_id format like "BTC-USD"
    const productId = params.symbol.includes("-") ? params.symbol : `${params.symbol}-USD`;

    const clientOrderId = `cct-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const orderConfig = buildOrderConfig(params);

    const order = await this.request<{
      success: boolean;
      order_id: string;
      success_response?: {
        order_id: string;
        product_id: string;
        side: string;
      };
      error_response?: {
        error: string;
        message: string;
      };
    }>("/orders", {
      method: "POST",
      body: JSON.stringify({
        client_order_id: clientOrderId,
        product_id: productId,
        side: params.side.toUpperCase(),
        order_configuration: orderConfig,
      }),
    });

    if (!order.success || order.error_response) {
      throw new Error(
        `Coinbase order failed: ${order.error_response?.message ?? "Unknown error"}`,
      );
    }

    const orderId = order.order_id ?? order.success_response?.order_id ?? clientOrderId;

    // Wait for fill via polling (WebSocket can be used for real-time in production)
    const filledOrder = await this.pollOrderFill(orderId);

    return {
      orderId,
      status: mapCoinbaseStatus(filledOrder.status),
      filledQuantity: parseFloat(filledOrder.filled_size ?? "0"),
      filledPrice: parseFloat(filledOrder.average_filled_price ?? params.price.toString()),
      fee: parseFloat(filledOrder.total_fees ?? "0"),
      rawResponse: filledOrder,
    };
  }

  async getPositions(): Promise<Position[]> {
    const accounts = await this.request<{
      accounts: Array<{
        uuid: string;
        currency: string;
        available_balance: { value: string; currency: string };
        hold: { value: string; currency: string };
      }>;
    }>("/accounts?limit=250");

    const positions: Position[] = [];

    for (const account of accounts.accounts) {
      const balance = parseFloat(account.available_balance.value) + parseFloat(account.hold.value);
      if (balance <= 0 || account.currency === "USD") continue;

      // Get current price
      let currentPrice = 0;
      try {
        const productId = `${account.currency}-USD`;
        const ticker = await this.request<{
          trades: Array<{ price: string }>;
        }>(`/products/${productId}/ticker?limit=1`);
        currentPrice = parseFloat(ticker.trades?.[0]?.price ?? "0");
      } catch {
        continue; // Skip if no USD pair
      }

      positions.push({
        symbol: account.currency,
        market: "crypto",
        quantity: balance,
        averageEntryPrice: 0, // Coinbase doesn't provide cost basis via this endpoint
        currentPrice,
        unrealizedPnl: 0, // Would need cost basis to calculate
        direction: "long",
      });
    }

    return positions;
  }

  async getAccount(): Promise<AccountInfo> {
    const accounts = await this.request<{
      accounts: Array<{
        uuid: string;
        currency: string;
        available_balance: { value: string };
      }>;
    }>("/accounts?limit=250");

    // Find USD account for cash
    const usdAccount = accounts.accounts.find((a) => a.currency === "USD");
    const cash = usdAccount ? parseFloat(usdAccount.available_balance.value) : 0;

    // Sum all account values for portfolio estimate
    let portfolioValue = cash;
    for (const account of accounts.accounts) {
      if (account.currency === "USD") continue;
      const balance = parseFloat(account.available_balance.value);
      if (balance <= 0) continue;

      try {
        const productId = `${account.currency}-USD`;
        const ticker = await this.request<{
          trades: Array<{ price: string }>;
        }>(`/products/${productId}/ticker?limit=1`);
        const price = parseFloat(ticker.trades?.[0]?.price ?? "0");
        portfolioValue += balance * price;
      } catch {
        // Skip non-USD pairs
      }
    }

    return {
      accountId: usdAccount?.uuid ?? "default",
      buyingPower: cash,
      portfolioValue,
      cash,
      currency: "USD",
    };
  }

  /**
   * Connect to Coinbase WebSocket for real-time fill notifications.
   * Call this once to enable real-time updates instead of polling.
   */
  connectWebSocket(): void {
    if (this.ws) return;

    const wsUrl = "wss://advanced-trade-ws.coinbase.com";
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log("[coinbase-ws] Connected");
      // Subscribe to user channel for fill events
      this.ws?.send(
        JSON.stringify({
          type: "subscribe",
          channel: "user",
          token: this.accessToken,
        }),
      );
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string);
        if (msg.channel === "user" && msg.events) {
          for (const evt of msg.events) {
            if (evt.type === "match" || evt.type === "fill") {
              const orderId = evt.order_id;
              const callback = this.fillCallbacks.get(orderId);
              if (callback) {
                callback(evt);
                this.fillCallbacks.delete(orderId);
              }
            }
          }
        }
      } catch {
        // Ignore parse errors
      }
    };

    this.ws.onerror = (err) => {
      console.error("[coinbase-ws] Error:", err);
    };

    this.ws.onclose = () => {
      console.log("[coinbase-ws] Disconnected");
      this.ws = null;
    };
  }

  disconnectWebSocket(): void {
    this.ws?.close();
    this.ws = null;
    this.fillCallbacks.clear();
  }

  private async pollOrderFill(
    orderId: string,
    maxAttempts = 15,
    delayMs = 1000,
  ): Promise<{
    status: string;
    filled_size: string;
    average_filled_price: string;
    total_fees: string;
  }> {
    for (let i = 0; i < maxAttempts; i++) {
      const result = await this.request<{
        order: {
          status: string;
          filled_size: string;
          average_filled_price: string;
          total_fees: string;
        };
      }>(`/orders/historical/${orderId}`);

      const order = result.order;
      if (["FILLED", "CANCELLED", "EXPIRED", "FAILED"].includes(order.status)) {
        return order;
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    // Return current state after timeout
    const result = await this.request<{
      order: {
        status: string;
        filled_size: string;
        average_filled_price: string;
        total_fees: string;
      };
    }>(`/orders/historical/${orderId}`);
    return result.order;
  }
}

function buildOrderConfig(params: TradeParams): Record<string, unknown> {
  const baseSize = params.quantity.toString();

  switch (params.orderType) {
    case "market":
      return params.side === "buy"
        ? { market_market_ioc: { quote_size: (params.quantity * params.price).toFixed(2) } }
        : { market_market_ioc: { base_size: baseSize } };
    case "limit":
      return {
        limit_limit_gtc: {
          base_size: baseSize,
          limit_price: params.price.toString(),
          post_only: false,
        },
      };
    case "stop":
      return {
        stop_limit_stop_limit_gtc: {
          base_size: baseSize,
          limit_price: params.price.toString(),
          stop_price: params.price.toString(),
          stop_direction: params.side === "buy" ? "STOP_DIRECTION_STOP_UP" : "STOP_DIRECTION_STOP_DOWN",
        },
      };
    case "stop_limit":
      return {
        stop_limit_stop_limit_gtc: {
          base_size: baseSize,
          limit_price: params.price.toString(),
          stop_price: params.price.toString(),
          stop_direction: params.side === "buy" ? "STOP_DIRECTION_STOP_UP" : "STOP_DIRECTION_STOP_DOWN",
        },
      };
    default:
      return { market_market_ioc: { base_size: baseSize } };
  }
}

function mapCoinbaseStatus(status: string): "filled" | "partially_filled" | "cancelled" | "rejected" | "pending" {
  switch (status) {
    case "FILLED":
      return "filled";
    case "CANCELLED":
    case "EXPIRED":
      return "cancelled";
    case "FAILED":
      return "rejected";
    case "PENDING":
    case "OPEN":
      return "pending";
    default:
      return "pending";
  }
}
