import { create } from "zustand";
import type {
  User,
  SubscriptionTier,
  MarketType,
  CopyStatus,
} from "@copy-cat/shared";

interface AuthState {
  session: { access_token: string; refresh_token: string } | null;
  user: User | null;
  subscriptionTier: SubscriptionTier;
  isAuthenticated: boolean;
  isLoading: boolean;
  setSession: (session: AuthState["session"]) => void;
  setUser: (user: User) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  subscriptionTier: "free",
  isAuthenticated: false,
  isLoading: true,

  setSession: (session) =>
    set({
      session,
      isAuthenticated: session !== null,
    }),

  setUser: (user) =>
    set({
      user,
      subscriptionTier: user.subscription_tier,
    }),

  setLoading: (isLoading) => set({ isLoading }),

  logout: () =>
    set({
      session: null,
      user: null,
      subscriptionTier: "free",
      isAuthenticated: false,
    }),
}));

interface MarketFilterState {
  activeMarket: MarketType | "all";
  setActiveMarket: (market: MarketType | "all") => void;
}

export const useMarketFilterStore = create<MarketFilterState>((set) => ({
  activeMarket: "all",
  setActiveMarket: (activeMarket) => set({ activeMarket }),
}));

interface CopySettingsState {
  traderId: string | null;
  portfolioId: string | null;
  brokerConnectionId: string | null;
  allocationAmount: number;
  maxPositionPct: number;
  copyRatio: number;
  stopLossPct: number | null;
  takeProfitPct: number | null;
  marketsFilter: MarketType[] | null;
  status: CopyStatus;

  setTrader: (traderId: string) => void;
  setPortfolio: (portfolioId: string) => void;
  setBrokerConnection: (brokerConnectionId: string) => void;
  setAllocationAmount: (amount: number) => void;
  setMaxPositionPct: (pct: number) => void;
  setCopyRatio: (ratio: number) => void;
  setStopLossPct: (pct: number | null) => void;
  setTakeProfitPct: (pct: number | null) => void;
  setMarketsFilter: (markets: MarketType[] | null) => void;
  setStatus: (status: CopyStatus) => void;
  reset: () => void;
}

const defaultCopySettings = {
  traderId: null,
  portfolioId: null,
  brokerConnectionId: null,
  allocationAmount: 1000,
  maxPositionPct: 10,
  copyRatio: 1,
  stopLossPct: null,
  takeProfitPct: null,
  marketsFilter: null,
  status: "active" as CopyStatus,
};

export const useCopySettingsStore = create<CopySettingsState>((set) => ({
  ...defaultCopySettings,

  setTrader: (traderId) => set({ traderId }),
  setPortfolio: (portfolioId) => set({ portfolioId }),
  setBrokerConnection: (brokerConnectionId) => set({ brokerConnectionId }),
  setAllocationAmount: (allocationAmount) => set({ allocationAmount }),
  setMaxPositionPct: (maxPositionPct) => set({ maxPositionPct }),
  setCopyRatio: (copyRatio) => set({ copyRatio }),
  setStopLossPct: (stopLossPct) => set({ stopLossPct }),
  setTakeProfitPct: (takeProfitPct) => set({ takeProfitPct }),
  setMarketsFilter: (marketsFilter) => set({ marketsFilter }),
  setStatus: (status) => set({ status }),
  reset: () => set(defaultCopySettings),
}));
