import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DEFAULT_LEARN_LEVEL } from "@worldly/constants";
import { buildFullRegionLearningQueue } from "@worldly/core/learning";
import { buildLearnSession } from "@worldly/core/learn/sessionSequencer";
import { buildLearnStatPayload } from "@worldly/core/learn/emaIntegration";
import { selectLearnFact } from "@worldly/core/learn/factSelection";
import { normalizeName } from "@worldly/core/nameUtils";
import { BinaryChoice } from "../../components/game/BinaryChoice";
import { CountrySilhouette } from "../../components/game/CountrySilhouette";
import { FactModal } from "../../components/game/FactModal";
import { MultipleChoice } from "../../components/game/MultipleChoice";
import { SessionMap } from "../../components/game/SessionMap";
import { YesNo } from "../../components/game/YesNo";
import { Button } from "../../components/ui/Button";
import { NotificationPermissionPrompt } from "../../components/ui/NotificationPermissionPrompt";
import { StreakMilestoneOverlay } from "../../components/ui/StreakMilestoneOverlay";
import { Colors, Font, Radius, Spacing } from "../../constants/theme";
import { api } from "../../lib/api";
import { playPronunciation } from "../../lib/audio/pronunciation";
import { haptics } from "../../lib/haptics";
import {
  getPermissionStatus,
  getAndRegisterPushToken,
  requestPermissionIfAppropriate,
  scheduleStreakReminder,
} from "../../lib/notifications/setup";
import { soundManager } from "../../lib/sound";
import {
  getCountriesFromCache,
  getMeta,
  getSeenFactsForCountry,
  markFactSeen,
  recordPendingAnswer,
  setMeta,
} from "../../lib/storage/db";
import { writeWidgetData } from "../../lib/storage/widgetData";
import { useSettingsStore } from "../../store/settingsStore";

const STREAK_MILESTONES = [7, 14, 30, 60, 100, 365];

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
  const isGo = params.source === "go";

  const preferredVoice = useSettingsStore((s) => s.preferredVoice);

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
  const [showNotifPrompt, setShowNotifPrompt] = useState(false);
  const [milestoneDays, setMilestoneDays] = useState<number | null>(null);
  const [pendingFinish, setPendingFinish] = useState(false);

  const current = questions[index];

  useEffect(() => {
    let cancelled = false;
    soundManager.load().catch(() => {});
    return () => {
      cancelled = true;
      soundManager.unload().catch(() => {});
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [countries, mastery] = await Promise.all([
          getCountriesFromCache(),
          api
            .getAllMastery()
            .catch(() => ({
              mastery: { countries: [], capitals: [], flags: [] },
            })),
        ]);
        if (cancelled) return;

        const byId = new Map(countries.map((c) => [c.id || c.iso3, c]));
        setCountriesById(byId);

        const regionCountries =
          region === "world"
            ? countries
            : countries.filter((c) => c.region === region);

        const masteryRows = mastery.mastery?.[mode] || [];
        const levelRows = masteryRows.filter(
          (r: any) => r.level === DEFAULT_LEARN_LEVEL
        );
        const masteryById = new Map(
          levelRows.map((r: any) => [r.countryId, r.masteryScore ?? 0])
        );
        const recencyById = new Map(
          levelRows.map((r: any) => [
            r.countryId,
            {
              lastAttemptAt: r.lastAttemptAt ?? null,
              lastOutcome: r.lastOutcome ?? null,
            },
          ])
        );

        if (gameType === "learning") {
          const queueIds = buildFullRegionLearningQueue(
            regionCountries.map((c) => c.id || c.iso3),
            masteryById,
            recencyById
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

  const finishSession = useCallback(async () => {
    if (!isGo) {
      router.replace("/(tabs)");
      return;
    }

    setPendingFinish(true);

    let completed = Number((await getMeta("go_sessions_completed")) || "0");
    completed += 1;
    await setMeta("go_sessions_completed", String(completed));

    let hitMilestone: number | null = null;

    try {
      const streakRes = await api.recordSession();
      const currentStreak = streakRes?.currentStreak ?? 0;
      const prev = Math.max(0, currentStreak - (streakRes?.recorded ? 1 : 0));
      hitMilestone =
        STREAK_MILESTONES.find((m) => currentStreak === m && prev < m) ?? null;
      if (hitMilestone) haptics.success();

      const [mastery, weak] = await Promise.all([
        api.getAllMastery().catch(() => null),
        api
          .getWeakCountries("countries", DEFAULT_LEARN_LEVEL, "world")
          .catch(() => null),
      ]);
      let worldlyPercent = 0;
      if (mastery?.mastery) {
        const { computeWorldlyScoreFromMastery } = await import(
          "@worldly/core/worldlyScore"
        );
        const countriesManifest = await import(
          "../../assets/data/countries.json"
        );
        const ids = ((countriesManifest as any).countries || [])
          .filter((c: any) => c.enabled)
          .map((c: any) => c.iso3);
        worldlyPercent = computeWorldlyScoreFromMastery(mastery.mastery, ids)
          .percent;
      }
      await writeWidgetData({
        streak: currentStreak,
        dueCount: weak?.weakCount ?? weak?.stats?.length ?? 0,
        worldlyPercent,
        updatedAt: Date.now(),
      });
    } catch {
      // offline — skip streak/widget
    }

    const dismissed = await getMeta("notification_prompt_dismissed");
    const perm = await getPermissionStatus();
    const shouldPrompt =
      completed === 1 && dismissed !== "1" && perm.canAsk && !perm.granted;

    if (!(await getMeta("push_token_registered")) && !shouldPrompt) {
      try {
        const granted = await requestPermissionIfAppropriate();
        if (granted) await getAndRegisterPushToken();
      } catch {
        // ignore
      }
    }

    if (shouldPrompt) {
      setShowNotifPrompt(true);
      if (hitMilestone) setMilestoneDays(hitMilestone);
      return;
    }

    if (hitMilestone) {
      setMilestoneDays(hitMilestone);
      return;
    }

    router.replace("/(tabs)");
  }, [isGo]);

  const leaveAfterOverlays = useCallback(() => {
    setMilestoneDays(null);
    setShowNotifPrompt(false);
    setPendingFinish(false);
    router.replace("/(tabs)");
  }, []);

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
        await finishSession();
        return;
      }
      setIndex((i) => i + 1);
      setText("");
      setFeedback(null);
      setHighlightId(null);
      setWrongId(null);
      setStartedAt(Date.now());
    },
    [finishSession, index, mode, questions.length]
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
      } else if (current.answerType === "yes_no") {
        const expected = String(current.correctAnswer).toLowerCase();
        correct = guess.toLowerCase() === expected;
      } else {
        const expected = String(current.correctAnswer || country?.name || "");
        correct = normalizeName(guess) === normalizeName(expected);
      }

      // Haptics + visual feedback first, then sound
      if (correct) haptics.correct();
      else haptics.incorrect();

      setFeedback(correct ? "Correct!" : "Not quite");
      setHighlightId(correct ? current.countryId : null);
      setWrongId(correct ? null : guess);

      if (useSettingsStore.getState().soundEnabled) {
        if (correct) await soundManager.playCorrect();
        else await soundManager.playIncorrect();
      }

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

  if (!current && !pendingFinish && !showNotifPrompt && milestoneDays == null) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={styles.prompt}>No questions available.</Text>
        <Button title="Back" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  const country = current ? countriesById.get(current.countryId) : null;
  const resolveLabel = (value: string) =>
    countriesById.get(value)?.name || value;

  return (
    <SafeAreaView style={styles.safe}>
      {current ? (
        <>
          <View style={styles.topRow}>
            <Text style={styles.progress}>
              {index + 1} / {questions.length}
            </Text>
            {country &&
            current.type !== "shape_name_entry" &&
            current.type !== "free_name_entry" ? (
              <Pressable
                onPress={() =>
                  playPronunciation(
                    country.id || country.iso3,
                    mode === "capitals" ? "capital" : "country",
                    preferredVoice
                  )
                }
                hitSlop={8}
              >
                <Text style={styles.speaker}>🔊</Text>
              </Pressable>
            ) : null}
          </View>
          <Text style={styles.prompt}>{current.prompt}</Text>
          {current.promptSubtext ? (
            <Text style={styles.sub}>{current.promptSubtext}</Text>
          ) : null}

          {current.type === "shape_name_entry" && (
            <CountrySilhouette
              countryId={current.countryId}
              fit="aspect"
              height={280}
            />
          )}

          {current.answerType === "map_click" && (
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

          {current.answerType === "multiple_choice" &&
            Array.isArray(current.options) && (
              <MultipleChoice
                options={current.options}
                resolveLabel={resolveLabel}
                variant={
                  current.type === "shape_identification" ? "shape" : "text"
                }
                disabled={Boolean(feedback)}
                onSelect={(value) => handleAnswer(value, "text")}
              />
            )}

          {current.answerType === "yes_no" && (
            <YesNo
              disabled={Boolean(feedback)}
              onSelect={(value) => handleAnswer(value, "text")}
            />
          )}

          {current.answerType === "binary_choice" &&
            Array.isArray(current.options) &&
            current.options.length >= 2 && (
              <BinaryChoice
                left={current.options[0]}
                right={current.options[1]}
                resolveLabel={resolveLabel}
                disabled={Boolean(feedback)}
                onSelect={(value) => handleAnswer(value, "text")}
              />
            )}

          {!["multiple_choice", "yes_no", "binary_choice"].includes(
            current.answerType
          ) &&
            Array.isArray(current.options) &&
            current.options.length > 0 && (
              <MultipleChoice
                options={current.options}
                resolveLabel={resolveLabel}
                disabled={Boolean(feedback)}
                onSelect={(value) => handleAnswer(value, "text")}
              />
            )}

          {feedback ? <Text style={styles.feedback}>{feedback}</Text> : null}
        </>
      ) : null}

      {fact ? (
        <FactModal
          countryName={fact.country.name}
          factText={fact.text}
          onDismiss={async () => {
            if (fact.index != null) {
              await markFactSeen(
                fact.country.id || fact.country.iso3,
                fact.index
              );
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
            if (isLast) await finishSession();
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

      <NotificationPermissionPrompt
        visible={showNotifPrompt}
        onEnable={async () => {
          const granted = await requestPermissionIfAppropriate();
          if (granted) {
            try {
              await getAndRegisterPushToken();
              const { notificationHour, notificationMinute } =
                useSettingsStore.getState();
              useSettingsStore.getState().setNotificationsEnabled(true);
              await scheduleStreakReminder(
                notificationHour,
                notificationMinute
              );
            } catch {
              // ignore
            }
          }
          leaveAfterOverlays();
        }}
        onDismiss={async () => {
          await setMeta("notification_prompt_dismissed", "1");
          leaveAfterOverlays();
        }}
      />

      <StreakMilestoneOverlay
        visible={milestoneDays != null && !showNotifPrompt}
        days={milestoneDays || 0}
        onDismiss={leaveAfterOverlays}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background.primary,
    padding: Spacing.lg,
  },
  center: {
    flex: 1,
    backgroundColor: Colors.background.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  progress: { color: Colors.text.tertiary },
  speaker: { fontSize: 22 },
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
  feedback: {
    marginTop: Spacing.lg,
    color: Colors.brand.teal,
    fontWeight: "800",
    fontSize: Font.md,
    textAlign: "center",
  },
});
