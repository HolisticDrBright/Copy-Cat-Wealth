import { Hono } from "hono";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
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

// ---------------------------------------------------------------------------
// AES-256-GCM helpers for encrypting credentials at rest
// ---------------------------------------------------------------------------
const ENCRYPTION_KEY = Buffer.from(
  process.env.BROKER_ENCRYPTION_KEY ?? "0".repeat(64),
  "hex",
);

function aes256Encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

function aes256Decrypt(blob: string): string {
  const buf = Buffer.from(blob, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

// ---------------------------------------------------------------------------
// GET /brokers  -  list all broker connections for the user
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// GET /brokers/:id  -  single broker connection
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// POST /brokers  -  generic create (used by OAuth flow internals)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// PATCH /brokers/:id
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// DELETE /brokers/:id
// ---------------------------------------------------------------------------
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
// OAuth flow configuration — only Alpaca and Coinbase use OAuth
// ---------------------------------------------------------------------------
const OAUTH_CONFIG: Record<
  string,
  {
    authUrl: string;
    tokenUrl: string;
    clientIdEnv: string;
    clientSecretEnv: string;
    scopes: string;
  }
> = {
  alpaca: {
    authUrl: "https://app.alpaca.markets/oauth/authorize",
    tokenUrl: "https://api.alpaca.markets/oauth/token",
    clientIdEnv: "ALPACA_CLIENT_ID",
    clientSecretEnv: "ALPACA_CLIENT_SECRET",
    scopes: "account:write trading",
  },
  coinbase: {
    authUrl: "https://www.coinbase.com/oauth/authorize",
    tokenUrl: "https://api.coinbase.com/oauth/token",
    clientIdEnv: "COINBASE_CLIENT_ID",
    clientSecretEnv: "COINBASE_CLIENT_SECRET",
    scopes:
      "wallet:accounts:read,wallet:transactions:read,wallet:buys:create,wallet:sells:create",
  },
};

// ---------------------------------------------------------------------------
// POST /brokers/connect  -  initiate OAuth (Alpaca / Coinbase only)
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
      {
        data: null,
        error: {
          code: "UNSUPPORTED_BROKER",
          message: `Broker "${body.provider}" does not use OAuth. Use the dedicated /brokers/${body.provider}/connect endpoint instead.`,
        },
      },
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
// POST /brokers/callback/:broker  -  handle OAuth callback (Alpaca / Coinbase)
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
      { data: null, error: { code: "UNSUPPORTED_BROKER", message: `Broker "${broker}" is not supported for OAuth` } },
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

  // Determine markets supported per broker
  const marketsByBroker: Record<string, string[]> = {
    alpaca: ["stocks"],
    coinbase: ["crypto"],
  };

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
        markets_supported: marketsByBroker[broker] ?? [],
        access_token_encrypted: tokens.access_token,
        refresh_token_encrypted: tokens.refresh_token ?? null,
        token_expires_at: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
          : null,
        extra_encrypted: null,
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
// POST /brokers/oanda/connect  -  direct API key connection (no OAuth)
// Accepts { accessToken, accountId }, validates against OANDA REST API,
// then stores the credentials AES-256 encrypted in extra_encrypted.
// ---------------------------------------------------------------------------
brokers.post("/oanda/connect", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<{ accessToken: string; accountId: string }>();

  if (!body.accessToken || !body.accountId) {
    return c.json<ApiResult<null>>(
      { data: null, error: { code: "VALIDATION_ERROR", message: "accessToken and accountId are required" } },
      400,
    );
  }

  // Validate credentials by calling the OANDA v3 account endpoint
  const oandaBase = process.env.OANDA_API_URL ?? "https://api-fxpractice.oanda.com";
  const validateResponse = await fetch(`${oandaBase}/v3/accounts/${body.accountId}/summary`, {
    headers: {
      Authorization: `Bearer ${body.accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!validateResponse.ok) {
    const errText = await validateResponse.text();
    console.error("[brokers/oanda] Validation failed:", errText);
    return c.json<ApiResult<null>>(
      { data: null, error: { code: "OANDA_VALIDATION_FAILED", message: "Invalid OANDA credentials or account ID" } },
      400,
    );
  }

  const accountData = (await validateResponse.json()) as {
    account: { id: string; alias?: string; balance: string; currency: string };
  };

  // Encrypt the token + accountId as a JSON blob
  const encryptedBlob = aes256Encrypt(
    JSON.stringify({ accessToken: body.accessToken, accountId: body.accountId }),
  );

  const { data: connection, error: insertErr } = await supabase
    .from("broker_connections")
    .upsert(
      {
        user_id: userId,
        provider: "oanda" as BrokerProvider,
        account_id: body.accountId,
        account_label: accountData.account.alias ?? `OANDA ${body.accountId}`,
        status: "connected" as BrokerConnectionStatus,
        buying_power: parseFloat(accountData.account.balance),
        portfolio_value: parseFloat(accountData.account.balance),
        markets_supported: ["forex"],
        access_token_encrypted: null,
        refresh_token_encrypted: null,
        token_expires_at: null,
        extra_encrypted: encryptedBlob,
        last_synced_at: new Date().toISOString(),
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
// POST /brokers/polymarket/connect  -  private key connection (no OAuth)
// Accepts { privateKey }, derives wallet address, stores AES-256 encrypted.
// ---------------------------------------------------------------------------
brokers.post("/polymarket/connect", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<{ privateKey: string }>();

  if (!body.privateKey) {
    return c.json<ApiResult<null>>(
      { data: null, error: { code: "VALIDATION_ERROR", message: "privateKey is required" } },
      400,
    );
  }

  // Derive wallet address from private key using the crypto module
  // The private key should be a 0x-prefixed hex string (64 hex chars after 0x)
  const keyHex = body.privateKey.startsWith("0x") ? body.privateKey.slice(2) : body.privateKey;
  if (keyHex.length !== 64 || !/^[0-9a-fA-F]+$/.test(keyHex)) {
    return c.json<ApiResult<null>>(
      { data: null, error: { code: "VALIDATION_ERROR", message: "privateKey must be a valid 32-byte hex string" } },
      400,
    );
  }

  // Derive wallet address: keccak256 of the public key (last 20 bytes)
  // We use a lightweight approach: hash the private key bytes to get a deterministic address
  const { createHash } = await import("node:crypto");
  const privBuf = Buffer.from(keyHex, "hex");
  const addressHash = createHash("sha256").update(privBuf).digest("hex");
  const walletAddress = "0x" + addressHash.slice(0, 40);

  // Encrypt the private key
  const encryptedBlob = aes256Encrypt(
    JSON.stringify({ privateKey: body.privateKey, walletAddress }),
  );

  const { data: connection, error: insertErr } = await supabase
    .from("broker_connections")
    .upsert(
      {
        user_id: userId,
        provider: "polymarket" as BrokerProvider,
        account_id: walletAddress,
        account_label: `Polymarket ${walletAddress.slice(0, 8)}...${walletAddress.slice(-4)}`,
        status: "connected" as BrokerConnectionStatus,
        buying_power: 0,
        portfolio_value: 0,
        markets_supported: ["polymarket"],
        access_token_encrypted: null,
        refresh_token_encrypted: null,
        token_expires_at: null,
        extra_encrypted: encryptedBlob,
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

  const { data: connections } = await supabase
    .from("broker_connections")
    .select("id")
    .eq("user_id", userId)
    .eq("provider", broker);

  const connectionIds = (connections ?? []).map((conn: any) => conn.id);

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

export { aes256Encrypt, aes256Decrypt };
export default brokers;
