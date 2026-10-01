// Where the mobile app finds its services. Set these in mobile/.env (see
// .env.example); Expo inlines EXPO_PUBLIC_* values into the app at build time.

/** The Verso web app, which serves the AI, rooms, artists and billing APIs, e.g. https://verso.app */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
/** RevenueCat public SDK keys for App Store and Google Play subscriptions. */
export const REVENUECAT_IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? "";
export const REVENUECAT_ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? "";
