"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import AuthModal from "@/components/AuthModal";
import { fetchAllMasteryStats } from "@/lib/countryStats";
import { getLevelShortLabel } from "@/lib/levels";
import { GAME_MODES, REGIONS, formatGameScore, getCountryIdsForRegion, getModeLabel } from "@/lib/regions";
import { fetchScores, LEVELS } from "@/lib/scores";
import { cn } from "@/lib/cn";
import {
  masteryCell,
  masteryCellBar,
  masteryCellValue,
  primaryBtn,
  resultsBack,
  resultsContent,
  resultsGroupNote,
  resultsGroupTitle,
  resultsInfoLink,
  resultsMessage,
  resultsMessageError,
  resultsMobileCard,
  resultsMobileCards,
  resultsMobileCell,
  resultsMobileCellLabel,
  resultsMobileCellValue,
  resultsMobileCardTitle,
  resultsMobileGrid,
  resultsPage,
  resultsSection,
  resultsSignIn,
  resultsSubtitle,
  resultsTable,
  resultsTableColHeader,
  resultsTableRowHeader,
  resultsTables,
  resultsTableTitle,
  resultsTableWrap,
  resultsTitle,
} from "@/lib/ui";

function ScoreTableMobile({ title, mode, scoreMap }) {
  return (
    <section className={cn(resultsSection, "md:hidden")}>
      <h2 className={resultsTableTitle}>{title}</h2>
      <div className={resultsMobileCards}>
        {REGIONS.map((region) => (
          <div key={region.id} className={resultsMobileCard}>
            <h3 className={resultsMobileCardTitle}>{region.label}</h3>
            <div className={resultsMobileGrid}>
              {LEVELS.map((level) => (
                <div key={level} className={resultsMobileCell}>
                  <span className={resultsMobileCellLabel}>{getLevelShortLabel(level)}</span>
                  <span className={resultsMobileCellValue}>
                    {formatGameScore(scoreMap.get(`${mode}:${region.id}:${level}`), region.id)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ScoreTable({ title, mode, scoreMap }) {
  return (
    <>
      <section className={cn(resultsSection, "max-md:hidden")}>
        <h2 className={resultsTableTitle}>{title}</h2>
        <div className={resultsTableWrap}>
          <table className={resultsTable}>
            <thead>
              <tr>
                <th scope="col" className={resultsTableColHeader}>
                  Region
                </th>
                {LEVELS.map((level) => (
                  <th key={level} scope="col" className={resultsTableColHeader}>
                    {getLevelShortLabel(level)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {REGIONS.map((region) => (
                <tr key={region.id}>
                  <th scope="row" className={resultsTableRowHeader}>
                    {region.label}
                  </th>
                  {LEVELS.map((level) => {
                    const score = scoreMap.get(`${mode}:${region.id}:${level}`);
                    return (
                      <td key={level}>{formatGameScore(score, region.id)}</td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <ScoreTableMobile title={title} mode={mode} scoreMap={scoreMap} />
    </>
  );
}

function regionMasteryPct(lookup, regionId) {
  const ids = getCountryIdsForRegion(regionId);
  if (ids.length === 0) return null;
  let sum = 0;
  for (const id of ids) {
    sum += lookup.get(id) ?? 0;
  }
  return Math.round((sum / ids.length) * 100);
}

function MasteryCell({ pct }) {
  if (pct == null) return <td>—</td>;
  return (
    <td className={masteryCell}>
      <span className={masteryCellBar} style={{ width: `${pct}%` }} aria-hidden="true" />
      <span className={masteryCellValue}>{pct}%</span>
    </td>
  );
}

function MasteryTableMobile({ title, lookup }) {
  return (
    <section className={cn(resultsSection, "md:hidden")}>
      <h2 className={resultsTableTitle}>{title}</h2>
      <div className={resultsMobileCards}>
        {REGIONS.map((region) => {
          const pct = regionMasteryPct(lookup, region.id);
          return (
            <div key={region.id} className={resultsMobileCard}>
              <h3 className={resultsMobileCardTitle}>{region.label}</h3>
              <div className={resultsMobileGrid}>
                <div className={resultsMobileCell}>
                  <span className={resultsMobileCellLabel}>Mastery</span>
                  <span className={resultsMobileCellValue}>{pct == null ? "—" : `${pct}%`}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MasteryTable({ title, lookup }) {
  return (
    <>
      <section className={cn(resultsSection, "max-md:hidden")}>
        <h2 className={resultsTableTitle}>{title}</h2>
        <div className={resultsTableWrap}>
          <table className={resultsTable}>
            <thead>
              <tr>
                <th scope="col" className={resultsTableColHeader}>
                  Region
                </th>
                <th scope="col" className={resultsTableColHeader}>
                  Mastery
                </th>
              </tr>
            </thead>
            <tbody>
              {REGIONS.map((region) => (
                <tr key={region.id}>
                  <th scope="row" className={resultsTableRowHeader}>
                    {region.label}
                  </th>
                  <MasteryCell pct={regionMasteryPct(lookup, region.id)} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <MasteryTableMobile title={title} lookup={lookup} />
    </>
  );
}

export default function ResultsPage() {
  const { status } = useSession();
  const [authOpen, setAuthOpen] = useState(false);
  const [scores, setScores] = useState([]);
  const [mastery, setMastery] = useState({ countries: [], capitals: [], flags: [], neighbors: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const signedIn = status === "authenticated";

  useEffect(() => {
    if (!signedIn) {
      setScores([]);
      setMastery({ countries: [], capitals: [], flags: [], neighbors: [] });
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([fetchScores(), fetchAllMasteryStats()])
      .then(([scoreData, masteryData]) => {
        if (cancelled) return;
        const masteryByMode = masteryData.mastery ?? {};
        setScores(scoreData);
        setMastery({
          countries: masteryByMode.countries ?? [],
          capitals: masteryByMode.capitals ?? [],
          flags: masteryByMode.flags ?? [],
          neighbors: masteryByMode.neighbors ?? [],
        });
        setLoading(false);
      })
      .catch((fetchError) => {
        if (!cancelled) {
          setError(fetchError.message || "Could not load your results.");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  const scoreMap = useMemo(() => {
    const map = new Map();
    for (const entry of scores) {
      map.set(`${entry.mode}:${entry.region}:${entry.level}`, entry.score);
    }
    return map;
  }, [scores]);

  const masteryLookups = useMemo(() => {
    const build = (rows) => {
      const map = new Map();
      for (const row of rows) {
        if ((row.skillDomain ?? row.skill_domain ?? "general") !== "general") continue;
        const score = Number(row.masteryScore) || 0;
        const prev = map.get(row.countryId);
        if (prev == null || score > prev) map.set(row.countryId, score);
      }
      return map;
    };
    return {
      countries: build(mastery.countries),
      capitals: build(mastery.capitals),
      flags: build(mastery.flags),
    };
  }, [mastery]);

  return (
    <div className={resultsPage}>
      <AppHeader />

      <main className={resultsContent}>
        <Link href="/" className={resultsBack}>
          Play now!
        </Link>

        <h1 className={resultsTitle}>Results</h1>
        <p className={resultsSubtitle}>
          Your best scores and mastery for each mode, region, and level.{" "}
          <Link href="/results/how-it-works" className={resultsInfoLink}>
            How does scoring work?
          </Link>
        </p>

        {status === "loading" && <p className={resultsMessage}>Loading…</p>}

        {!signedIn && status !== "loading" && (
          <div className={resultsSignIn}>
            <p className={resultsMessage}>Sign in to view and save your scores.</p>
            <button type="button" className={primaryBtn} onClick={() => setAuthOpen(true)}>
              Sign in / Create account
            </button>
          </div>
        )}

        {signedIn && loading && <p className={resultsMessage}>Loading your results…</p>}

        {signedIn && error && (
          <p className={cn(resultsMessage, resultsMessageError)}>{error}</p>
        )}

        {signedIn && !loading && !error && (
          <div className={resultsTables}>
            <h2 className={resultsGroupTitle}>Best scores</h2>
            <ScoreTable
              title={getModeLabel(GAME_MODES.COUNTRIES)}
              mode={GAME_MODES.COUNTRIES}
              scoreMap={scoreMap}
            />
            <ScoreTable
              title={getModeLabel(GAME_MODES.CAPITALS)}
              mode={GAME_MODES.CAPITALS}
              scoreMap={scoreMap}
            />
            <ScoreTable
              title={getModeLabel(GAME_MODES.FLAGS)}
              mode={GAME_MODES.FLAGS}
              scoreMap={scoreMap}
            />

            <h2 className={resultsGroupTitle}>Mastery</h2>
            <p className={resultsGroupNote}>
              Average mastery across each region. World combines every region.
            </p>
            <MasteryTable title={getModeLabel(GAME_MODES.COUNTRIES)} lookup={masteryLookups.countries} />
            <MasteryTable title={getModeLabel(GAME_MODES.CAPITALS)} lookup={masteryLookups.capitals} />
            <MasteryTable title={getModeLabel(GAME_MODES.FLAGS)} lookup={masteryLookups.flags} />
          </div>
        )}
      </main>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
}
