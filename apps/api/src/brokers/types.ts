import type { MarketType, TradeSide, TradeDirection, OrderType, TradeStatus } from "@copy-cat/shared";

export interface BrokerCredentials {
  accessToken: string;
  refreshToken?: string;
}

export interface TradeParams {
  symbol: string;
  market: MarketType;
  side: TradeSide;
  direction: TradeDirection;
  orderType: OrderType;
  quantity: number;
  price: number;
}

export interface TradeResult {
  orderId: string;
  status: TradeStatus;
  filledQuantity: number;
  filledPrice: number;
  fee: number;
  rawResponse?: unknown;
}

export interface Position {
  symbol: string;
  market: MarketType;
  quantity: number;
  averageEntryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  direction: TradeDirection;
}

export interface AccountInfo {
  accountId: string;
  buyingPower: number;
  portfolioValue: number;
  cash: number;
  currency: string;
}

export interface OrderStatus {
  orderId: string;
  status: TradeStatus;
  symbol: string;
  side: TradeSide;
  filledQuantity: number;
  filledPrice: number;
  submittedAt: string;
  filledAt: string | null;
  rawResponse?: unknown;
}

export interface BrokerAdapter {
  readonly provider: string;

  /** Execute a trade order */
  executeTrade(params: TradeParams): Promise<TradeResult>;

  /** Get current open positions */
  getPositions(): Promise<Position[]>;

  /** Get account info (buying power, portfolio value, etc.) */
  getAccount(): Promise<AccountInfo>;

  /** Close a position by symbol (optional — not all brokers support this) */
  closePosition?(symbol: string): Promise<TradeResult>;

  /** Cancel an open order by ID */
  cancelOrder?(orderId: string): Promise<void>;

  /** Get the status of an order by ID */
  getOrderStatus?(orderId: string): Promise<OrderStatus>;
}
