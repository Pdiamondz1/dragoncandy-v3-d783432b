// google-workspace-proxy (GW PR 1: auth_url / oauth_callback / status / disconnect)
// The single audited gateway between AIOS and Google. Tokens never leave this
// backend: clients receive consent URLs, status objects, file metadata, and
// links — never an access or refresh token.
//
// Auth model:
//  - User mode: Supabase session JWT → server-side user_roles check
//    (admin|stakeholder), all actions act on the CALLER's own connection.
//  - Service mode (later PRs): exact SUPABASE_SERVICE_ROLE_KEY bearer; used
//    only by scheduled agents for the designated-export actions.
// Spec: docs/superpowers/specs/2026-06-11-google-workspace-connections-design.md §3.B

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  GoogleWorkspaceError,
  assertDriveFileId,
  assertFileKind,
  assertFileName,
  buildAuthUrl,
  createGoogleFile,
  driveCtx,
  exchangeCode,
  exportMarkdownToDoc,
  findOrCreateDcFolder,
  getValidAccessToken,
  initResumableUpload,
  listDcFiles,
  parseIdToken,
  redirectUriFor,
  renameDriveFile,
  revokeToken,
  signState,
  trashDriveFile,
  verifyState,
  GOOGLE_SCOPES,
} from "../_shared/google-workspace.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });

  try {
    // --- Auth: internal user via Supabase session ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "unauthorized" }, 401);

    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await supabaseUser.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    const isInternal = (roles ?? []).some((r: { role: string }) =>
      ["admin", "stakeholder"].includes(r.role as string)
    );
    if (!isInternal) return json({ error: "forbidden: internal access required" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

    switch (action) {
      case "auth_url": {
        const host = typeof body.host === "string" ? body.host : "";
        const redirectUri = redirectUriFor(host);
        const state = await signState({
          user_id: user.id,
          host,
          nonce: crypto.randomUUID(),
          iat: Date.now(),
        });
        return json({ url: buildAuthUrl(state, redirectUri) });
      }

      case "oauth_callback": {
        const { code, state } = body;
        if (typeof code !== "string" || typeof state !== "string") {
          return json({ error: "code and state are required" }, 400);
        }
        const verified = await verifyState(state, user.id);
        const tokens = await exchangeCode(code, redirectUriFor(verified.host));
        if (!tokens.refresh_token) {
          return json({ error: "Google did not return a refresh token — retry the connect flow" }, 400);
        }

        const identity = parseIdToken(tokens.id_token ?? "");
        if (!identity.email) {
          // Never leave a granted-but-unstored token live at Google.
          await revokeToken(tokens.refresh_token);
          return json({ error: "Google identity missing from token response" }, 400);
        }

        // Workspace-day domain restriction (spec §2.1): when set, only
        // accounts on the DragonCandy Workspace domain may connect. The `hd`
        // claim is the ONLY acceptable evidence — Google documents that email
        // domains must not be used as org-membership proof, and `hd` is absent
        // for non-Workspace accounts.
        const allowedDomain = Deno.env.get("GOOGLE_ALLOWED_DOMAIN");
        if (allowedDomain && identity.hd?.toLowerCase() !== allowedDomain.toLowerCase()) {
          const outcome = await revokeToken(tokens.refresh_token);
          if (outcome === "failed") {
            // Token isn't stored anywhere on our side; the grant lingers only
            // in the user's own Google permissions. Log loudly and still reject.
            console.error("[google-workspace-proxy] domain-reject revoke failed for", identity.email);
          }
          return json(
            { error: `Only ${allowedDomain} Google accounts can connect to the DragonCandy Workspace` },
            403
          );
        }

        const dcFolderId = await findOrCreateDcFolder(tokens.access_token);

        const { error: upsertError } = await supabaseAdmin
          .from("google_workspace_accounts")
          .upsert(
            {
              user_id: user.id,
              google_email: identity.email,
              scopes: GOOGLE_SCOPES,
              refresh_token: tokens.refresh_token,
              access_token: tokens.access_token,
              access_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
              dc_folder_id: dcFolderId,
              status: "active",
            },
            { onConflict: "user_id" }
          );
        if (upsertError) throw upsertError;

        return json({ success: true, google_email: identity.email });
      }

      case "status": {
        const { data, error } = await supabaseAdmin
          .from("google_workspace_accounts")
          .select("google_email, scopes, status, connected_at")
          .eq("user_id", user.id)
          .maybeSingle();
        if (error) throw error;
        if (!data || data.status === "revoked") return json({ connected: false });
        return json({
          connected: data.status === "active",
          needs_reconnect: data.status === "needs_reconnect",
          google_email: data.google_email,
          scopes: data.scopes,
          connected_at: data.connected_at,
        });
      }

      case "disconnect": {
        const { data: account } = await supabaseAdmin
          .from("google_workspace_accounts")
          .select("id, refresh_token")
          .eq("user_id", user.id)
          .maybeSingle();
        if (account) {
          // Delete our only refresh-token copy only when nothing live remains
          // at Google: confirmed revocation OR Google reports the token is
          // already invalid (400). Transient failures keep the row for retry.
          const outcome = await revokeToken(account.refresh_token);
          if (outcome === "failed") {
            return json(
              { error: "Google did not confirm the revocation — try disconnecting again", code: "revoke_failed" },
              502
            );
          }
          await supabaseAdmin.from("google_workspace_accounts").delete().eq("id", account.id);
        }
        return json({ success: true });
      }

      // --- Drive file hub (GW PR 2). Every action operates on the CALLER's
      // own connection; the drive.file scope further limits the token to
      // files this app created, so cross-file reach is impossible by design.
      case "list_files": {
        const { token, folderId } = await driveCtx(supabaseAdmin, user.id);
        return json({ files: await listDcFiles(token, folderId) });
      }

      case "create_file": {
        const mimeType = assertFileKind(body.kind);
        const name = assertFileName(body.name);
        const { token, folderId } = await driveCtx(supabaseAdmin, user.id);
        return json({ file: await createGoogleFile(token, folderId, mimeType, name) });
      }

      case "rename_file": {
        const fileId = assertDriveFileId(body.file_id);
        const name = assertFileName(body.name);
        const { token } = await getValidAccessToken(supabaseAdmin, user.id);
        return json({ file: await renameDriveFile(token, fileId, name) });
      }

      case "trash_file": {
        const fileId = assertDriveFileId(body.file_id);
        const { token } = await getValidAccessToken(supabaseAdmin, user.id);
        await trashDriveFile(token, fileId);
        return json({ success: true });
      }

      case "export_markdown_to_doc": {
        const title = assertFileName(body.title);
        const markdown = typeof body.markdown === "string" ? body.markdown.trim() : "";
        if (!markdown) return json({ error: "markdown is required", code: "bad_markdown" }, 400);
        if (markdown.length > 500_000) {
          return json({ error: "markdown too large to export", code: "bad_markdown" }, 400);
        }
        const docId = body.doc_id ? assertDriveFileId(body.doc_id) : undefined;
        const { token, folderId } = await driveCtx(supabaseAdmin, user.id);
        return json({ file: await exportMarkdownToDoc(token, folderId, title, markdown, docId) });
      }

      case "upload_init": {
        const name = assertFileName(body.name);
        const mimeType =
          typeof body.mime_type === "string" && body.mime_type
            ? body.mime_type
            : "application/octet-stream";
        const { token, folderId } = await driveCtx(supabaseAdmin, user.id);
        return json({ upload_url: await initResumableUpload(token, folderId, name, mimeType) });
      }

      default:
        return json({ error: `Unknown action "${action}"` }, 400);
    }
  } catch (err) {
    if (err instanceof GoogleWorkspaceError) {
      return json({ error: err.message, code: err.code }, err.status);
    }
    const message = err instanceof Error ? err.message : "internal error";
    console.error("[google-workspace-proxy]", message);
    return json({ error: message }, 500);
  }
});
