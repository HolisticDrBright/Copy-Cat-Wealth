import { ethers } from "ethers";
import { ClobClient } from "@polymarket/clob-client";
import type {
  BrokerAdapter,
  BrokerCredentials,
  TradeParams,
  TradeResult,
  Position,
  AccountInfo,
} from "./types";

const POLYMARKET_CLOB_BASE = "https://clob.polymarket.com";
const POLYMARKET_DATA_API = "https://data-api.polymarket.com";
const POLYMARKET_GAMMA_API = "https://gamma-api.polymarket.com";

/** Chain ID for Polygon mainnet */
const POLYGON_CHAIN_ID = 137;

/**
 * L2 API credentials derived from the user's wallet via ClobClient.
 */
interface L2Credentials {
  apiKey: string;
  secret: string;
  passphrase: string;
}

/**
 * Polymarket CLOB adapter for prediction market trading.
 *
 * Auth model:
 *   L1: EIP-712 wallet signature (from Polygon private key)
 *   L2: HMAC-SHA256 credentials (apiKey, secret, passphrase) derived on first use
 *
 * The user provides their Polygon wallet private key, stored encrypted in
 * broker_connections.extra_encrypted. The backend derives L2 credentials
 * automatically via ClobClient.createOrDeriveApiKey().
 *
 * Trading:
 *   Limit orders via client.createAndPostOrder()
 *   Market (FOK) orders via MarketOrderArgs
 *
 * Positions: Data API at https://data-api.polymarket.com
 * Markets:   Gamma API at https://gamma-api.polymarket.com
 */
export class PolymarketAdapter implements BrokerAdapter {
  readonly provider = "polymarket";

  private privateKey: string;
  private signer: ethers.Wallet;
  private walletAddress: string;
  private clobClient: ClobClient | null = null;
  private l2Creds: L2Credentials | null = null;

  constructor(credentials: BrokerCredentials) {
    // accessToken holds the Polygon wallet private key
    this.privateKey = credentials.accessToken;

    const provider = new ethers.providers.JsonRpcProvider(
      process.env.POLYGON_RPC_URL ?? "https://polygon-rpc.com",
    );
    this.signer = new ethers.Wallet(this.privateKey, provider);
    this.walletAddress = this.signer.address;
  }

  // -------------------------------------------------------------------------
  // ClobClient initialization with L2 credential derivation
  // -------------------------------------------------------------------------

  private async getClient(): Promise<ClobClient> {
    if (this.clobClient) return this.clobClient;

    // Create initial client with L1 (wallet) auth for key derivation
    const initClient = new ClobClient(
      POLYMARKET_CLOB_BASE,
      POLYGON_CHAIN_ID,
      this.signer,
    );

    // Derive or retrieve L2 API credentials
    const apiKeyCreds = await initClient.createOrDeriveApiKey();
    this.l2Creds = {
      apiKey: apiKeyCreds.apiKey,
      secret: apiKeyCreds.secret,
      passphrase: apiKeyCreds.passphrase,
    };

    // Create the full client with L2 HMAC credentials
    this.clobClient = new ClobClient(
      POLYMARKET_CLOB_BASE,
      POLYGON_CHAIN_ID,
      this.signer,
      this.l2Creds,
    );

    return this.clobClient;
  }

  // -------------------------------------------------------------------------
  // Data API helper (positions)
  // -------------------------------------------------------------------------

  private async dataApiRequest<T>(path: string): Promise<T> {
    const url = `${POLYMARKET_DATA_API}${path}`;
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Polymarket Data API error (${response.status}): ${errorBody}`);
    }

    return response.json() as Promise<T>;
  }

  // -------------------------------------------------------------------------
  // Gamma API helper (markets)
  // -------------------------------------------------------------------------

  private async gammaApiRequest<T>(path: string): Promise<T> {
    const url = `${POLYMARKET_GAMMA_API}${path}`;
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Polymarket Gamma API error (${response.status}): ${errorBody}`);
    }

    return response.json() as Promise<T>;
  }

  // -------------------------------------------------------------------------
  // BrokerAdapter — executeTrade
  // -------------------------------------------------------------------------

  async executeTrade(params: TradeParams): Promise<TradeResult> {
    const client = await this.getClient();

    // tokenId is passed as the "symbol" (the CLOB condition token ID)
    const tokenId = params.symbol;
    const side = params.side === "buy" ? "BUY" : "SELL";
    const price = params.price;
    const size = params.quantity;

    let result: { orderID: string; status: string; transactionsHashes?: string[] };

    if (params.orderType === "market") {
      // Market FOK order
      const marketOrder = await client.createMarketOrder({
        tokenID: tokenId,
        amount: size,
        side,
      } as any);

      result = await client.postOrder(marketOrder, "FOK" as any);
    } else {
      // Limit GTC order via createAndPostOrder
      result = await client.createAndPostOrder({
        tokenID: tokenId,
        price,
        side,
        size,
      } as any);
    }

    if (!result.orderID) {
      throw new Error(`Polymarket order failed: ${result.status ?? "no order ID returned"}`);
    }

    // Poll for fill status
    const orderDetails = await this.pollOrderStatus(client, result.orderID);

    return {
      orderId: result.orderID,
      status: mapPolymarketStatus(orderDetails.status),
      filledQuantity: parseFloat(orderDetails.size_matched ?? "0"),
      filledPrice: parseFloat(orderDetails.price ?? params.price.toString()),
      fee: 0, // Polymarket fees are built into the spread
      rawResponse: { ...result, ...orderDetails },
    };
  }

  // -------------------------------------------------------------------------
  // BrokerAdapter — getPositions (Data API)
  // -------------------------------------------------------------------------

  async getPositions(): Promise<Position[]> {
    const positions = await this.dataApiRequest<
      Array<{
        asset: string;
        conditionId: string;
        size: string;
        avgPrice: string;
        currentPrice: string;
        pnl: string;
        market?: string;
        outcome?: string;
      }>
    >(`/positions?user=${this.walletAddress.toLowerCase()}`);

    return (positions ?? []).map((pos) => ({
      symbol: pos.conditionId,
      market: "polymarket" as const,
      quantity: parseFloat(pos.size),
      averageEntryPrice: parseFloat(pos.avgPrice),
      currentPrice: parseFloat(pos.currentPrice ?? pos.avgPrice),
      unrealizedPnl: parseFloat(pos.pnl ?? "0"),
      direction: "long" as const,
    }));
  }

  // -------------------------------------------------------------------------
  // BrokerAdapter — getAccount
  // -------------------------------------------------------------------------

  async getAccount(): Promise<AccountInfo> {
    const client = await this.getClient();

    // Fetch USDC collateral balance from CLOB
    const balanceStr = await client.getBalanceAllowance({
      asset_type: "COLLATERAL" as any,
    } as any);

    const collateral = typeof balanceStr === "string" ? parseFloat(balanceStr) : 0;

    // Sum position values from Data API
    let positionsValue = 0;
    try {
      const positions = await this.dataApiRequest<
        Array<{ size: string; currentPrice: string }>
      >(`/positions?user=${this.walletAddress.toLowerCase()}`);

      for (const pos of positions ?? []) {
        positionsValue += parseFloat(pos.size) * parseFloat(pos.currentPrice ?? "0");
      }
    } catch {
      // Positions value unavailable — use 0
    }

    return {
      accountId: this.walletAddress.slice(0, 10),
      buyingPower: collateral,
      portfolioValue: collateral + positionsValue,
      cash: collateral,
      currency: "USDC",
    };
  }

  // -------------------------------------------------------------------------
  // Browse markets (Gamma API)
  // -------------------------------------------------------------------------

  /**
   * Get available prediction markets from the Gamma API.
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

    return this.gammaApiRequest<
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

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private async pollOrderStatus(
    client: ClobClient,
    orderId: string,
    maxAttempts = 10,
    delayMs = 1000,
  ): Promise<{
    status: string;
    size_matched: string;
    price: string;
  }> {
    for (let i = 0; i < maxAttempts; i++) {
      const order = await client.getOrder(orderId);

      if (order && ["MATCHED", "CANCELLED", "EXPIRED"].includes(order.status)) {
        return {
          status: order.status,
          size_matched: (order as any).size_matched ?? "0",
          price: (order as any).price ?? "0",
        };
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    // Return last known state
    const order = await client.getOrder(orderId);
    return {
      status: (order as any)?.status ?? "UNKNOWN",
      size_matched: (order as any)?.size_matched ?? "0",
      price: (order as any)?.price ?? "0",
    };
  }
}

// ---------------------------------------------------------------------------
// Status mapping
// ---------------------------------------------------------------------------

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
