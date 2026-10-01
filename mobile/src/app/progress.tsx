import { LANGUAGE_NAMES, format, type UiLanguage } from "@shared/lib/i18n";
import { dayKey, streak } from "@shared/lib/progress";
import { isKnown } from "@shared/lib/srs";
import { accuracy, dueForecast, lastDays, minutesPerDay } from "@shared/lib/statsMath";
import { useState } from "react";
import { Pressable, StyleSheet, Text, useColorScheme, View } from "react-native";
import { Body, Card, Screen } from "../components/ui";
import { isPremium, useAccess } from "../lib/access";
import { activityStore, knownStore, listeningStore, reviewLogStore, reviewsStore, savedWordsStore } from "../lib/learner";
import { useSongs } from "../lib/songs";
import { usePreferences } from "../lib/usePreferences";

/** Progress: tiles for everyone, charts for subscribers (same numbers as the web app). */
export default function Progress() {
  const { t, lang, colors } = usePreferences();
  const [now] = useState(() => new Date());
  const premium = isPremium(useAccess());
  const chart = useChartColor();
  const saved = savedWordsStore.useValue();
  const known = knownStore.useValue();
  const reviews = reviewsStore.useValue();
  const listening = listeningStore.useValue();
  const log = reviewLogStore.useValue();
  const days = activityStore.useValue();
  const songs = useSongs();
  const month = lastDays(30, now);
  const fortnight = lastDays(14, now);
  const knownCount = new Set([...known, ...Object.keys(reviews).filter((id) => isKnown(reviews[id]))]).size;
  const correct = accuracy(log, month);
  const upcoming = Array.from({ length: 7 }, (_, i) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + i));
  const weekday = (date: Date, style: "narrow" | "long") => new Intl.DateTimeFormat(lang, style === "narrow" ? { weekday: "narrow" } : { weekday: "long", day: "numeric", month: "short" }).format(date);
  const dateOf = (day: string) => {
    const [y, m, d] = day.split("-").map(Number);
    return new Date(y, m - 1, d);
  };

  const languageOf = new Map(songs.map((s) => [s.id, s.language]));
  const byLanguage = new Map<UiLanguage, number>();
  for (const word of saved) {
    const language = languageOf.get(word.songId);
    if (language) byLanguage.set(language, (byLanguage.get(language) ?? 0) + 1);
  }
  const languages = [...byLanguage.entries()].sort((a, b) => b[1] - a[1]);
  const most = Math.max(1, ...languages.map(([, n]) => n));

  const tiles = [
    [t.stats.streak, `${streak(days, dayKey(now))}`],
    [t.stats.saved, `${saved.length}`],
    [t.stats.known, `${knownCount}`],
    [t.stats.minutes, `${minutesPerDay(listening, month).reduce((a, b) => a + b, 0)}`],
    [t.stats.accuracy, correct === null ? t.stats.none : `${correct}%`],
  ];

  return (
    <Screen>
      <View style={styles.tiles}>
        {tiles.map(([label, value]) => (
          <Card key={label} style={styles.tile}>
            <Text style={{ color: colors.muted }}>{label}</Text>
            <Text style={[styles.tileValue, { color: colors.text }]}>{value}</Text>
          </Card>
        ))}
      </View>
      {!premium ? (
        <Card>
          <Body muted>🔒 {t.stats.premium}</Body>
        </Card>
      ) : (
        <>
          <Columns
            title={t.stats.listening}
            values={minutesPerDay(listening, fortnight)}
            labels={fortnight.map((d) => weekday(dateOf(d), "narrow"))}
            fullLabels={fortnight.map((d, i) => (i === fortnight.length - 1 ? t.stats.today : weekday(dateOf(d), "long")))}
            format={(n) => format(t.stats.min, { n })}
          />
          <Columns
            title={t.stats.due}
            values={dueForecast(reviews, now)}
            labels={upcoming.map((d) => weekday(d, "narrow"))}
            fullLabels={upcoming.map((d, i) => (i === 0 ? t.stats.today : weekday(d, "long")))}
            format={(n) => format(t.stats.words, { n })}
          />
          {languages.length > 0 ? (
            <Card>
              <Text style={[styles.chartTitle, { color: colors.text }]}>{t.stats.byLanguage}</Text>
              {languages.map(([language, count]) => (
                <View key={language} style={styles.langRow} accessibilityLabel={`${LANGUAGE_NAMES[language]}: ${count}`}>
                  <Text style={{ color: colors.text, width: 96 }}>{LANGUAGE_NAMES[language]}</Text>
                  <View style={{ flex: 1 }}>
                    <View style={{ width: `${(count / most) * 100}%`, height: 12, borderTopRightRadius: 4, borderBottomRightRadius: 4, backgroundColor: chart }} />
                  </View>
                  <Text style={{ color: colors.text }}>{count}</Text>
                </View>
              ))}
            </Card>
          ) : null}
        </>
      )}
    </Screen>
  );
}

/** Chart mark color, validated against the surface in each theme (same as the web --chart token). */
function useChartColor() {
  return useColorScheme() === "dark" ? "#8f73ff" : "#6d4aff";
}

/** Single-series columns: the tallest labeled, tap a column for its value. */
function Columns({ title, values, labels, fullLabels, format }: { title: string; values: number[]; labels: string[]; fullLabels: string[]; format: (n: number) => string }) {
  const { colors } = usePreferences();
  const chart = useChartColor();
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...values);
  const top = values.indexOf(Math.max(...values));
  const labelEvery = values.length > 10 ? Math.ceil(values.length / 7) : 1;
  return (
    <Card>
      <Text style={[styles.chartTitle, { color: colors.text }]}>{title}</Text>
      <Text style={{ color: colors.muted, minHeight: 20 }}>{active !== null ? `${fullLabels[active]}: ${format(values[active])}` : " "}</Text>
      <View style={[styles.plot, { borderColor: colors.border }]}>
        {values.map((value, i) => (
          <Pressable key={i} accessibilityRole="button" accessibilityLabel={`${fullLabels[i]}: ${format(value)}`} onPress={() => setActive(active === i ? null : i)} style={styles.band}>
            {i === top && value > 0 ? <Text style={[styles.valueLabel, { color: colors.text }]}>{format(value)}</Text> : null}
            <View style={[styles.column, { height: `${(value / max) * 80}%`, backgroundColor: chart, opacity: active === null || active === i ? 1 : 0.55 }]} />
          </Pressable>
        ))}
      </View>
      <View style={styles.labels}>
        {labels.map((label, i) => (
          <Text key={i} style={[styles.axis, { color: colors.muted }]}>
            {i % labelEvery === 0 || i === labels.length - 1 ? label : ""}
          </Text>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: { width: "47%", flexGrow: 1 },
  tileValue: { fontSize: 30, fontWeight: "700" },
  chartTitle: { fontSize: 16, fontWeight: "700" },
  plot: { height: 140, flexDirection: "row", alignItems: "flex-end", borderBottomWidth: 1 },
  band: { flex: 1, height: "100%", alignItems: "center", justifyContent: "flex-end" },
  column: { width: "62%", maxWidth: 24, borderTopLeftRadius: 4, borderTopRightRadius: 4, minHeight: 0 },
  valueLabel: { fontSize: 11, fontWeight: "700", marginBottom: 2 },
  labels: { flexDirection: "row" },
  axis: { flex: 1, textAlign: "center", fontSize: 11 },
  langRow: { flexDirection: "row", alignItems: "center", gap: 8 },
});
