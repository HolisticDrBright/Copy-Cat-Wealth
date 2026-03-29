import type {
  BrokerAdapter,
  BrokerCredentials,
  TradeParams,
  TradeResult,
  Position,
  AccountInfo,
} from "./types";

const POLYMARKET_CLOB_BASE = "https://clob.polymarket.com";
const POLYMARKET_GAMMA_BASE = "https://gamma-api.polymarket.com";

/**
 * Polymarket CLOB API adapter for prediction market trading.
 *
 * Uses the Polymarket Central Limit Order Book (CLOB) API.
 * Orders require Polygon wallet signing for execution on-chain.
 */
export class PolymarketAdapter implements BrokerAdapter {
  readonly provider = "polymarket";
  private accessToken: string;
  private apiKey: string;
  private apiSecret: string;
  private apiPassphrase: string;

  constructor(credentials: BrokerCredentials) {
    this.accessToken = credentials.accessToken;
    this.apiKey = process.env.POLYMARKET_API_KEY ?? "";
    this.apiSecret = process.env.POLYMARKET_API_SECRET ?? "";
    this.apiPassphrase = process.env.POLYMARKET_API_PASSPHRASE ?? "";
  }

  private async clobRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${POLYMARKET_CLOB_BASE}${path}`;
    const timestamp = Math.floor(Date.now() / 1000).toString();

    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "POLY-ADDRESS": this.accessToken,
        "POLY-SIGNATURE": "", // Signature would be computed from wallet in production
        "POLY-TIMESTAMP": timestamp,
        "POLY-API-KEY": this.apiKey,
        "POLY-PASSPHRASE": this.apiPassphrase,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Polymarket API error (${response.status}): ${errorBody}`);
    }

    return response.json() as Promise<T>;
  }

  private async gammaRequest<T>(path: string): Promise<T> {
    const url = `${POLYMARKET_GAMMA_BASE}${path}`;
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Polymarket Gamma API error (${response.status}): ${errorBody}`);
    }

    return response.json() as Promise<T>;
  }

  async executeTrade(params: TradeParams): Promise<TradeResult> {
    // Polymarket uses token_id (condition_id) as the "symbol"
    const tokenId = params.symbol;

    // Determine side: BUY = buying YES tokens, SELL = selling YES tokens
    const side = params.side === "buy" ? "BUY" : "SELL";

    // Build the order - prices are in USDC (0-1 range for binary markets)
    const price = params.price;
    const size = params.quantity;

    // Create a signed order
    // In production, this would involve EIP-712 signing with the user's wallet
    const orderPayload = {
      tokenID: tokenId,
      price: price.toString(),
      size: size.toString(),
      side,
      feeRateBps: "0",
      nonce: "0",
      expiration: "0",
      taker: "0x0000000000000000000000000000000000000000",
      maker: this.accessToken,
      signatureType: 0,
      signature: "0x", // Placeholder - real impl needs wallet signing
    };

    const orderType = params.orderType === "market" ? "FOK" : "GTC";

    const result = await this.clobRequest<{
      orderID: string;
      status: string;
      transactionsHashes?: string[];
      success: boolean;
    }>("/order", {
      method: "POST",
      body: JSON.stringify({
        order: orderPayload,
        orderType,
      }),
    });

    if (!result.success) {
      throw new Error(`Polymarket order failed: ${result.status}`);
    }

    // Fetch order details to get fill info
    const orderDetails = await this.pollOrderStatus(result.orderID);

    return {
      orderId: result.orderID,
      status: mapPolymarketStatus(orderDetails.status),
      filledQuantity: parseFloat(orderDetails.size_matched ?? "0"),
      filledPrice: parseFloat(orderDetails.price ?? params.price.toString()),
      fee: 0, // Polymarket fees are built into the spread
      rawResponse: { ...result, ...orderDetails },
    };
  }

  async getPositions(): Promise<Position[]> {
    // Fetch user's open positions via CLOB
    const result = await this.clobRequest<
      Array<{
        asset: string;
        condition_id: string;
        size: string;
        avgPrice: string;
        currentPrice: string;
        pnl: string;
        market?: string;
      }>
    >(`/positions?user=${this.accessToken}`);

    return (result ?? []).map((pos) => ({
      symbol: pos.condition_id,
      market: "futures" as const, // Using "futures" as closest MarketType for prediction markets
      quantity: parseFloat(pos.size),
      averageEntryPrice: parseFloat(pos.avgPrice),
      currentPrice: parseFloat(pos.currentPrice ?? pos.avgPrice),
      unrealizedPnl: parseFloat(pos.pnl ?? "0"),
      direction: "long" as const,
    }));
  }

  async getAccount(): Promise<AccountInfo> {
    // Fetch USDC balance and portfolio value
    const balances = await this.clobRequest<{
      collateral: string;
      positions_value: string;
    }>(`/balance?user=${this.accessToken}`);

    const collateral = parseFloat(balances.collateral ?? "0");
    const positionsValue = parseFloat(balances.positions_value ?? "0");

    return {
      accountId: this.accessToken.slice(0, 10),
      buyingPower: collateral,
      portfolioValue: collateral + positionsValue,
      cash: collateral,
      currency: "USDC",
    };
  }

  /**
   * Get available markets from the Gamma API.
   * Useful for browsing prediction markets.
   */
  async getMarkets(params?: {
    limit?: number;
    offset?: number;
    active?: boolean;
  }): Promise<
    Array<{
      id: string;
      question: string;
      conditionId: string;
      slug: string;
      endDate: string;
      liquidity: string;
      volume: string;
      outcomes: string[];
      outcomePrices: string[];
    }>
  > {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.set("limit", params.limit.toString());
    if (params?.offset) queryParams.set("offset", params.offset.toString());
    if (params?.active !== undefined) queryParams.set("active", params.active.toString());

    const qs = queryParams.toString();
    const path = `/markets${qs ? `?${qs}` : ""}`;

    return this.gammaRequest<
      Array<{
        id: string;
        question: string;
        conditionId: string;
        slug: string;
        endDate: string;
        liquidity: string;
        volume: string;
        outcomes: string[];
        outcomePrices: string[];
      }>
    >(path);
  }

  private async pollOrderStatus(
    orderId: string,
    maxAttempts = 10,
    delayMs = 1000,
  ): Promise<{
    status: string;
    size_matched: string;
    price: string;
  }> {
    for (let i = 0; i < maxAttempts; i++) {
      const order = await this.clobRequest<{
        status: string;
        size_matched: string;
        price: string;
      }>(`/order/${orderId}`);

      if (["MATCHED", "CANCELLED", "EXPIRED"].includes(order.status)) {
        return order;
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    return this.clobRequest(`/order/${orderId}`);
  }
}

function mapPolymarketStatus(
  status: string,
): "filled" | "partially_filled" | "cancelled" | "rejected" | "pending" {
  switch (status) {
    case "MATCHED":
      return "filled";
    case "CANCELLED":
    case "EXPIRED":
      return "cancelled";
    case "LIVE":
    case "OPEN":
      return "pending";
    default:
      return "pending";
  }
}
