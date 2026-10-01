import { Platform } from "react-native";
import Purchases, { type PurchasesPackage } from "react-native-purchases";
import { REVENUECAT_ANDROID_KEY, REVENUECAT_IOS_KEY } from "./config";

// App Store and Google Play subscriptions through RevenueCat. The buyer is
// identified by their Verso user id, so the server webhook
// (/api/billing/store) can unlock the same account on the web too.
// Needs a development or store build (not Expo Go) and the RevenueCat keys.

export type StorePlan = { id: string; title: string; price: string; pkg: PurchasesPackage };

let configuredFor: string | null | undefined;

function apiKey(): string {
  return Platform.OS === "ios" ? REVENUECAT_IOS_KEY : Platform.OS === "android" ? REVENUECAT_ANDROID_KEY : "";
}

export function storePurchasesAvailable(): boolean {
  return Boolean(apiKey());
}

async function ready(userId: string): Promise<boolean> {
  if (!storePurchasesAvailable()) return false;
  if (configuredFor === undefined) Purchases.configure({ apiKey: apiKey(), appUserID: userId });
  else if (configuredFor !== userId) await Purchases.logIn(userId);
  configuredFor = userId;
  return true;
}

export async function storePlans(userId: string): Promise<StorePlan[]> {
  if (!(await ready(userId))) return [];
  const offerings = await Purchases.getOfferings();
  return (offerings.current?.availablePackages ?? []).map((pkg) => ({
    id: pkg.identifier,
    title: pkg.product.title,
    price: pkg.product.priceString,
    pkg,
  }));
}

/** Buys a plan; the webhook then marks the account active. False if cancelled or failed. */
export async function buyPlan(userId: string, plan: StorePlan): Promise<boolean> {
  if (!(await ready(userId))) return false;
  try {
    await Purchases.purchasePackage(plan.pkg);
    return true;
  } catch {
    return false;
  }
}

export async function restorePurchases(userId: string): Promise<void> {
  if (await ready(userId)) await Purchases.restorePurchases();
}
