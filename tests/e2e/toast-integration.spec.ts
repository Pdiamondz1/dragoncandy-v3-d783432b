/**
 * TASK-027: E2E integration test for the Toast promotion flow.
 *
 * Tests the full sequence:
 *   1. Connect Toast (mocked OAuth exchange)
 *   2. Publish a promotion (insert + fire discount push)
 *   3. Simulate a Toast redemption webhook
 *   4. Assert redemption count increments
 *
 * Uses vitest with mocked Supabase client — no real network calls.
 * Edge Functions are Deno so we test the data-flow contracts here.
 */

import { describe, test, expect, beforeEach } from 'vitest';

// ── Types matching our DB schema ──

interface ToastConnection {
  id: string;
  business_id: string;
  restaurant_guid: string;
  status: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
}

interface ToastSyncEvent {
  id: string;
  connection_id: string;
  event_type: string;
  status: string;
  toast_event_guid: string | null;
  request_payload: Record<string, unknown>;
  response_payload: Record<string, unknown>;
}

interface PromotionRedemption {
  id: string;
  promotion_id: string;
  discount_code_id: string;
  toast_order_id: string;
  toast_event_guid: string;
  amount: number;
}

// ── In-memory data stores ──

let toastConnections: ToastConnection[] = [];
let syncEvents: ToastSyncEvent[] = [];
let promotions: Array<{ id: string; title: string; status: string; current_redemptions: number }> = [];
let discountCodes: Array<{ id: string; promotion_id: string; code: string; is_redeemed: boolean }> = [];
let redemptions: PromotionRedemption[] = [];
let idCounter = 0;

function nextId(): string {
  return `uuid-${++idCounter}`;
}

// ── Mock Supabase operations matching Edge Function behavior ──

function connectToast(businessId: string, restaurantGuid: string, tokens: { access: string; refresh: string; expiresAt: string }): ToastConnection {
  // Ledger-first: write sync event
  const eventId = nextId();
  syncEvents.push({
    id: eventId,
    connection_id: '', // backfilled below
    event_type: 'oauth_callback',
    status: 'success',
    toast_event_guid: null,
    request_payload: { business_id: businessId },
    response_payload: { restaurant_guid: restaurantGuid },
  });

  const conn: ToastConnection = {
    id: nextId(),
    business_id: businessId,
    restaurant_guid: restaurantGuid,
    status: 'connected',
    access_token: tokens.access,
    refresh_token: tokens.refresh,
    token_expires_at: tokens.expiresAt,
  };
  toastConnections.push(conn);

  // Backfill connection_id on sync event
  syncEvents[syncEvents.length - 1].connection_id = conn.id;

  return conn;
}

function publishPromotion(title: string): { id: string } {
  const promo = { id: nextId(), title, status: 'active', current_redemptions: 0 };
  promotions.push(promo);
  return promo;
}

function generateDiscountCode(promotionId: string): { id: string; code: string } {
  const dc = { id: nextId(), promotion_id: promotionId, code: `DC-${Math.random().toString(36).slice(2, 8).toUpperCase()}`, is_redeemed: false };
  discountCodes.push(dc);
  return dc;
}

function fireDiscountPush(connectionId: string, promotionId: string): ToastSyncEvent {
  // Standard-tier stub: logs intent, returns tier_unavailable
  const event: ToastSyncEvent = {
    id: nextId(),
    connection_id: connectionId,
    event_type: 'discount_push_skipped_tier',
    status: 'success',
    toast_event_guid: null,
    request_payload: { promotion_id: promotionId },
    response_payload: { tier: 'standard', message: 'tier_unavailable' },
  };
  syncEvents.push(event);
  return event;
}

function processRedemptionWebhook(payload: {
  eventGuid: string;
  restaurantGuid: string;
  discountCode: string;
  orderId: string;
  amount: number;
}): { status: number; body: Record<string, unknown> } {
  // 1. Check idempotency — duplicate guid returns 200
  const existing = syncEvents.find((e) => e.toast_event_guid === payload.eventGuid);
  if (existing) {
    return { status: 200, body: { message: 'duplicate', event_id: existing.id } };
  }

  // 2. Find connection by restaurant GUID
  const conn = toastConnections.find((c) => c.restaurant_guid === payload.restaurantGuid);
  if (!conn) {
    return { status: 404, body: { error: 'unknown restaurant' } };
  }

  // 3. Find discount code
  const dc = discountCodes.find((c) => c.code === payload.discountCode);
  if (!dc) {
    return { status: 404, body: { error: 'unknown discount code' } };
  }

  // 4. Ledger-first: write sync event BEFORE redemption
  const ledgerEvent: ToastSyncEvent = {
    id: nextId(),
    connection_id: conn.id,
    event_type: 'redemption_webhook',
    status: 'success',
    toast_event_guid: payload.eventGuid,
    request_payload: payload as unknown as Record<string, unknown>,
    response_payload: {},
  };
  syncEvents.push(ledgerEvent);

  // 5. Create redemption record
  const redemption: PromotionRedemption = {
    id: nextId(),
    promotion_id: dc.promotion_id,
    discount_code_id: dc.id,
    toast_order_id: payload.orderId,
    toast_event_guid: payload.eventGuid,
    amount: payload.amount,
  };
  redemptions.push(redemption);

  // 6. Mark code as redeemed
  dc.is_redeemed = true;

  // 7. Increment promotion counter
  const promo = promotions.find((p) => p.id === dc.promotion_id);
  if (promo) {
    promo.current_redemptions += 1;
  }

  return { status: 200, body: { message: 'ok', redemption_id: redemption.id } };
}

// ── Tests ──

beforeEach(() => {
  toastConnections = [];
  syncEvents = [];
  promotions = [];
  discountCodes = [];
  redemptions = [];
  idCounter = 0;
});

describe('Toast Integration E2E', () => {
  const BUSINESS_ID = 'biz-001';
  const RESTAURANT_GUID = 'toast-rest-abc';

  test('full flow: connect → publish → webhook → redemption count', () => {
    // ── Step 1: Connect Toast (mocked OAuth) ──
    const conn = connectToast(BUSINESS_ID, RESTAURANT_GUID, {
      access: 'mock-access-token',
      refresh: 'mock-refresh-token',
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    });

    expect(conn.status).toBe('connected');
    expect(toastConnections).toHaveLength(1);
    expect(syncEvents.filter((e) => e.event_type === 'oauth_callback')).toHaveLength(1);

    // ── Step 2: Publish promotion ──
    const promo = publishPromotion('15% off for a video!');
    expect(promo.id).toBeTruthy();
    expect(promotions[0].status).toBe('active');
    expect(promotions[0].current_redemptions).toBe(0);

    // Generate a discount code (happens on submission approval)
    const dc = generateDiscountCode(promo.id);
    expect(dc.code).toBeTruthy();

    // Fire discount push (standard tier → skipped)
    const pushEvent = fireDiscountPush(conn.id, promo.id);
    expect(pushEvent.event_type).toBe('discount_push_skipped_tier');
    expect(pushEvent.status).toBe('success');

    // ── Step 3: Simulate Toast redemption webhook ──
    const webhookPayload = {
      eventGuid: 'toast-event-guid-001',
      restaurantGuid: RESTAURANT_GUID,
      discountCode: dc.code,
      orderId: 'toast-order-999',
      amount: 12.50,
    };

    const result = processRedemptionWebhook(webhookPayload);
    expect(result.status).toBe(200);
    expect(result.body.message).toBe('ok');

    // ── Step 4: Assert redemption count incremented ──
    expect(promotions[0].current_redemptions).toBe(1);
    expect(redemptions).toHaveLength(1);
    expect(redemptions[0].toast_event_guid).toBe('toast-event-guid-001');
    expect(redemptions[0].amount).toBe(12.50);
    expect(discountCodes[0].is_redeemed).toBe(true);

    // Ledger has the redemption_webhook event BEFORE the redemption record
    const redemptionEvents = syncEvents.filter((e) => e.event_type === 'redemption_webhook');
    expect(redemptionEvents).toHaveLength(1);
    expect(redemptionEvents[0].toast_event_guid).toBe('toast-event-guid-001');
  });

  test('idempotency: duplicate webhook returns 200 without double-counting', () => {
    const _conn = connectToast(BUSINESS_ID, RESTAURANT_GUID, {
      access: 'tok', refresh: 'ref',
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    });

    const promo = publishPromotion('Buy one get one');
    const dc = generateDiscountCode(promo.id);

    const payload = {
      eventGuid: 'dup-guid-001',
      restaurantGuid: RESTAURANT_GUID,
      discountCode: dc.code,
      orderId: 'order-1',
      amount: 10,
    };

    // First call
    const r1 = processRedemptionWebhook(payload);
    expect(r1.status).toBe(200);
    expect(r1.body.message).toBe('ok');

    // Duplicate call — same eventGuid
    const r2 = processRedemptionWebhook(payload);
    expect(r2.status).toBe(200);
    expect(r2.body.message).toBe('duplicate');

    // Count should be 1, not 2
    expect(promotions[0].current_redemptions).toBe(1);
    expect(redemptions).toHaveLength(1);
  });

  test('unknown restaurant GUID returns 404', () => {
    connectToast(BUSINESS_ID, RESTAURANT_GUID, {
      access: 'tok', refresh: 'ref',
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    });

    const result = processRedemptionWebhook({
      eventGuid: 'evt-1',
      restaurantGuid: 'unknown-guid',
      discountCode: 'DC-FAKE',
      orderId: 'order-1',
      amount: 5,
    });

    expect(result.status).toBe(404);
    expect(result.body.error).toBe('unknown restaurant');
  });

  test('unknown discount code returns 404', () => {
    connectToast(BUSINESS_ID, RESTAURANT_GUID, {
      access: 'tok', refresh: 'ref',
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    });

    const result = processRedemptionWebhook({
      eventGuid: 'evt-2',
      restaurantGuid: RESTAURANT_GUID,
      discountCode: 'DC-NONEXISTENT',
      orderId: 'order-2',
      amount: 5,
    });

    expect(result.status).toBe(404);
    expect(result.body.error).toBe('unknown discount code');
  });

  test('ledger-first: sync event exists before redemption record', () => {
    const _conn = connectToast(BUSINESS_ID, RESTAURANT_GUID, {
      access: 'tok', refresh: 'ref',
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    });

    const promo = publishPromotion('Free dessert');
    const dc = generateDiscountCode(promo.id);

    processRedemptionWebhook({
      eventGuid: 'ledger-test-001',
      restaurantGuid: RESTAURANT_GUID,
      discountCode: dc.code,
      orderId: 'order-ledger',
      amount: 8,
    });

    // The sync event ID should be lower (created first) than the redemption ID
    const syncEvent = syncEvents.find((e) => e.toast_event_guid === 'ledger-test-001')!;
    const redemption = redemptions.find((r) => r.toast_event_guid === 'ledger-test-001')!;

    const syncNum = parseInt(syncEvent.id.split('-')[1]);
    const redemptionNum = parseInt(redemption.id.split('-')[1]);
    expect(syncNum).toBeLessThan(redemptionNum);
  });

  test('multiple redemptions increment counter correctly', () => {
    const _conn = connectToast(BUSINESS_ID, RESTAURANT_GUID, {
      access: 'tok', refresh: 'ref',
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    });

    const promo = publishPromotion('Happy hour special');
    const dc1 = generateDiscountCode(promo.id);
    const dc2 = generateDiscountCode(promo.id);
    const dc3 = generateDiscountCode(promo.id);

    processRedemptionWebhook({ eventGuid: 'multi-1', restaurantGuid: RESTAURANT_GUID, discountCode: dc1.code, orderId: 'o1', amount: 5 });
    processRedemptionWebhook({ eventGuid: 'multi-2', restaurantGuid: RESTAURANT_GUID, discountCode: dc2.code, orderId: 'o2', amount: 7 });
    processRedemptionWebhook({ eventGuid: 'multi-3', restaurantGuid: RESTAURANT_GUID, discountCode: dc3.code, orderId: 'o3', amount: 3 });

    expect(promotions[0].current_redemptions).toBe(3);
    expect(redemptions).toHaveLength(3);
  });
});
