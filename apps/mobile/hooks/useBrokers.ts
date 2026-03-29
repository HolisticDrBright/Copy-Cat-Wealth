import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import { api } from "../lib/api";
import type { BrokerConnection, BrokerProvider } from "@copy-cat/shared";

// ---------------------------------------------------------------------------
// Mock data for development
// ---------------------------------------------------------------------------

const MOCK_BROKERS: BrokerConnection[] = [
  {
    id: "bc1",
    user_id: "me",
    provider: "alpaca",
    account_id: "ALP-12345",
    account_label: "Alpaca - Main",
    status: "connected",
    buying_power: 24500,
    portfolio_value: 67800,
    markets_supported: ["stocks", "crypto"],
    last_synced_at: "2025-03-01T12:00:00Z",
    created_at: "2024-09-01T00:00:00Z",
    updated_at: "2025-03-01T12:00:00Z",
  },
  {
    id: "bc2",
    user_id: "me",
    provider: "coinbase",
    account_id: "CB-98765",
    account_label: "Coinbase - Trading",
    status: "connected",
    buying_power: 5200,
    portfolio_value: 18400,
    markets_supported: ["crypto"],
    last_synced_at: "2025-03-01T11:30:00Z",
    created_at: "2024-11-15T00:00:00Z",
    updated_at: "2025-03-01T11:30:00Z",
  },
];

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

const brokerKeys = {
  all: ["brokers"] as const,
  list: () => ["brokers", "list"] as const,
  detail: (id: string) => ["brokers", "detail", id] as const,
};

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useBrokers() {
  return useQuery({
    queryKey: brokerKeys.list(),
    queryFn: async ({ signal }) => {
      try {
        return await api.get<BrokerConnection[]>("/brokers", { signal });
      } catch {
        await new Promise((r) => setTimeout(r, 250));
        return MOCK_BROKERS;
      }
    },
  });
}

interface ConnectBrokerInput {
  provider: BrokerProvider;
}

interface ConnectBrokerResponse {
  broker_connection: BrokerConnection;
  oauth_url: string | null;
}

export function useConnectBroker() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ provider }: ConnectBrokerInput) => {
      try {
        const result = await api.post<ConnectBrokerResponse>(
          "/brokers/connect",
          { provider }
        );

        // If the API returns an OAuth URL, open it in the browser
        if (result.oauth_url) {
          await Linking.openURL(result.oauth_url);
        }

        return result;
      } catch {
        // Mock: simulate OAuth flow
        const mockConnection: BrokerConnection = {
          id: `bc-${Date.now()}`,
          user_id: "me",
          provider,
          account_id: `${provider.toUpperCase()}-${Math.floor(Math.random() * 99999)}`,
          account_label: `${provider} - New`,
          status: "pending",
          buying_power: 0,
          portfolio_value: 0,
          markets_supported: provider === "coinbase" || provider === "binance"
            ? ["crypto"]
            : provider === "oanda"
            ? ["forex"]
            : ["stocks"],
          last_synced_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        return {
          broker_connection: mockConnection,
          oauth_url: null,
        } satisfies ConnectBrokerResponse;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: brokerKeys.all });
    },
  });
}

export function useDisconnectBroker() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      try {
        await api.delete(`/brokers/${id}`);
      } catch {
        // Mock: no-op
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: brokerKeys.all });
    },
  });
}
