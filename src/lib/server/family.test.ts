import { describe, expect, it } from "vitest";
import { fakeSupabase } from "@/test/fakeSupabase";
import { familyInvite, joinFamily, newInviteCode } from "./family";

const OWNER = "owner";
function setup(plan = "family", status = "active") {
  return fakeSupabase({
    subscriptions: [
      { user_id: OWNER, status, plan },
      { user_id: "paying", status: "active", plan: "monthly" },
    ],
    family_invites: [],
    family_members: [],
  });
}

describe("family plans", () => {
  it("makes readable 8-character codes", () => {
    expect(newInviteCode()).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
  });

  it("gives an invite code only to family plan owners, and rotates it on request", async () => {
    expect(await familyInvite(setup("yearly").db, OWNER, false)).toEqual({ ok: false, error: "no_family_plan" });
    const world = setup();
    const first = await familyInvite(world.db, OWNER, false);
    const again = await familyInvite(world.db, OWNER, false);
    const rotated = await familyInvite(world.db, OWNER, true);
    expect(first.ok && again.ok && first.data.code === again.data.code).toBe(true);
    expect(rotated.ok && first.ok && rotated.data.code !== first.data.code).toBe(true);
    expect(world.tables.family_invites).toHaveLength(1);
  });

  it("adds up to 5 people with a valid code", async () => {
    const world = setup();
    const invite = await familyInvite(world.db, OWNER, false);
    const code = invite.ok ? invite.data.code : "";
    expect(await joinFamily(world.db, "kid", "WRONGCDE")).toEqual({ ok: false, error: "bad_code" });
    expect(await joinFamily(world.db, OWNER, code)).toEqual({ ok: false, error: "own_family" });
    expect(await joinFamily(world.db, "paying", code)).toEqual({ ok: false, error: "already_subscribed" });
    expect(await joinFamily(world.db, "kid", code.toLowerCase())).toEqual({ ok: true, data: { owner: OWNER } });
    expect(await joinFamily(world.db, "kid", code)).toEqual({ ok: false, error: "already_in_family" });
    for (const person of ["p2", "p3", "p4", "p5"]) expect(await joinFamily(world.db, person, code)).toMatchObject({ ok: true });
    expect(await joinFamily(world.db, "p6", code)).toEqual({ ok: false, error: "family_full" });
    expect(world.tables.family_members).toHaveLength(5);
  });

  it("stops joining when the owner's plan isn't active", async () => {
    const world = setup();
    const invite = await familyInvite(world.db, OWNER, false);
    world.tables.subscriptions[0].status = "past_due";
    expect(await joinFamily(world.db, "kid", invite.ok ? invite.data.code : "")).toEqual({ ok: false, error: "no_family_plan" });
  });
});
