import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/test/fakeSupabase";
import { applyStoreEvent, planForProduct } from "./storeSubscriptions";

const USER = "0f8fad5b-d9cb-469f-a165-70867728950e";

describe("store subscriptions", () => {
  it("activates, marks billing issues and expires store subscriptions", async () => {
    const world = fakeSupabase({ subscriptions: [{ user_id: USER, status: "trial", source: "stripe" }] });
    expect(await applyStoreEvent(world.db, { type: "INITIAL_PURCHASE", app_user_id: USER, product_id: "verso_yearly", store: "APP_STORE", expiration_at_ms: 1_900_000_000_000 })).toBe("applied");
    expect(world.tables.subscriptions[0]).toMatchObject({ status: "active", plan: "yearly", source: "app_store" });
    await applyStoreEvent(world.db, { type: "CANCELLATION", app_user_id: USER });
    expect(world.tables.subscriptions[0].status).toBe("active");
    await applyStoreEvent(world.db, { type: "BILLING_ISSUE", app_user_id: USER, store: "APP_STORE" });
    expect(world.tables.subscriptions[0].status).toBe("past_due");
    await applyStoreEvent(world.db, { type: "EXPIRATION", app_user_id: USER, store: "APP_STORE" });
    expect(world.tables.subscriptions[0].status).toBe("canceled");
  });

  it("never ends an active web subscription and ignores anonymous buyers", async () => {
    const world = fakeSupabase({ subscriptions: [{ user_id: USER, status: "active", source: "stripe", plan: "monthly" }] });
    expect(await applyStoreEvent(world.db, { type: "EXPIRATION", app_user_id: USER, store: "PLAY_STORE" })).toBe("ignored");
    expect(world.tables.subscriptions[0]).toMatchObject({ status: "active", source: "stripe" });
    expect(await applyStoreEvent(world.db, { type: "INITIAL_PURCHASE", app_user_id: "$RCAnonymousID:abc" })).toBe("ignored");
  });

  it("maps products to plans", () => {
    expect(planForProduct("verso_family_monthly")).toBe("family");
    expect(planForProduct("verso.annual")).toBe("yearly");
    expect(planForProduct("verso_monthly")).toBe("monthly");
  });
});

describe("store webhook route", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("requires the shared secret", async () => {
    vi.stubEnv("REVENUECAT_WEBHOOK_SECRET", "s3cret");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    const { POST } = await import("@/app/api/billing/store/route");
    const call = (auth?: string) =>
      POST(new Request("http://verso.test/api/billing/store", { method: "POST", headers: auth ? { authorization: auth } : {}, body: "{}" }));
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong!")).status).toBe(401);
    expect((await call("Bearer s3cret")).status).toBe(400);
  });
});
