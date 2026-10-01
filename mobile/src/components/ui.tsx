import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from "react-native";
import { usePreferences } from "../lib/usePreferences";

// Small building blocks so every screen shares spacing, colors and RTL.

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const { colors } = usePreferences();
  if (!scroll) return <View style={[styles.screen, { backgroundColor: colors.bg }]}>{children}</View>;
  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

export function Title({ children }: { children: ReactNode }) {
  const { colors, rtl } = usePreferences();
  return <Text style={[styles.title, { color: colors.text, textAlign: rtl ? "right" : "left" }]}>{children}</Text>;
}

export function Body({ children, muted, style }: { children: ReactNode; muted?: boolean; style?: StyleProp<TextStyle> }) {
  const { colors, rtl } = usePreferences();
  return <Text style={[styles.body, { color: muted ? colors.muted : colors.text, textAlign: rtl ? "right" : "left" }, style]}>{children}</Text>;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = usePreferences();
  return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>{children}</View>;
}

export function Button({
  label,
  onPress,
  kind = "primary",
  disabled,
  busy,
}: {
  label: string;
  onPress: () => void;
  kind?: "primary" | "secondary";
  disabled?: boolean;
  busy?: boolean;
}) {
  const { colors } = usePreferences();
  const primary = kind === "primary";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary ? { backgroundColor: colors.accent } : { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
        (disabled || pressed) && { opacity: disabled ? 0.45 : 0.8 },
      ]}
    >
      {busy ? <ActivityIndicator color={primary ? "#fff" : colors.accent} /> : <Text style={[styles.buttonText, { color: primary ? "#fff" : colors.text }]}>{label}</Text>}
    </Pressable>
  );
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  const { colors } = usePreferences();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(active) }}
      onPress={onPress}
      style={[styles.chip, { borderColor: active ? colors.accent : colors.border, backgroundColor: active ? colors.accentSoft : colors.surface }]}
    >
      <Text style={{ color: active ? colors.accent : colors.text, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { rtl } = usePreferences();
  return <View style={[styles.row, rtl && { flexDirection: "row-reverse" }, style]}>{children}</View>;
}

export function Field(props: TextInputProps) {
  const { colors } = usePreferences();
  return (
    <TextInput
      placeholderTextColor={colors.muted}
      {...props}
      style={[styles.field, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }, props.style]}
    />
  );
}

export function Notice({ children }: { children: ReactNode }) {
  const { colors } = usePreferences();
  return (
    <View style={[styles.notice, { backgroundColor: colors.accentSoft }]}>
      <Text style={{ color: colors.text }}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  title: { fontSize: 26, fontWeight: "800" },
  body: { fontSize: 16, lineHeight: 22 },
  card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 6 },
  button: { borderRadius: 14, paddingVertical: 13, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", minHeight: 48 },
  buttonText: { fontSize: 16, fontWeight: "700" },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  field: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  notice: { borderRadius: 12, padding: 12 },
});
