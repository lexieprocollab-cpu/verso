import { Stack, router, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { onboardingStore, storesLoaded } from "../lib/learner";
import { usePreferences } from "../lib/usePreferences";

export default function Layout() {
  const { t, colors } = usePreferences();
  const onboarding = onboardingStore.useValue();
  const segments = useSegments();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void storesLoaded.then(() => setReady(true));
  }, []);

  // First launch: onboarding before anything else.
  useEffect(() => {
    if (ready && !onboarding.done && segments[0] !== "welcome") router.replace("/welcome");
  }, [ready, onboarding.done, segments]);

  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.accent,
          headerTitleStyle: { color: colors.text },
          contentStyle: { backgroundColor: colors.bg },
          headerBackTitle: " ",
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
        <Stack.Screen name="song/[id]" options={{ title: t.nav.player }} />
        <Stack.Screen name="quiz/[id]" options={{ title: t.quiz.title }} />
        <Stack.Screen name="review" options={{ title: t.practice.review }} />
        <Stack.Screen name="sentence" options={{ title: t.sentence.title }} />
        <Stack.Screen name="tutor" options={{ title: t.tutor.title }} />
        <Stack.Screen name="progress" options={{ title: t.stats.title }} />
        <Stack.Screen name="paywall" options={{ title: t.paywall.plan, presentation: "modal" }} />
        <Stack.Screen name="room/[id]" options={{ title: t.rooms.title }} />
        <Stack.Screen name="buddies" options={{ title: t.buddies.title }} />
        <Stack.Screen name="dm/[id]" options={{ title: t.buddies.conversations }} />
      </Stack>
    </>
  );
}
