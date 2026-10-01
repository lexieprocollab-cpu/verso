import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A fake Supabase admin client that records writes.
const writes: { table: string; op: string; values: unknown; match?: unknown }[] = [];
let signedInUser: { id: string; email?: string } | null = null;
const fakeAdmin = {
  from: (table: string) => ({
    upsert: async (values: unknown) => (writes.push({ table, op: "upsert", values }), { error: null }),
    insert: async (values: unknown) => (writes.push({ table, op: "insert", values }), { error: null }),
    update: (values: unknown) => ({
      eq: async (column: string, value: unknown) => (writes.push({ table, op: "update", values, match: { [column]: value } }), { error: null }),
    }),
  }),
};
let adminAvailable = true;
vi.mock("@/lib/server/supabaseAdmin", () => ({
  getSupabaseAdmin: () => (adminAvailable ? fakeAdmin : null),
  userFromRequest: async () => signedInUser,
}));

const { POST: webhook } = await import("@/app/api/billing/webhook/route");
const { POST: checkout } = await import("@/app/api/billing/checkout/route");
const { POST: events } = await import("@/app/api/events/route");

const SECRET = "whsec_test_secret";
const stripe = new Stripe("sk_test_dummy");

function signed(payload: object, secret = SECRET) {
  const body = JSON.stringify(payload);
  const header = stripe.webhooks.generateTestHeaderString({ payload: body, secret });
  return new Request("http://verso.test/api/billing/webhook", { method: "POST", headers: { "stripe-signature": header }, body });
}

beforeEach(() => {
  writes.length = 0;
  adminAvailable = true;
  signedInUser = null;
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", SECRET);
  vi.stubEnv("STRIPE_PRICE_ID", "price_test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
});
afterEach(() => vi.unstubAllEnvs());

describe("Stripe webhook", () => {
  it("activates the subscription after checkout", async () => {
    const response = await webhook(
      signed({
        id: "evt_1",
        object: "event",
        type: "checkout.session.completed",
        data: { object: { object: "checkout.session", mode: "subscription", client_reference_id: "user-1", customer: "cus_1" } },
      }),
    );
    expect(response.status).toBe(200);
    expect(writes).toEqual([
      { table: "subscriptions", op: "upsert", values: { user_id: "user-1", status: "active", stripe_customer_id: "cus_1", plan: "monthly", source: "stripe" } },
    ]);
  });

  it("follows subscription changes and cancellations", async () => {
    await webhook(
      signed({ id: "evt_2", object: "event", type: "customer.subscription.updated", data: { object: { object: "subscription", customer: "cus_1", status: "past_due" } } }),
    );
    await webhook(
      signed({ id: "evt_3", object: "event", type: "customer.subscription.deleted", data: { object: { object: "subscription", customer: "cus_1", status: "active" } } }),
    );
    expect(writes).toEqual([
      { table: "subscriptions", op: "update", values: { status: "past_due" }, match: { stripe_customer_id: "cus_1" } },
      { table: "subscriptions", op: "update", values: { status: "canceled" }, match: { stripe_customer_id: "cus_1" } },
    ]);
  });

  it("records the plan bought and plan changes made in the customer portal", async () => {
    vi.stubEnv("STRIPE_PRICE_ID_YEARLY", "price_yearly");
    await webhook(
      signed({
        id: "evt_5",
        object: "event",
        type: "checkout.session.completed",
        data: { object: { object: "checkout.session", mode: "subscription", client_reference_id: "user-2", customer: "cus_2", metadata: { plan: "family" } } },
      }),
    );
    await webhook(
      signed({
        id: "evt_6",
        object: "event",
        type: "customer.subscription.updated",
        data: { object: { object: "subscription", customer: "cus_2", status: "active", items: { data: [{ price: { id: "price_yearly" } }] } } },
      }),
    );
    expect(writes).toEqual([
      { table: "subscriptions", op: "upsert", values: { user_id: "user-2", status: "active", stripe_customer_id: "cus_2", plan: "family", source: "stripe" } },
      { table: "subscriptions", op: "update", values: { status: "active", plan: "yearly" }, match: { stripe_customer_id: "cus_2" } },
    ]);
  });

  it("rejects forged or unsigned requests", async () => {
    const forged = await webhook(signed({ id: "evt_4", object: "event", type: "checkout.session.completed", data: { object: {} } }, "whsec_wrong"));
    expect(forged.status).toBe(400);
    const unsigned = await webhook(new Request("http://verso.test/api/billing/webhook", { method: "POST", body: "{}" }));
    expect(unsigned.status).toBe(400);
    expect(writes).toEqual([]);
  });
});

describe("checkout", () => {
  it("needs billing to be configured", async () => {
    vi.stubEnv("STRIPE_PRICE_ID", "");
    expect((await checkout(new Request("http://verso.test/api/billing/checkout", { method: "POST" }))).status).toBe(503);
  });

  it("refuses plans that aren't offered", async () => {
    signedInUser = { id: "user-1", email: "a@b.c" };
    const ask = (plan: string) => checkout(new Request("http://verso.test/api/billing/checkout", { method: "POST", body: JSON.stringify({ plan }) }));
    expect((await ask("lifetime")).status).toBe(400);
  });

  it("needs a signed-in learner", async () => {
    expect((await checkout(new Request("http://verso.test/api/billing/checkout", { method: "POST" }))).status).toBe(401);
  });
});

describe("analytics events", () => {
  const event = {
    anonId: "0f8fad5b-d9cb-469f-a165-70867728950e",
    sessionId: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    name: "word_saved",
    props: { song: "down-to-the-sea" },
  };
  const post = (body: unknown) => events(new Request("http://verso.test/api/events", { method: "POST", body: JSON.stringify(body) }));

  it("stores valid events", async () => {
    expect((await post([event])).status).toBe(204);
    expect(writes[0]).toMatchObject({ table: "events", op: "insert" });
  });

  it("rejects unknown names and oversized batches", async () => {
    expect((await post([{ ...event, name: "hack" }])).status).toBe(400);
    expect((await post(Array.from({ length: 26 }, () => event))).status).toBe(400);
    expect((await post([{ ...event, anonId: "not-a-uuid" }])).status).toBe(400);
  });

  it("drops events quietly when analytics isn't connected", async () => {
    adminAvailable = false;
    expect((await post([event])).status).toBe(204);
    expect(writes).toEqual([]);
  });
});
