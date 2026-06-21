"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import AuthModal from "@/components/AuthModal";
import { getLevelShortLabel } from "@/lib/levels";
import { GAME_MODES, REGIONS, formatGameScore } from "@/lib/regions";
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

export default function ResultsPage() {
  const { status } = useSession();
  const [authOpen, setAuthOpen] = useState(false);
  const [scores, setScores] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const signedIn = status === "authenticated";

  useEffect(() => {
    if (!signedIn) {
      setScores([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchScores()
      .then((data) => {
        if (!cancelled) {
          setScores(data);
          setLoading(false);
        }
      })
      .catch((fetchError) => {
        if (!cancelled) {
          setError(fetchError.message || "Could not load scores.");
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

  return (
    <div className="results-page">
      <AppHeader title="Results" />

      <main className="results-content">
        <Link href="/" className="results-back">
          ← Back to game
        </Link>

        <h1 className="results-title">Results</h1>
        <p className="results-subtitle">
          Your best scores for each mode, region, and level.
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
          <p className="results-message">Loading your scores…</p>
        )}

        {signedIn && error && (
          <p className="results-message error">{error}</p>
        )}

        {signedIn && !loading && !error && (
          <div className="results-tables">
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
          </div>
        )}
      </main>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
}
