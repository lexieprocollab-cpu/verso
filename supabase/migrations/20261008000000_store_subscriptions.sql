-- Subscriptions bought in the mobile app (App Store / Google Play, reported
-- through RevenueCat) share the subscriptions table with Stripe on the web.
alter table public.subscriptions
  add column source text not null default 'stripe' check (source in ('stripe', 'app_store', 'play_store')),
  add column store_expires_at timestamptz;
