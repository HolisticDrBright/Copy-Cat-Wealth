import type {
  BrokerAdapter,
  BrokerCredentials,
  TradeParams,
  TradeResult,
  Position,
  AccountInfo,
} from "./types";

const ROBINHOOD_BASE = "https://api.robinhood.com";

/**
 * Robinhood broker adapter.
 *
 * Uses the unofficial Robinhood API. Authentication is token-based
 * (access token obtained via OAuth or credential exchange).
 * Signal detection is poll-based since Robinhood does not offer WebSockets.
 */
export class RobinhoodAdapter implements BrokerAdapter {
  readonly provider = "robinhood";
  private accessToken: string;
  private refreshToken?: string;

  constructor(credentials: BrokerCredentials) {
    this.accessToken = credentials.accessToken;
    this.refreshToken = credentials.refreshToken;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${ROBINHOOD_BASE}${path}`;
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
      throw new Error(`Robinhood API error (${response.status}): ${errorBody}`);
    }

    return response.json() as Promise<T>;
  }

  async executeTrade(params: TradeParams): Promise<TradeResult> {
    // Look up instrument URL for the symbol
    const instruments = await this.request<{ results: Array<{ url: string; id: string }> }>(
      `/instruments/?symbol=${encodeURIComponent(params.symbol)}`,
    );

    const instrument = instruments.results?.[0];
    if (!instrument) {
      throw new Error(`Instrument not found for symbol: ${params.symbol}`);
    }

    const orderPayload = {
      account: await this.getAccountUrl(),
      instrument: instrument.url,
      symbol: params.symbol,
      type: params.orderType === "stop_limit" ? "limit" : params.orderType,
      time_in_force: "gfd",
      trigger: params.orderType === "stop" || params.orderType === "stop_limit" ? "stop" : "immediate",
      side: params.side,
      quantity: params.quantity.toString(),
      price: params.price.toFixed(2),
      ...(params.orderType === "stop" || params.orderType === "stop_limit"
        ? { stop_price: params.price.toFixed(2) }
        : {}),
    };

    const order = await this.request<{
      id: string;
      state: string;
      cumulative_quantity: string;
      average_price: string | null;
      fees: string;
    }>("/orders/", {
      method: "POST",
      body: JSON.stringify(orderPayload),
    });

    // Poll for fill status (Robinhood orders may not fill immediately)
    const filledOrder = await this.pollOrderStatus(order.id);

    return {
      orderId: filledOrder.id,
      status: mapRobinhoodStatus(filledOrder.state),
      filledQuantity: parseFloat(filledOrder.cumulative_quantity),
      filledPrice: parseFloat(filledOrder.average_price ?? params.price.toString()),
      fee: parseFloat(filledOrder.fees ?? "0"),
      rawResponse: filledOrder,
    };
  }

  async getPositions(): Promise<Position[]> {
    const response = await this.request<{
      results: Array<{
        instrument: string;
        quantity: string;
        average_buy_price: string;
        symbol?: string;
      }>;
    }>("/positions/?nonzero=true");

    const positions: Position[] = [];

    for (const pos of response.results) {
      const quantity = parseFloat(pos.quantity);
      if (quantity === 0) continue;

      // Fetch instrument details to get symbol
      let symbol = pos.symbol ?? "";
      if (!symbol && pos.instrument) {
        try {
          const inst = await this.request<{ symbol: string }>(new URL(pos.instrument).pathname);
          symbol = inst.symbol;
        } catch {
          continue;
        }
      }

      // Fetch current quote
      let currentPrice = parseFloat(pos.average_buy_price);
      try {
        const quote = await this.request<{ last_trade_price: string }>(
          `/quotes/${encodeURIComponent(symbol)}/`,
        );
        currentPrice = parseFloat(quote.last_trade_price);
      } catch {
        // Use average buy price as fallback
      }

      const avgEntry = parseFloat(pos.average_buy_price);
      positions.push({
        symbol,
        market: "stocks",
        quantity,
        averageEntryPrice: avgEntry,
        currentPrice,
        unrealizedPnl: (currentPrice - avgEntry) * quantity,
        direction: "long",
      });
    }

    return positions;
  }

  async getAccount(): Promise<AccountInfo> {
    const accounts = await this.request<{
      results: Array<{
        url: string;
        account_number: string;
        buying_power: string;
        portfolio: string;
        cash: string;
      }>;
    }>("/accounts/");

    const account = accounts.results?.[0];
    if (!account) {
      throw new Error("No Robinhood account found");
    }

    // Fetch portfolio value
    let portfolioValue = 0;
    try {
      const portfolio = await this.request<{ equity: string }>(
        new URL(account.portfolio).pathname,
      );
      portfolioValue = parseFloat(portfolio.equity);
    } catch {
      // Fallback
    }

    return {
      accountId: account.account_number,
      buyingPower: parseFloat(account.buying_power),
      portfolioValue,
      cash: parseFloat(account.cash),
      currency: "USD",
    };
  }

  private async getAccountUrl(): Promise<string> {
    const accounts = await this.request<{ results: Array<{ url: string }> }>("/accounts/");
    const account = accounts.results?.[0];
    if (!account) throw new Error("No Robinhood account found");
    return account.url;
  }

  /**
   * Poll order status until terminal state or timeout.
   * Robinhood does not support WebSockets for order updates.
   */
  private async pollOrderStatus(
    orderId: string,
    maxAttempts = 10,
    delayMs = 1000,
  ): Promise<{
    id: string;
    state: string;
    cumulative_quantity: string;
    average_price: string | null;
    fees: string;
  }> {
    for (let i = 0; i < maxAttempts; i++) {
      const order = await this.request<{
        id: string;
        state: string;
        cumulative_quantity: string;
        average_price: string | null;
        fees: string;
      }>(`/orders/${orderId}/`);

      if (["filled", "cancelled", "rejected", "failed"].includes(order.state)) {
        return order;
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    // Return last known state if not terminal
    return this.request(`/orders/${orderId}/`);
  }
}

function mapRobinhoodStatus(state: string): "filled" | "partially_filled" | "cancelled" | "rejected" | "pending" {
  switch (state) {
    case "filled":
      return "filled";
    case "partially_filled":
      return "partially_filled";
    case "cancelled":
      return "cancelled";
    case "rejected":
    case "failed":
      return "rejected";
    default:
      return "pending";
  }
}
