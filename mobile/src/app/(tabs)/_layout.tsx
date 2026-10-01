import Tabs from "expo-router/js-tabs";
import { Text, type ColorValue } from "react-native";
import { usePreferences } from "../../lib/usePreferences";

const icon = (glyph: string) =>
  function TabIcon({ color }: { color: ColorValue }) {
    return <Text style={{ fontSize: 20, color }}>{glyph}</Text>;
  };

export default function TabsLayout() {
  const { t, colors } = usePreferences();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        headerStyle: { backgroundColor: colors.bg },
        headerTitleStyle: { color: colors.text },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Verso", tabBarLabel: t.nav.catalog, tabBarIcon: icon("♫") }} />
      <Tabs.Screen name="words" options={{ title: t.nav.words, tabBarIcon: icon("♡") }} />
      <Tabs.Screen name="practice" options={{ title: t.nav.practice, tabBarIcon: icon("✎") }} />
      <Tabs.Screen name="rooms" options={{ title: t.nav.rooms, tabBarIcon: icon("💬") }} />
      <Tabs.Screen name="settings" options={{ title: t.settings, tabBarIcon: icon("⚙") }} />
    </Tabs>
  );
}
