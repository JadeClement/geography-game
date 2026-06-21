"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import AuthModal from "@/components/AuthModal";
import { fetchMasteryStats } from "@/lib/countryStats";
import { getLevelShortLabel } from "@/lib/levels";
import { getMasteryProvingLevels } from "@/lib/levels";
import { GAME_MODES, REGIONS, formatGameScore, getCountryIdsForRegion } from "@/lib/regions";
import { fetchScores, LEVELS } from "@/lib/scores";

function ScoreTable({ title, mode, scoreMap }) {
  return (
    <section className="results-section">
      <h2 className="results-table-title">{title}</h2>
      <div className="results-table-wrap">
        <table className="results-table">
          <thead>
            <tr>
              <th scope="col">Region</th>
              {LEVELS.map((level) => (
                <th key={level} scope="col">
                  {getLevelShortLabel(level)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {REGIONS.map((region) => (
              <tr key={region.id}>
                <th scope="row">{region.label}</th>
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
  );
}

function cascadedMastery(lookup, countryId, level) {
  let value = lookup.get(`${countryId}:${level}`) ?? 0;
  for (const proving of getMasteryProvingLevels(level)) {
    value = Math.max(value, lookup.get(`${countryId}:${proving}`) ?? 0);
  }
  return value;
}

function regionMasteryPct(lookup, regionId, level) {
  const ids = getCountryIdsForRegion(regionId);
  if (ids.length === 0) return null;
  let sum = 0;
  for (const id of ids) {
    sum += cascadedMastery(lookup, id, level);
  }
  return Math.round((sum / ids.length) * 100);
}

function MasteryCell({ pct }) {
  if (pct == null) return <td>—</td>;
  return (
    <td className="mastery-cell">
      <span className="mastery-cell-bar" style={{ width: `${pct}%` }} aria-hidden="true" />
      <span className="mastery-cell-value">{pct}%</span>
    </td>
  );
}

function MasteryTable({ title, lookup }) {
  return (
    <section className="results-section">
      <h2 className="results-table-title">{title}</h2>
      <div className="results-table-wrap">
        <table className="results-table">
          <thead>
            <tr>
              <th scope="col">Region</th>
              {LEVELS.map((level) => (
                <th key={level} scope="col">
                  {getLevelShortLabel(level)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {REGIONS.map((region) => (
              <tr key={region.id}>
                <th scope="row">{region.label}</th>
                {LEVELS.map((level) => (
                  <MasteryCell key={level} pct={regionMasteryPct(lookup, region.id, level)} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function ResultsPage() {
  const { status } = useSession();
  const [authOpen, setAuthOpen] = useState(false);
  const [scores, setScores] = useState([]);
  const [mastery, setMastery] = useState({ countries: [], capitals: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const signedIn = status === "authenticated";

  useEffect(() => {
    if (!signedIn) {
      setScores([]);
      setMastery({ countries: [], capitals: [] });
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      fetchScores(),
      fetchMasteryStats({ mode: GAME_MODES.COUNTRIES }),
      fetchMasteryStats({ mode: GAME_MODES.CAPITALS }),
    ])
      .then(([scoreData, countriesMastery, capitalsMastery]) => {
        if (cancelled) return;
        setScores(scoreData);
        setMastery({
          countries: countriesMastery.mastery ?? [],
          capitals: capitalsMastery.mastery ?? [],
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
        map.set(`${row.countryId}:${row.level}`, row.masteryScore);
      }
      return map;
    };
    return {
      countries: build(mastery.countries),
      capitals: build(mastery.capitals),
    };
  }, [mastery]);

  return (
    <div className="results-page">
      <AppHeader title="Results" />

      <main className="results-content">
        <Link href="/" className="results-back">
          ← Back to game
        </Link>

        <h1 className="results-title">Results</h1>
        <p className="results-subtitle">
          Your best scores and mastery for each mode, region, and level.
        </p>

        {status === "loading" && (
          <p className="results-message">Loading…</p>
        )}

        {!signedIn && status !== "loading" && (
          <div className="results-sign-in">
            <p className="results-message">
              Sign in to view and save your scores.
            </p>
            <button
              type="button"
              className="primary-btn"
              onClick={() => setAuthOpen(true)}
            >
              Sign in / Create account
            </button>
          </div>
        )}

        {signedIn && loading && (
          <p className="results-message">Loading your results…</p>
        )}

        {signedIn && error && (
          <p className="results-message error">{error}</p>
        )}

        {signedIn && !loading && !error && (
          <div className="results-tables">
            <h2 className="results-group-title">Best scores</h2>
            <ScoreTable
              title="Countries"
              mode={GAME_MODES.COUNTRIES}
              scoreMap={scoreMap}
            />
            <ScoreTable
              title="Capitals"
              mode={GAME_MODES.CAPITALS}
              scoreMap={scoreMap}
            />

            <h2 className="results-group-title">Mastery</h2>
            <p className="results-group-note">
              Average mastery across each region. World combines every region, and
              mastering a harder level counts toward its easier counterpart.
            </p>
            <MasteryTable title="Countries" lookup={masteryLookups.countries} />
            <MasteryTable title="Capitals" lookup={masteryLookups.capitals} />
          </div>
        )}
      </main>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
}
