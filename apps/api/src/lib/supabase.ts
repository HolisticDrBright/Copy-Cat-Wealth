import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/** Server-side Supabase client with service role privileges. */
export const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Create a Supabase client scoped to a user's JWT.
 * Use this when RLS policies should apply.
 */
export function supabaseForUser(accessToken: string) {
  return createClient(supabaseUrl, supabaseServiceKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
