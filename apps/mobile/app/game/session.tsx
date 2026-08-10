import { Audio } from "expo-av";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  DEFAULT_LEARN_LEVEL,
} from "@worldly/constants";
import { buildFullRegionLearningQueue } from "@worldly/core/learning";
import { buildLearnSession } from "@worldly/core/learn/sessionSequencer";
import { buildLearnStatPayload } from "@worldly/core/learn/emaIntegration";
import { selectLearnFact } from "@worldly/core/learn/factSelection";
import { normalizeName } from "@worldly/core/nameUtils";
import { FactModal } from "../../components/game/FactModal";
import { SessionMap } from "../../components/game/SessionMap";
import { Button } from "../../components/ui/Button";
import { Colors, Font, Radius, Spacing } from "../../constants/theme";
import { api } from "../../lib/api";
import { haptics } from "../../lib/haptics";
import {
  getCountriesFromCache,
  getSeenFactsForCountry,
  markFactSeen,
  recordPendingAnswer,
} from "../../lib/storage/db";
import { useSettingsStore } from "../../store/settingsStore";
import {
  getAndRegisterPushToken,
  requestPermissionIfAppropriate,
} from "../../lib/notifications/setup";

async function playSound(kind: "correct" | "incorrect") {
  if (!useSettingsStore.getState().soundEnabled) return;
  const source =
    kind === "correct"
      ? require("../../assets/audio/correct.wav")
      : require("../../assets/audio/incorrect.wav");
  const { sound } = await Audio.Sound.createAsync(source);
  await sound.playAsync();
  sound.setOnPlaybackStatusUpdate((status) => {
    if (!status.isLoaded || !status.didJustFinish) return;
    sound.unloadAsync();
  });
}

export default function GameSessionScreen() {
  const params = useLocalSearchParams<{
    mode?: string;
    region?: string;
    gameType?: string;
    level?: string;
    source?: string;
  }>();

  const mode = params.mode || "countries";
  const region = params.region || "world";
  const gameType = params.gameType || "learning";
  const level = params.level || DEFAULT_LEARN_LEVEL;

  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState<any[]>([]);
  const [index, setIndex] = useState(0);
  const [countriesById, setCountriesById] = useState<Map<string, any>>(
    new Map()
  );
  const [text, setText] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [wrongId, setWrongId] = useState<string | null>(null);
  const [fact, setFact] = useState<any>(null);
  const [startedAt, setStartedAt] = useState(Date.now());

  const current = questions[index];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [countries, mastery] = await Promise.all([
          getCountriesFromCache(),
          api.getAllMastery().catch(() => ({ mastery: { countries: [], capitals: [], flags: [] } })),
        ]);
        if (cancelled) return;

        const byId = new Map(countries.map((c) => [c.id || c.iso3, c]));
        setCountriesById(byId);

        const regionCountries =
          region === "world"
            ? countries
            : countries.filter((c) => c.region === region);

        const masteryRows = mastery.mastery?.[mode] || [];
        const masteryById = new Map(
          masteryRows
            .filter((r: any) => r.level === DEFAULT_LEARN_LEVEL)
            .map((r: any) => [r.countryId, r.masteryScore ?? 0])
        );

        if (gameType === "learning") {
          const queueIds = buildFullRegionLearningQueue(
            regionCountries.map((c) => c.id || c.iso3),
            masteryById
          );
          const queued = queueIds
            .map((id) => byId.get(id))
            .filter(Boolean)
            .slice(0, 12);
          const { questions: built } = buildLearnSession({
            countries: queued,
            category: mode,
            allCountries: countries,
            masteryStats: masteryRows,
          });
          setQuestions(built);
        } else {
          const shuffled = [...regionCountries].sort(() => Math.random() - 0.5);
          setQuestions(
            shuffled.slice(0, 15).map((c) => ({
              id: `${c.id}-test`,
              type: "blank_map_click",
              tier: "tier_1",
              countryId: c.id,
              prompt: `Find ${c.name}`,
              answerType: "map_click",
              correctAnswer: c.id,
              clueEligible: false,
            }))
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setStartedAt(Date.now());
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gameType, mode, region]);

  const advance = useCallback(
    async (country: any, wasCorrect: boolean) => {
      const isLast = index >= questions.length - 1;
      if (!isLast && country) {
        const seen = await getSeenFactsForCountry(country.id || country.iso3);
        const selected = selectLearnFact(country, {
          wasCorrect,
          category: mode,
          seenIndices: seen,
        });
        if (selected?.text != null) {
          setFact({
            country,
            text: selected.text,
            index: selected.index,
          });
          return;
        }
      }
      if (isLast) {
        if (params.source === "go") {
          const granted = await requestPermissionIfAppropriate();
          if (granted) {
            try {
              await getAndRegisterPushToken();
            } catch {
              // ignore push registration failures
            }
          }
        }
        router.replace("/(tabs)");
        return;
      }
      setIndex((i) => i + 1);
      setText("");
      setFeedback(null);
      setHighlightId(null);
      setWrongId(null);
      setStartedAt(Date.now());
    },
    [index, mode, params.source, questions.length]
  );

  const record = useCallback(
    async (event: any) => {
      const { payload } = buildLearnStatPayload(event, { mode, level });
      try {
        await api.recordCountryStat(payload);
      } catch {
        await recordPendingAnswer({
          id: `${Date.now()}-${event.countryId}`,
          countryId: payload.countryId,
          mode: payload.mode,
          level: payload.level,
          outcome: payload.outcome,
          responseTimeMs: payload.responseTimeMs,
          gameType: payload.gameType,
          learnModeMultiplier: payload.learnModeMultiplier,
        });
      }
    },
    [level, mode]
  );

  const handleAnswer = useCallback(
    async (guess: string, via: "map" | "text") => {
      if (!current || feedback) return;
      const country = countriesById.get(current.countryId);
      const responseTimeMs = Date.now() - startedAt;
      let correct = false;

      if (current.answerType === "map_click" || via === "map") {
        correct = guess === current.countryId || guess === current.correctAnswer;
      } else {
        const expected = String(current.correctAnswer || country?.name || "");
        correct = normalizeName(guess) === normalizeName(expected);
      }

      if (correct) haptics.correct();
      else haptics.incorrect();
      await playSound(correct ? "correct" : "incorrect");

      setFeedback(correct ? "Correct!" : "Not quite");
      setHighlightId(correct ? current.countryId : null);
      setWrongId(correct ? null : guess);

      await record({
        countryId: current.countryId,
        questionType: current.type,
        tier: current.tier,
        correct,
        revealUsed: false,
        priorMiss: false,
        fast: responseTimeMs < 5000,
        responseTimeMs,
      });

      setTimeout(() => {
        advance(country, correct);
      }, 800);
    },
    [advance, countriesById, current, feedback, record, startedAt]
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.brand.teal} />
      </View>
    );
  }

  if (!current) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={styles.prompt}>No questions available.</Text>
        <Button title="Back" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  const country = countriesById.get(current.countryId);

  return (
    <SafeAreaView style={styles.safe}>
      <Text style={styles.progress}>
        {index + 1} / {questions.length}
      </Text>
      <Text style={styles.prompt}>{current.prompt}</Text>
      {current.promptSubtext ? (
        <Text style={styles.sub}>{current.promptSubtext}</Text>
      ) : null}

      {(current.answerType === "map_click" ||
        current.answerType === "binary_choice") && (
        <SessionMap
          region={region}
          highlightId={highlightId}
          wrongId={wrongId}
          onSelect={(id) => handleAnswer(id, "map")}
        />
      )}

      {(current.answerType === "text_entry" ||
        current.answerType === "multi_text_entry") && (
        <View style={styles.textWrap}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Type your answer"
            placeholderTextColor={Colors.text.tertiary}
            autoCapitalize="words"
            onSubmitEditing={() => handleAnswer(text, "text")}
          />
          <Button title="Submit" onPress={() => handleAnswer(text, "text")} />
        </View>
      )}

      {Array.isArray(current.options) && current.options.length > 0 && (
        <View style={styles.options}>
          {current.options.map((opt: any) => {
            const value = typeof opt === "string" ? opt : opt.id || opt.value;
            const label =
              typeof opt === "string"
                ? opt
                : opt.label || countriesById.get(value)?.name || value;
            return (
              <Pressable
                key={String(value)}
                style={styles.option}
                onPress={() => handleAnswer(String(value), "text")}
              >
                <Text style={styles.optionText}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {feedback ? <Text style={styles.feedback}>{feedback}</Text> : null}

      {fact ? (
        <FactModal
          countryName={fact.country.name}
          factText={fact.text}
          onDismiss={async () => {
            if (fact.index != null) {
              await markFactSeen(fact.country.id || fact.country.iso3, fact.index);
              try {
                await api.markFactSeen(
                  fact.country.id || fact.country.iso3,
                  fact.index
                );
              } catch {
                // offline ok
              }
            }
            setFact(null);
            const isLast = index >= questions.length - 1;
            if (isLast) router.replace("/(tabs)");
            else {
              setIndex((i) => i + 1);
              setText("");
              setFeedback(null);
              setHighlightId(null);
              setWrongId(null);
              setStartedAt(Date.now());
            }
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background.primary, padding: Spacing.lg },
  center: {
    flex: 1,
    backgroundColor: Colors.background.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  progress: { color: Colors.text.tertiary, marginBottom: Spacing.sm },
  prompt: {
    color: Colors.text.primary,
    fontSize: Font.lg,
    fontWeight: "800",
    marginBottom: Spacing.sm,
  },
  sub: { color: Colors.text.secondary, marginBottom: Spacing.md },
  textWrap: { gap: Spacing.md, marginTop: Spacing.lg },
  input: {
    backgroundColor: Colors.background.card,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border.subtle,
    color: Colors.text.primary,
    padding: Spacing.md,
  },
  options: { gap: Spacing.sm, marginTop: Spacing.md },
  option: {
    backgroundColor: Colors.background.card,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border.subtle,
  },
  optionText: { color: Colors.text.primary, fontWeight: "600" },
  feedback: {
    marginTop: Spacing.lg,
    color: Colors.brand.teal,
    fontWeight: "800",
    fontSize: Font.md,
    textAlign: "center",
  },
});
