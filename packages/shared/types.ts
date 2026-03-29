export type MarketType = "stocks" | "crypto" | "forex" | "polymarket" | "all";

export type SubscriptionTier = "free" | "pro" | "elite";

export type CopyStatus = "active" | "paused" | "stopped";

export type TradeDirection = "long" | "short";

export type TradeSide = "buy" | "sell";

export type TradeAction = "open" | "add" | "reduce" | "close";

export type TradeStatus = "pending" | "filled" | "partially_filled" | "cancelled" | "rejected";

export type OrderType = "market" | "limit" | "stop" | "stop_limit";

export type BrokerProvider =
  | "alpaca"
  | "coinbase"
  | "kraken"
  | "oanda"
  | "polymarket";

export type BrokerConnectionStatus = "connected" | "disconnected" | "error" | "pending";

export interface User {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  subscription_tier: SubscriptionTier;
  created_at: string;
  updated_at: string;
}

export interface Trader {
  id: string;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  bio: string;
  markets: MarketType[];
  is_verified: boolean;
  is_public: boolean;
  follower_count: number;
  copier_count: number;
  created_at: string;
  updated_at: string;
}

export interface TraderStats {
  trader_id: string;
  period: "7d" | "30d" | "90d" | "1y" | "all";
  total_return_pct: number;
  win_rate: number;
  avg_gain_pct: number;
  avg_loss_pct: number;
  profit_factor: number;
  sharpe_ratio: number;
  max_drawdown_pct: number;
  total_trades: number;
  avg_hold_time_hours: number;
  best_trade_pct: number;
  worst_trade_pct: number;
  updated_at: string;
}

export interface Portfolio {
  id: string;
  trader_id: string;
  name: string;
  description: string;
  markets: MarketType[];
  is_public: boolean;
  total_value: number;
  cash_balance: number;
  day_pnl: number;
  day_pnl_pct: number;
  total_pnl: number;
  total_pnl_pct: number;
  created_at: string;
  updated_at: string;
}

export interface PortfolioPosition {
  id: string;
  portfolio_id: string;
  symbol: string;
  market: MarketType;
  direction: TradeDirection;
  quantity: number;
  avg_entry_price: number;
  current_price: number;
  unrealized_pnl: number;
  unrealized_pnl_pct: number;
  opened_at: string;
  updated_at: string;
}

export interface PortfolioTrade {
  id: string;
  portfolio_id: string;
  symbol: string;
  market: MarketType;
  side: TradeSide;
  direction: TradeDirection;
  order_type: OrderType;
  quantity: number;
  price: number;
  total_value: number;
  realized_pnl: number | null;
  realized_pnl_pct: number | null;
  status: TradeStatus;
  executed_at: string;
  created_at: string;
}

export interface TradeSignal {
  portfolioId: string;
  tradeId: string;
  symbol: string;
  market: MarketType;
  action: TradeAction;
  side: TradeDirection;
  weight_pct_before: number;
  weight_pct_after: number;
  price: number;
  timestamp: string;
}

export interface CopySubscription {
  id: string;
  user_id: string;
  trader_id: string;
  portfolio_id: string;
  broker_connection_id: string;
  status: CopyStatus;
  allocation_amount: number;
  max_position_pct: number;
  copy_ratio: number;
  stop_loss_pct: number | null;
  take_profit_pct: number | null;
  markets_filter: MarketType[] | null;
  total_pnl: number;
  total_pnl_pct: number;
  trades_copied: number;
  created_at: string;
  updated_at: string;
}

export interface UserTrade {
  id: string;
  user_id: string;
  copy_subscription_id: string;
  source_trade_id: string;
  broker_connection_id: string;
  symbol: string;
  market: MarketType;
  side: TradeSide;
  direction: TradeDirection;
  order_type: OrderType;
  quantity: number;
  price: number;
  total_value: number;
  realized_pnl: number | null;
  realized_pnl_pct: number | null;
  status: TradeStatus;
  broker_order_id: string | null;
  error_message: string | null;
  executed_at: string | null;
  created_at: string;
}

export interface BrokerConnection {
  id: string;
  user_id: string;
  provider: BrokerProvider;
  account_id: string;
  account_label: string;
  status: BrokerConnectionStatus;
  buying_power: number;
  portfolio_value: number;
  markets_supported: MarketType[];
  /** AES-256 encrypted blob for extra credentials (e.g. OANDA token+accountID, Polymarket private key) */
  extra_encrypted: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: "trade_copied" | "trade_failed" | "stop_loss_hit" | "trader_alert" | "system";
  data: Record<string, unknown> | null;
  read: boolean;
  created_at: string;
}

export interface PnlDataPoint {
  timestamp: string;
  value: number;
}

export interface LeaderboardEntry {
  trader: Trader;
  stats: TraderStats;
  rank: number;
}

export interface ApiResponse<T> {
  data: T;
  error: null;
}

export interface ApiError {
  data: null;
  error: {
    code: string;
    message: string;
  };
}

export type ApiResult<T> = ApiResponse<T> | ApiError;

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
  has_more: boolean;
}
