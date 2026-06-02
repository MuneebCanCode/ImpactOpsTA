// =============================================================================
// Edge Function: invite-member
// =============================================================================
//
// The ONLY privileged server component in the system. It exists because the
// invite flow is a multi-step, security-sensitive operation that must not be
// expressible as a raw client write:
//
//   1. Authenticate the caller from their session JWT.
//   2. Re-validate the input (email + organizationId) with Zod — the server
//      never trusts the client's own validation (Req 7.3).
//   3. Verify the caller OWNS the target organization by reading it *as the
//      caller* (RLS-scoped) before any privileged write (Req 7.4, 11.6, 17.2,
//      17.3). Because the service-role key bypasses RLS, this explicit check is
//      mandatory: it is what stops the function being tricked into writing to
//      an org the caller does not own.
//   4. Pre-check for an existing member/invite for that email in that org and
//      return a friendly 409 (Req 7.5). The DB UNIQUE(organization_id, email)
//      constraint is the ultimate guard and also maps to a 409 (Req 10.7).
//   5. Perform the privileged insert with status='invited' using a service-role
//      client (Req 7.1, 7.7).
//   6. Hit a single, clearly-commented EMAIL SEND INTEGRATION POINT so a
//      transactional invite email can be added later without touching the data
//      model (Req 7.7).
//
// Secret hygiene: the service-role key is read from the function's environment
// ONLY (`Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`) — never hard-coded, never
// returned, never logged (Req 11.6, 13.4).
//
// Request / response contract (matches design.md):
//   POST { organizationId: string (uuid), email: string }
//   Authorization: Bearer <caller session JWT>
//
//   201 { member }            invitation created
//   400 { error, details? }   bad JSON / failed Zod validation
//   401 { error }             missing or invalid session JWT
//   403 { error }             caller is not the organization's owner
//   409 { error }             duplicate member/invite for that email in that org
//   405 { error }             method other than POST / OPTIONS
//   500 { error }             unexpected server / configuration error
//
// _Requirements: 7.1, 7.3, 7.4, 7.5, 7.7, 11.6, 17.2, 17.3_
// =============================================================================

import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { z } from "https://esm.sh/zod@3.23.8";

// -----------------------------------------------------------------------------
// CORS
// -----------------------------------------------------------------------------
// The function is invoked from the browser SPA, so it must answer the CORS
// preflight and echo permissive headers on every response. `authorization` and
// `apikey` are explicitly allowed so the forwarded session JWT and anon key
// reach the function.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Build a JSON response carrying the shared CORS headers. */
function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// -----------------------------------------------------------------------------
// Validation (server-side re-validation)
// -----------------------------------------------------------------------------
// This mirrors the client invite schema (`src/features/members/schemas.ts`)
// exactly — trim, then require a well-formed email — so client and server agree
// on precisely which inputs are valid (Req 7.3 / Property 5). `organizationId`
// is additionally constrained to a UUID since it keys the ownership check and
// the FK; a malformed id is a 400, not a 403.
const inviteEmailSchema = z
  .string({ required_error: "Email is required" })
  .trim()
  .min(1, "Email is required")
  .email("Enter a valid email address");

const inviteRequestSchema = z.object({
  organizationId: z
    .string({ required_error: "organizationId is required" })
    .uuid("organizationId must be a valid UUID"),
  email: inviteEmailSchema,
});

// -----------------------------------------------------------------------------
// Environment
// -----------------------------------------------------------------------------
// Read once at module load. SUPABASE_URL and SUPABASE_ANON_KEY are injected into
// every Edge Function by the platform; SUPABASE_SERVICE_ROLE_KEY must be
// configured as a function secret. The service-role key is referenced here and
// nowhere else, and its value is never echoed back to the caller (Req 11.6,
// 13.4).
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
// SUPABASE_SERVICE_ROLE_KEY is injected automatically by the platform.
// SERVICE_ROLE_KEY is a manually set secret (fallback for new projects).
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SERVICE_ROLE_KEY");

/** Postgres unique-violation SQLSTATE, surfaced by PostgREST on the insert. */
const PG_UNIQUE_VIOLATION = "23505";

/**
 * Extract a bearer token from an Authorization header. Returns null when the
 * header is missing or not a well-formed `Bearer <token>`.
 */
function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

/**
 * Caller-scoped client: anon key + the caller's JWT forwarded as a header.
 * Every read through this client runs UNDER RLS as the authenticated user, so
 * it can only see rows the caller owns. This is the client used for the
 * ownership check. Session persistence/refresh are disabled — the function is
 * stateless and per-request.
 */
function createCallerClient(token: string): SupabaseClient {
  return createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Service-role client: bypasses RLS for the privileged insert and the duplicate
 * pre-check. Holding this key is exactly why the ownership check above is
 * mandatory before it is ever used to write.
 */
function createServiceClient(): SupabaseClient {
  return createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// -----------------------------------------------------------------------------
// Handler
// -----------------------------------------------------------------------------
Deno.serve(async (req: Request): Promise<Response> => {
  // CORS preflight.
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Only POST creates an invitation.
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // Fail fast (and safely) on misconfiguration. We never reveal which secret is
  // missing or its value.
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Server is not configured correctly" }, 500);
  }

  // --- Step 1: authenticate the caller (Req 7.1) -----------------------------
  // The JWT must be present before we do anything else.
  const token = extractBearerToken(req.headers.get("Authorization"));
  if (!token) {
    return jsonResponse({ error: "Missing or invalid authorization" }, 401);
  }

  // --- Step 2: parse + Zod re-validate the body (Req 7.3) --------------------
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return jsonResponse({ error: "Request body must be valid JSON" }, 400);
  }

  const parsed = inviteRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    // Field-level messages so the client can surface precise validation errors.
    return jsonResponse(
      {
        error: "Invalid invitation request",
        details: parsed.error.flatten().fieldErrors,
      },
      400,
    );
  }
  const { organizationId, email } = parsed.data;

  // Confirm the JWT actually resolves to a user. An expired/forged token yields
  // no user here -> 401.
  const callerClient = createCallerClient(token);
  const {
    data: { user },
    error: userError,
  } = await callerClient.auth.getUser(token);

  if (userError || !user) {
    return jsonResponse({ error: "Invalid or expired session" }, 401);
  }

  // --- Step 3: verify ownership by reading the org AS THE CALLER (RLS) -------
  // The `organizations` RLS policy is `owner_id = auth.uid()`, so this read
  // returns the row only when the caller owns it. A null result therefore means
  // "not found OR not owned" — both map to 403, which also avoids leaking the
  // existence of orgs owned by other admins (Req 7.4, 11.6, 17.2, 17.3).
  //
  // NOTE: extending this to admin-role members (Req 17.3) is a policy-level
  // change — broaden the organizations SELECT policy and/or check the caller's
  // role on organization_members here — without altering the privileged-write
  // path below.
  const { data: ownedOrg, error: ownershipError } = await callerClient
    .from("organizations")
    .select("id")
    .eq("id", organizationId)
    .maybeSingle();

  if (ownershipError) {
    return jsonResponse({ error: "Failed to verify organization access" }, 500);
  }
  if (!ownedOrg) {
    return jsonResponse(
      { error: "You do not have permission to invite members to this organization" },
      403,
    );
  }

  // From here on we may use the privileged service-role client, because we have
  // proven the caller owns the target organization.
  const serviceClient = createServiceClient();

  // --- Step 4: duplicate pre-check (Req 7.5) ---------------------------------
  // Friendly 409 before we attempt the insert. The UNIQUE(organization_id,
  // email) constraint below is the authoritative guard for the race the
  // pre-check cannot win.
  const { data: existingMember, error: duplicateError } = await serviceClient
    .from("organization_members")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("email", email)
    .maybeSingle();

  if (duplicateError) {
    return jsonResponse({ error: "Failed to check existing members" }, 500);
  }
  if (existingMember) {
    return jsonResponse(
      { error: "This email has already been invited to this organization" },
      409,
    );
  }

  // --- Step 5: privileged insert with status='invited' (Req 7.1, 7.7) --------
  // status/role/invited_at all default at the DB layer; we set status
  // explicitly to make the invitation intent unmistakable at the call site.
  const { data: member, error: insertError } = await serviceClient
    .from("organization_members")
    .insert({
      organization_id: organizationId,
      email,
      status: "invited",
    })
    .select()
    .single();

  if (insertError) {
    // The UNIQUE(organization_id, email) constraint is the ultimate duplicate
    // guard and catches races the pre-check missed -> 409 (Req 7.5, 10.7).
    if (insertError.code === PG_UNIQUE_VIOLATION) {
      return jsonResponse(
        { error: "This email has already been invited to this organization" },
        409,
      );
    }
    return jsonResponse({ error: "Failed to create invitation" }, 500);
  }

  // ===========================================================================
  // EMAIL SEND INTEGRATION POINT (Req 7.7)
  // ---------------------------------------------------------------------------
  // The invitation row now exists. This is the single, identifiable place where
  // a transactional invitation email would be dispatched (e.g. Resend /
  // SendGrid / Postmark) — typically using a provider API key read from
  // `Deno.env`, sending to `member.email` with a link to the accept-invite flow.
  //
  // It is intentionally a no-op today: adding delivery here does not change the
  // invitation data model or this function's response contract. A failure to
  // send should be handled as a non-fatal, retryable concern (the invitation
  // already persisted), so it must NOT turn a successful insert into an error
  // response.
  //
  //   await sendInvitationEmail({ to: member.email, organizationId });
  //
  // ===========================================================================

  // --- Step 6: success (Req 7.1) ---------------------------------------------
  return jsonResponse({ member }, 201);
});
