import { describe, it, expect, vi } from "vitest";
import { logWebToolCost } from "./cost-ledger.ts";

function mockAdmin() {
  const insert = vi.fn(async () => ({ error: null }));
  return { client: { from: () => ({ insert }) } as any, insert };
}

describe("logWebToolCost", () => {
  it("inserts a web_search row with the fixed cost and normalized user", async () => {
    const { client, insert } = mockAdmin();
    await logWebToolCost(client, { userId: "u1", kind: "web_search" });
    const row = insert.mock.calls[0][0];
    expect(row).toMatchObject({
      user_id: "u1", edge_function: "donny-chat", tier: "web_search",
      input_tokens: 0, output_tokens: 0,
    });
    expect(row.estimated_cost_usd).toBeGreaterThan(0);
  });

  it("normalizes the zero-UUID user to null and tags web_extract", async () => {
    const { client, insert } = mockAdmin();
    await logWebToolCost(client, { userId: "00000000-0000-0000-0000-000000000000", kind: "web_extract" });
    const row = insert.mock.calls[0][0];
    expect(row.user_id).toBeNull();
    expect(row.tier).toBe("web_extract");
  });

  it("never throws when the insert errors", async () => {
    const client = { from: () => ({ insert: async () => ({ error: { message: "boom" } }) }) } as any;
    await expect(logWebToolCost(client, { userId: "u", kind: "web_search" })).resolves.toBeUndefined();
  });
});
