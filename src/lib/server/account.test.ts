import { beforeEach, describe, expect, it, vi } from "vitest";

// A fake admin client: one subscription row, the artist's songs, and records of what was removed.
let subscription: {
  stripe_customer_id: string | null;
  status: string;
  source: string;
} | null = null;
let artistSongs: { id: string; audio_path: string | null }[] = [];
const removed: { songsOf?: string; files?: string[]; user?: string } = {};
let signedInUser: { id: string } | null = null;

const fakeDb = {
  from: (table: string) => ({
    select: () => ({
      eq: (_column: string, value: string) =>
        table === "subscriptions"
          ? { maybeSingle: async () => ({ data: subscription }) }
          : Promise.resolve({ data: value ? artistSongs : [] }),
    }),
    delete: () => ({
      eq: async (_column: string, value: string) => ((removed.songsOf = value), { error: null }),
    }),
  }),
  storage: {
    from: () => ({
      remove: async (files: string[]) => ((removed.files = files), { error: null }),
    }),
  },
  auth: {
    admin: {
      deleteUser: async (id: string) => ((removed.user = id), { error: null }),
    },
  },
};
const deletedCustomers: string[] = [];
const fakeStripe = {
  customers: {
    del: async (id: string) => (deletedCustomers.push(id), { deleted: true }),
  },
};

vi.mock("@/lib/server/supabaseAdmin", () => ({
  getSupabaseAdmin: () => fakeDb,
  userFromRequest: async () => signedInUser,
}));
vi.mock("@/lib/server/stripe", () => ({ getStripe: () => fakeStripe }));

const { deleteAccount } = await import("./account");
const { POST } = await import("@/app/api/account/delete/route");

beforeEach(() => {
  subscription = {
    stripe_customer_id: null,
    status: "trial",
    source: "stripe",
  };
  artistSongs = [];
  for (const key of Object.keys(removed)) delete removed[key as keyof typeof removed];
  deletedCustomers.length = 0;
  signedInUser = null;
});

describe("deleting an account", () => {
  it("deletes the auth user (their rows go with it by cascade)", async () => {
    const result = await deleteAccount(fakeDb as never, fakeStripe as never, "u1");
    expect(result).toEqual({ ok: true, storeSubscription: false });
    expect(removed.user).toBe("u1");
    expect(deletedCustomers).toEqual([]);
  });

  it("deletes the Stripe customer so a web subscription stops billing", async () => {
    subscription = {
      stripe_customer_id: "cus_123",
      status: "active",
      source: "stripe",
    };
    await deleteAccount(fakeDb as never, fakeStripe as never, "u1");
    expect(deletedCustomers).toEqual(["cus_123"]);
  });

  it("refuses when a Stripe customer exists but Stripe is not configured", async () => {
    subscription = {
      stripe_customer_id: "cus_123",
      status: "active",
      source: "stripe",
    };
    expect(await deleteAccount(fakeDb as never, null, "u1")).toEqual({
      ok: false,
      error: "billing_unavailable",
    });
    expect(removed.user).toBeUndefined();
  });

  it("removes the artist's songs and only their own audio files", async () => {
    artistSongs = [
      { id: "s1", audio_path: "u1/a.mp3" },
      { id: "s2", audio_path: "someone-else/b.mp3" },
      { id: "s3", audio_path: null },
    ];
    await deleteAccount(fakeDb as never, fakeStripe as never, "u1");
    expect(removed.songsOf).toBe("u1");
    expect(removed.files).toEqual(["u1/a.mp3"]);
  });

  it("reminds about an active App Store subscription", async () => {
    subscription = {
      stripe_customer_id: null,
      status: "active",
      source: "app_store",
    };
    expect(await deleteAccount(fakeDb as never, fakeStripe as never, "u1")).toEqual({ ok: true, storeSubscription: true });
  });

  it("the endpoint needs a signed-in learner", async () => {
    const response = await POST(new Request("http://verso.test/api/account/delete", { method: "POST" }));
    expect(response.status).toBe(401);
    expect(removed.user).toBeUndefined();

    signedInUser = { id: "u9" };
    const ok = await POST(new Request("http://verso.test/api/account/delete", { method: "POST" }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({
      deleted: true,
      storeSubscription: false,
    });
    expect(removed.user).toBe("u9");
  });
});
