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

// ---------------------------------------------------------------------------
// OAuth flow configuration per broker
// ---------------------------------------------------------------------------
const OAUTH_CONFIG: Record<string, { authUrl: string; tokenUrl: string; clientIdEnv: string; clientSecretEnv: string; scopes: string }> = {
  robinhood: {
    authUrl: "https://api.robinhood.com/oauth2/authorize/",
    tokenUrl: "https://api.robinhood.com/oauth2/token/",
    clientIdEnv: "ROBINHOOD_CLIENT_ID",
    clientSecretEnv: "ROBINHOOD_CLIENT_SECRET",
    scopes: "read trade",
  },
  coinbase: {
    authUrl: "https://www.coinbase.com/oauth/authorize",
    tokenUrl: "https://api.coinbase.com/oauth/token",
    clientIdEnv: "COINBASE_CLIENT_ID",
    clientSecretEnv: "COINBASE_CLIENT_SECRET",
    scopes: "wallet:accounts:read,wallet:trades:create,wallet:trades:read",
  },
  oanda: {
    authUrl: "https://api-fxpractice.oanda.com/oauth2/authorize",
    tokenUrl: "https://api-fxpractice.oanda.com/oauth2/token",
    clientIdEnv: "OANDA_CLIENT_ID",
    clientSecretEnv: "OANDA_CLIENT_SECRET",
    scopes: "read trade",
  },
  polymarket: {
    authUrl: "https://clob.polymarket.com/auth/authorize",
    tokenUrl: "https://clob.polymarket.com/auth/token",
    clientIdEnv: "POLYMARKET_CLIENT_ID",
    clientSecretEnv: "POLYMARKET_CLIENT_SECRET",
    scopes: "trade read",
  },
};

// ---------------------------------------------------------------------------
// POST /brokers/connect  -  initiate OAuth, returns redirect URL
// ---------------------------------------------------------------------------
brokers.post("/connect", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<{ provider: BrokerProvider; redirect_uri: string }>();

  if (!body.provider || !body.redirect_uri) {
    return c.json<ApiResult<null>>(
      { data: null, error: { code: "VALIDATION_ERROR", message: "provider and redirect_uri are required" } },
      400,
    );
  }

  const config = OAUTH_CONFIG[body.provider];
  if (!config) {
    return c.json<ApiResult<null>>(
      { data: null, error: { code: "UNSUPPORTED_BROKER", message: `Broker "${body.provider}" is not supported for OAuth` } },
      400,
    );
  }

  const clientId = process.env[config.clientIdEnv];
  if (!clientId) {
    return c.json<ApiResult<null>>(
      { data: null, error: { code: "CONFIG_ERROR", message: "Broker OAuth is not configured" } },
      500,
    );
  }

  // Generate a state token to prevent CSRF and map back to user
  const state = crypto.randomUUID();
  await supabase.from("oauth_states").insert({
    state,
    user_id: userId,
    provider: body.provider,
    redirect_uri: body.redirect_uri,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: `${process.env.API_BASE_URL}/api/brokers/callback/${body.provider}`,
    scope: config.scopes,
    state,
  });

  const authorizationUrl = `${config.authUrl}?${params.toString()}`;

  return c.json<ApiResult<{ authorization_url: string; state: string }>>({
    data: { authorization_url: authorizationUrl, state },
    error: null,
  });
});

// ---------------------------------------------------------------------------
// POST /brokers/callback/:broker  -  handle OAuth callback, store tokens
// ---------------------------------------------------------------------------
brokers.post("/callback/:broker", async (c) => {
  const broker = c.req.param("broker") as BrokerProvider;
  const body = await c.req.json<{ code: string; state: string }>();

  if (!body.code || !body.state) {
    return c.json<ApiResult<null>>(
      { data: null, error: { code: "VALIDATION_ERROR", message: "code and state are required" } },
      400,
    );
  }

  const config = OAUTH_CONFIG[broker];
  if (!config) {
    return c.json<ApiResult<null>>(
      { data: null, error: { code: "UNSUPPORTED_BROKER", message: `Broker "${broker}" is not supported` } },
      400,
    );
  }

  // Verify state token
  const { data: oauthState, error: stateErr } = await supabase
    .from("oauth_states")
    .select("*")
    .eq("state", body.state)
    .eq("provider", broker)
    .single();

  if (stateErr || !oauthState) {
    return c.json<ApiResult<null>>(
      { data: null, error: { code: "INVALID_STATE", message: "Invalid or expired OAuth state" } },
      400,
    );
  }

  if (new Date(oauthState.expires_at) < new Date()) {
    return c.json<ApiResult<null>>(
      { data: null, error: { code: "STATE_EXPIRED", message: "OAuth state has expired. Please try again." } },
      400,
    );
  }

  // Clean up used state
  await supabase.from("oauth_states").delete().eq("state", body.state);

  const clientId = process.env[config.clientIdEnv]!;
  const clientSecret = process.env[config.clientSecretEnv]!;

  // Exchange authorization code for tokens
  const tokenResponse = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: body.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: `${process.env.API_BASE_URL}/api/brokers/callback/${broker}`,
    }),
  });

  if (!tokenResponse.ok) {
    const errText = await tokenResponse.text();
    console.error(`OAuth token exchange failed for ${broker}:`, errText);
    return c.json<ApiResult<null>>(
      { data: null, error: { code: "TOKEN_EXCHANGE_FAILED", message: "Failed to exchange OAuth code for tokens" } },
      502,
    );
  }

  const tokens = (await tokenResponse.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    account_id?: string;
  };

  // Store encrypted tokens in broker_connections
  // Note: In production, access_token and refresh_token should be encrypted at rest
  const { data: connection, error: insertErr } = await supabase
    .from("broker_connections")
    .upsert(
      {
        user_id: oauthState.user_id,
        provider: broker,
        account_id: tokens.account_id ?? "default",
        account_label: `${broker} account`,
        status: "connected" as BrokerConnectionStatus,
        buying_power: 0,
        portfolio_value: 0,
        markets_supported: [],
        access_token_encrypted: tokens.access_token,
        refresh_token_encrypted: tokens.refresh_token ?? null,
        token_expires_at: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
          : null,
        last_synced_at: null,
      },
      { onConflict: "user_id,provider,account_id" },
    )
    .select()
    .single();

  if (insertErr) {
    return c.json<ApiResult<null>>(
      { data: null, error: { code: "STORE_FAILED", message: insertErr.message } },
      500,
    );
  }

  return c.json<ApiResult<BrokerConnection>>(
    { data: connection as BrokerConnection, error: null },
    201,
  );
});

// ---------------------------------------------------------------------------
// DELETE /brokers/provider/:broker  -  disconnect broker by provider name
// ---------------------------------------------------------------------------
brokers.delete("/provider/:broker", async (c) => {
  const userId = c.get("userId");
  const broker = c.req.param("broker") as BrokerProvider;

  // Check for active copies using any connection from this provider
  const { data: connections } = await supabase
    .from("broker_connections")
    .select("id")
    .eq("user_id", userId)
    .eq("provider", broker);

  const connectionIds = (connections ?? []).map((c: any) => c.id);

  if (connectionIds.length > 0) {
    const { data: activeCopies } = await supabase
      .from("copy_subscriptions")
      .select("id")
      .in("broker_connection_id", connectionIds)
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
  }

  const { error } = await supabase
    .from("broker_connections")
    .delete()
    .eq("user_id", userId)
    .eq("provider", broker);

  if (error) {
    return c.json<ApiResult<null>>(
      { data: null, error: { code: "DELETE_FAILED", message: error.message } },
      500,
    );
  }

  return c.json<ApiResult<{ deleted: true; provider: string }>>({
    data: { deleted: true, provider: broker },
    error: null,
  });
});

export default brokers;
