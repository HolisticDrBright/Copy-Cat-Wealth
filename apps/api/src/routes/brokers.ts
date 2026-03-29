import { Hono } from "hono";
import { supabase } from "../lib/supabase";
import type {
  BrokerConnection,
  BrokerConnectionStatus,
  BrokerProvider,
  ApiResult,
} from "@copy-cat/shared";

type Env = {
  Variables: {
    userId: string;
    accessToken: string;
  };
};

const brokers = new Hono<Env>();

brokers.get("/", async (c) => {
  const userId = c.get("userId");

  const { data, error } = await supabase
    .from("broker_connections")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    return c.json<ApiResult<null>>(
      { data: null, error: { code: "QUERY_FAILED", message: error.message } },
      500,
    );
  }

  return c.json<ApiResult<BrokerConnection[]>>({
    data: data as BrokerConnection[],
    error: null,
  });
});

brokers.get("/:id", async (c) => {
  const userId = c.get("userId");
  const brokerId = c.req.param("id");

  const { data, error } = await supabase
    .from("broker_connections")
    .select("*")
    .eq("id", brokerId)
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    const status = error?.code === "PGRST116" ? 404 : 500;
    return c.json<ApiResult<null>>(
      {
        data: null,
        error: {
          code: status === 404 ? "NOT_FOUND" : "QUERY_FAILED",
          message: status === 404 ? "Broker connection not found" : error!.message,
        },
      },
      status,
    );
  }

  return c.json<ApiResult<BrokerConnection>>({ data: data as BrokerConnection, error: null });
});

brokers.post("/", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<{
    provider: BrokerProvider;
    account_id: string;
    account_label: string;
    access_token: string;
    refresh_token?: string;
  }>();

  const { data: existing } = await supabase
    .from("broker_connections")
    .select("id")
    .eq("user_id", userId)
    .eq("provider", body.provider)
    .eq("account_id", body.account_id)
    .single();

  if (existing) {
    return c.json<ApiResult<null>>(
      { data: null, error: { code: "DUPLICATE", message: "This broker account is already connected" } },
      409,
    );
  }

  const { data, error } = await supabase
    .from("broker_connections")
    .insert({
      user_id: userId,
      provider: body.provider,
      account_id: body.account_id,
      account_label: body.account_label,
      status: "connected",
      buying_power: 0,
      portfolio_value: 0,
      markets_supported: [],
      last_synced_at: null,
    })
    .select()
    .single();

  if (error) {
    return c.json<ApiResult<null>>(
      { data: null, error: { code: "CREATE_FAILED", message: error.message } },
      500,
    );
  }

  return c.json<ApiResult<BrokerConnection>>({ data: data as BrokerConnection, error: null }, 201);
});

brokers.patch("/:id", async (c) => {
  const userId = c.get("userId");
  const brokerId = c.req.param("id");
  const body = await c.req.json<{
    account_label?: string;
    status?: BrokerConnectionStatus;
  }>();

  const { data, error } = await supabase
    .from("broker_connections")
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq("id", brokerId)
    .eq("user_id", userId)
    .select()
    .single();

  if (error || !data) {
    const status = error?.code === "PGRST116" ? 404 : 500;
    return c.json<ApiResult<null>>(
      {
        data: null,
        error: {
          code: status === 404 ? "NOT_FOUND" : "UPDATE_FAILED",
          message: status === 404 ? "Broker connection not found" : error!.message,
        },
      },
      status,
    );
  }

  return c.json<ApiResult<BrokerConnection>>({ data: data as BrokerConnection, error: null });
});

brokers.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const brokerId = c.req.param("id");

  const { data: activeCopies } = await supabase
    .from("copy_subscriptions")
    .select("id")
    .eq("broker_connection_id", brokerId)
    .eq("user_id", userId)
    .eq("status", "active");

  if (activeCopies && activeCopies.length > 0) {
    return c.json<ApiResult<null>>(
      {
        data: null,
        error: {
          code: "ACTIVE_COPIES",
          message: "Cannot disconnect broker with active copy subscriptions. Stop all copies first.",
        },
      },
      400,
    );
  }

  const { error } = await supabase
    .from("broker_connections")
    .delete()
    .eq("id", brokerId)
    .eq("user_id", userId);

  if (error) {
    return c.json<ApiResult<null>>(
      { data: null, error: { code: "DELETE_FAILED", message: error.message } },
      500,
    );
  }

  return c.json<ApiResult<{ deleted: true }>>({ data: { deleted: true }, error: null });
});

export default brokers;
