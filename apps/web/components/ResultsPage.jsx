"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import AuthModal from "@/components/AuthModal";
import { fetchAllMasteryStats } from "@/lib/countryStats";
import { getLevelShortLabel } from "@/lib/levels";
import {
  collectStatsByCountry,
  DOMAIN_COLUMNS,
  regionDomainDisplayPcts,
  SKILL_DOMAIN_LABELS,
} from "@/lib/masteryMap";
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

function MasteryCell({ pct }) {
  if (pct == null) return <td>—</td>;
  return (
    <td className={masteryCell}>
      <span className={masteryCellBar} style={{ width: `${pct}%` }} aria-hidden="true" />
      <span className={masteryCellValue}>{pct}%</span>
    </td>
  );
}

function MasteryTableMobile({ statsByCountry }) {
  return (
    <section className={cn(resultsSection, "md:hidden")}>
      <div className={resultsMobileCards}>
        {REGIONS.map((region) => {
          const pcts = regionDomainDisplayPcts(getCountryIdsForRegion(region.id), statsByCountry);
          return (
            <div key={region.id} className={resultsMobileCard}>
              <h3 className={resultsMobileCardTitle}>{region.label}</h3>
              <div className={resultsMobileGrid}>
                {DOMAIN_COLUMNS.map((domain) => {
                  const pct = pcts?.[domain];
                  return (
                    <div key={domain} className={resultsMobileCell}>
                      <span className={resultsMobileCellLabel}>
                        {SKILL_DOMAIN_LABELS[domain] ?? domain}
                      </span>
                      <span className={resultsMobileCellValue}>
                        {pct == null ? "—" : `${pct}%`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MasteryTable({ statsByCountry }) {
  return (
    <>
      <section className={cn(resultsSection, "max-md:hidden")}>
        <div className={resultsTableWrap}>
          <table className={resultsTable}>
            <thead>
              <tr>
                <th scope="col" className={resultsTableColHeader}>
                  Region
                </th>
                {DOMAIN_COLUMNS.map((domain) => (
                  <th key={domain} scope="col" className={resultsTableColHeader}>
                    {SKILL_DOMAIN_LABELS[domain] ?? domain}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {REGIONS.map((region) => {
                const pcts = regionDomainDisplayPcts(
                  getCountryIdsForRegion(region.id),
                  statsByCountry
                );
                return (
                  <tr key={region.id}>
                    <th scope="row" className={resultsTableRowHeader}>
                      {region.label}
                    </th>
                    {DOMAIN_COLUMNS.map((domain) => (
                      <MasteryCell key={domain} pct={pcts?.[domain] ?? null} />
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <MasteryTableMobile statsByCountry={statsByCountry} />
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

  const statsByCountry = useMemo(() => collectStatsByCountry(mastery), [mastery]);

  return (
    <div className={resultsPage}>
      <AppHeader />

      <main className={resultsContent}>
        <Link href="/" className={resultsBack}>
          Play now!
        </Link>

        <h1 className={resultsTitle}>Results</h1>
        <p className={resultsSubtitle}>
          Best scores by mode and level, plus mastery by skill.{" "}
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
              Average of each skill across the countries in a region. World combines every region.
            </p>
            <MasteryTable statsByCountry={statsByCountry} />
          </div>
        )}
      </main>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
}
