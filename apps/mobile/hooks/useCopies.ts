import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type {
  CopySubscription,
  CopyStatus,
  MarketType,
} from "@copy-cat/shared";
import type { CopyCardData } from "../components/CopyCard";

// ---------------------------------------------------------------------------
// Mock data for development
// ---------------------------------------------------------------------------

const MOCK_COPIES: CopyCardData[] = [
  {
    subscription: {
      id: "cs1",
      user_id: "me",
      trader_id: "t1",
      portfolio_id: "p1",
      broker_connection_id: "bc1",
      status: "active",
      allocation_amount: 5000,
      max_position_pct: 10,
      copy_ratio: 1,
      stop_loss_pct: 15,
      take_profit_pct: null,
      markets_filter: null,
      total_pnl: 842.5,
      total_pnl_pct: 16.85,
      trades_copied: 47,
      created_at: "2024-11-01T00:00:00Z",
      updated_at: "2025-03-01T00:00:00Z",
    },
    trader: {
      id: "t1",
      display_name: "Alex Morgan",
      avatar_url: "https://i.pravatar.cc/150?u=alex",
    },
    portfolio: { id: "p1", name: "Tech Momentum" },
    todayTradeCount: 3,
  },
  {
    subscription: {
      id: "cs2",
      user_id: "me",
      trader_id: "t2",
      portfolio_id: "p3",
      broker_connection_id: "bc1",
      status: "paused",
      allocation_amount: 2500,
      max_position_pct: 5,
      copy_ratio: 0.5,
      stop_loss_pct: 10,
      take_profit_pct: 50,
      markets_filter: ["stocks"],
      total_pnl: -128.3,
      total_pnl_pct: -5.13,
      trades_copied: 22,
      created_at: "2025-01-15T00:00:00Z",
      updated_at: "2025-03-01T00:00:00Z",
    },
    trader: {
      id: "t2",
      display_name: "Sarah Chen",
      avatar_url: "https://i.pravatar.cc/150?u=sarah",
    },
    portfolio: { id: "p3", name: "Dividend Aristocrats" },
    todayTradeCount: 0,
  },
];

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

const copyKeys = {
  all: ["copies"] as const,
  list: () => ["copies", "list"] as const,
  detail: (id: string) => ["copies", "detail", id] as const,
};

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useCopies() {
  return useQuery({
    queryKey: copyKeys.list(),
    queryFn: async ({ signal }) => {
      try {
        return await api.get<CopyCardData[]>("/copies", { signal });
      } catch {
        await new Promise((r) => setTimeout(r, 300));
        return MOCK_COPIES;
      }
    },
  });
}

interface CreateCopyInput {
  trader_id: string;
  portfolio_id: string;
  broker_connection_id: string;
  allocation_amount: number;
  max_position_pct: number;
  copy_ratio: number;
  stop_loss_pct?: number | null;
  take_profit_pct?: number | null;
  markets_filter?: MarketType[] | null;
}

export function useCreateCopy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateCopyInput) => {
      try {
        return await api.post<CopySubscription>("/copies", input);
      } catch {
        // Mock: return a fake subscription
        const mock: CopySubscription = {
          id: `cs-${Date.now()}`,
          user_id: "me",
          trader_id: input.trader_id,
          portfolio_id: input.portfolio_id,
          broker_connection_id: input.broker_connection_id,
          status: "active",
          allocation_amount: input.allocation_amount,
          max_position_pct: input.max_position_pct,
          copy_ratio: input.copy_ratio,
          stop_loss_pct: input.stop_loss_pct ?? null,
          take_profit_pct: input.take_profit_pct ?? null,
          markets_filter: input.markets_filter ?? null,
          total_pnl: 0,
          total_pnl_pct: 0,
          trades_copied: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        return mock;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: copyKeys.all });
    },
  });
}

interface UpdateCopyInput {
  id: string;
  status?: CopyStatus;
  allocation_amount?: number;
  max_position_pct?: number;
  copy_ratio?: number;
  stop_loss_pct?: number | null;
  take_profit_pct?: number | null;
  markets_filter?: MarketType[] | null;
}

export function useUpdateCopy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...body }: UpdateCopyInput) => {
      try {
        return await api.patch<CopySubscription>(`/copies/${id}`, body);
      } catch {
        // Mock: return patched values
        return { id, ...body } as unknown as CopySubscription;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: copyKeys.all });
    },
  });
}

export function useDeleteCopy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      try {
        await api.delete(`/copies/${id}`);
      } catch {
        // Mock: no-op
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: copyKeys.all });
    },
  });
}
