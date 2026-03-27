-- Seed: Register the Donny Chrome Extension as an OAuth client.
--
-- IMPORTANT: Replace EXTENSION_ID_PLACEHOLDER with the real Chrome
-- Extension ID after publishing to the Chrome Web Store.
--
-- Safe to run multiple times (uses ON CONFLICT DO NOTHING).

INSERT INTO donny_oauth_clients (
  client_id,
  client_name,
  client_secret_hash,
  redirect_uris,
  scopes
) VALUES (
  'donny-chrome-ext-v1',
  'Donny Chrome Extension',
  NULL,  -- public client, PKCE-only
  ARRAY['chrome-extension://EXTENSION_ID_PLACEHOLDER/callback.html'],
  ARRAY['donny:chat','campaigns:read','campaigns:write','creators:read','analytics:read','messages:read','messages:write','profile:read']
) ON CONFLICT (client_id) DO NOTHING;
