import type { AiTask } from "@shared/lib/ai/schemas";
import { ActivityIndicator, Text, View } from "react-native";
import type { AiState } from "../lib/ai";
import { usePreferences } from "../lib/usePreferences";

/** Loading and error line shared by every AI feature. */
export function AiNotice<T extends AiTask>({ state }: { state: AiState<T> }) {
  const { t, colors } = usePreferences();
  if (state.status === "loading") {
    return (
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <ActivityIndicator color={colors.accent} />
        <Text style={{ color: colors.muted }}>✨ {t.ai.loading}</Text>
      </View>
    );
  }
  if (state.status !== "error") return null;
  const message = state.reason === "not_configured" ? t.ai.unavailable : state.reason === "declined" ? t.ai.declined : t.ai.failed;
  return <Text style={{ color: colors.muted }}>{message}</Text>;
}
