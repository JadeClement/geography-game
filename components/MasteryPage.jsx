"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useMemo, useRef, useState } from "react";
import AppHeader from "@/components/AppHeader";
import AuthModal from "@/components/AuthModal";
import MasteryMap from "@/components/MasteryMap";
import { loadCountriesGeoJSON } from "@/lib/countries";
import { fetchMasteryStats } from "@/lib/countryStats";
import { GAME_MODES, getModeLabel } from "@/lib/regions";
import {
  ALL_MODE,
  buildModeMasteryMap,
  buildTierMap,
  countMastered,
  countTier,
  getModeVisual,
  getScore,
  isMastered,
  MASTERY_MODES,
  TIER_COLORS,
} from "@/lib/masteryMap";
import {
  masteryBack,
  masteryContent,
  masteryGradientBar,
  masteryHead,
  masteryLegend,
  masteryLegendRow,
  masteryLegendScale,
  masteryLegendTitle,
  masteryMapCanvas,
  masteryMapWrap,
  masteryMessage,
  masteryMessageError,
  masteryPage,
  masteryPanel,
  masteryRing,
  masteryRingFill,
  masteryRingLabel,
  masteryRingTrack,
  masteryRingValue,
  masteryShare,
  masterySignIn,
  masteryStage,
  masteryStatLine,
  masterySubtitle,
  masterySwatch,
  masteryTab,
  masteryTabDot,
  masteryTabs,
  masteryTitle,
  masteryToolbar,
  masteryTooltip,
  masteryTooltipDot,
  masteryTooltipRow,
  primaryBtn,
  secondaryBtn,
} from "@/lib/ui";
import { cn } from "@/lib/cn";

const MODE_TABS = [...MASTERY_MODES, ALL_MODE];
const BASE_DIM = "#1a2740";

function ProgressRing({ pct, accent }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct / 100);
  return (
    <svg className={masteryRing} viewBox="0 0 120 120" role="img" aria-label={`${pct}% mastered`}>
      <circle className={masteryRingTrack} cx="60" cy="60" r={radius} />
      <circle
        className={masteryRingFill}
        cx="60"
        cy="60"
        r={radius}
        stroke={accent}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
      />
      <text x="60" y="58" className={masteryRingValue}>
        {pct}%
      </text>
      <text x="60" y="78" className={masteryRingLabel}>
        mastered
      </text>
    </svg>
  );
}

export default function MasteryPage() {
  const { status } = useSession();
  const signedIn = status === "authenticated";

  const [authOpen, setAuthOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [mode, setMode] = useState(GAME_MODES.COUNTRIES);
  const [hover, setHover] = useState(null);

  const mapRef = useRef(null);

  useEffect(() => {
    if (!signedIn) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      loadCountriesGeoJSON(),
      fetchMasteryStats({ mode: GAME_MODES.COUNTRIES }),
      fetchMasteryStats({ mode: GAME_MODES.CAPITALS }),
      fetchMasteryStats({ mode: GAME_MODES.FLAGS }),
    ])
      .then(([geo, countriesM, capitalsM, flagsM]) => {
        if (cancelled) return;
        setData({
          countries: geo.countries,
          geojson: geo.geojson,
          maps: {
            [GAME_MODES.COUNTRIES]: buildModeMasteryMap(countriesM.mastery ?? []),
            [GAME_MODES.CAPITALS]: buildModeMasteryMap(capitalsM.mastery ?? []),
            [GAME_MODES.FLAGS]: buildModeMasteryMap(flagsM.mastery ?? []),
          },
        });
        setLoading(false);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || "Could not load your mastery map.");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  const countryIds = useMemo(
    () => (data ? data.countries.map((c) => c.id) : []),
    [data]
  );

  const nameById = useMemo(() => {
    const map = new Map();
    if (data) for (const c of data.countries) map.set(c.id, c.name);
    return map;
  }, [data]);

  const tierByCountry = useMemo(() => {
    if (!data) return new Map();
    return buildTierMap(data.maps, countryIds);
  }, [data, countryIds]);

  const scoreByCountry = useMemo(() => {
    if (!data || mode === ALL_MODE) return new Map();
    const modeMap = data.maps[mode];
    const out = new Map();
    for (const id of countryIds) out.set(id, getScore(modeMap, id));
    return out;
  }, [data, mode, countryIds]);

  const visual = getModeVisual(mode);

  const stats = useMemo(() => {
    if (!data) return null;
    const total = countryIds.length;
    if (mode === ALL_MODE) {
      const gold = countTier(tierByCountry, countryIds, 3);
      return {
        total,
        mastered: gold,
        pct: total ? Math.round((gold / total) * 100) : 0,
        tiers: {
          1: countTier(tierByCountry, countryIds, 1),
          2: countTier(tierByCountry, countryIds, 2),
          3: gold,
        },
      };
    }
    const mastered = countMastered(data.maps[mode], countryIds);
    return {
      total,
      mastered,
      pct: total ? Math.round((mastered / total) * 100) : 0,
    };
  }, [data, mode, countryIds, tierByCountry]);

  const handleShare = () => {
    if (!mapRef.current || !stats) return;
    const title = mode === ALL_MODE ? "All Three Modes" : `${getModeLabel(mode)} Mastery`;
    const stat =
      mode === ALL_MODE
        ? `${stats.mastered} / ${stats.total} fully mastered`
        : `${stats.mastered} / ${stats.total} countries mastered`;
    mapRef.current.exportImage({ title, stat, accent: visual.accent });
  };

  const hoverInfo = useMemo(() => {
    if (!hover || !data) return null;
    const name = nameById.get(hover.id);
    if (!name) return null;
    const rows = MASTERY_MODES.map((m) => ({
      label: getModeLabel(m),
      pct: Math.round(getScore(data.maps[m], hover.id) * 100),
      mastered: isMastered(data.maps[m].get(hover.id)),
      accent: getModeVisual(m).accent,
    }));
    return { name, rows, point: hover.point };
  }, [hover, data, nameById]);

  return (
    <div className={masteryPage}>
      <AppHeader />

      <main className={masteryContent}>
        <Link href="/" className={masteryBack}>
          ← Back to game
        </Link>

        <div className={masteryHead}>
          <div>
            <h1 className={masteryTitle}>Mastery Map</h1>
            <p className={masterySubtitle}>
              Every country you&apos;ve conquered, lit up across the globe.
            </p>
          </div>
        </div>

        {status === "loading" && <p className={masteryMessage}>Loading…</p>}

        {!signedIn && status !== "loading" && (
          <div className={masterySignIn}>
            <p className={masteryMessage}>Sign in to see which countries you&apos;ve mastered.</p>
            <button type="button" className={primaryBtn} onClick={() => setAuthOpen(true)}>
              Sign in / Create account
            </button>
          </div>
        )}

        {signedIn && loading && <p className={masteryMessage}>Lighting up your world…</p>}
        {signedIn && error && (
          <p className={cn(masteryMessage, masteryMessageError)}>{error}</p>
        )}

        {signedIn && !loading && !error && data && (
          <>
            <div className={masteryToolbar}>
              <div className={masteryTabs} role="tablist" aria-label="Mastery mode">
                {MODE_TABS.map((tab) => {
                  const tabVisual = getModeVisual(tab);
                  const active = tab === mode;
                  const label = tab === ALL_MODE ? "All" : getModeLabel(tab);
                  return (
                    <button
                      key={tab}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      className={masteryTab({ active })}
                      style={active ? { borderColor: tabVisual.accent, color: tabVisual.accent } : undefined}
                      onClick={() => setMode(tab)}
                    >
                      <span
                        className={masteryTabDot}
                        style={{ background: tabVisual.accent }}
                        aria-hidden="true"
                      />
                      {label}
                    </button>
                  );
                })}
              </div>

              <button type="button" className={cn(secondaryBtn, masteryShare)} onClick={handleShare}>
                Share image
              </button>
            </div>

            <div className={masteryStage}>
              <div className={masteryMapWrap}>
                <MasteryMap
                  ref={mapRef}
                  countries={data.countries}
                  geojson={data.geojson}
                  mode={mode}
                  accent={visual.accent}
                  scoreByCountry={scoreByCountry}
                  tierByCountry={tierByCountry}
                  onHover={setHover}
                />

                {hoverInfo && (
                  <div
                    className={masteryTooltip}
                    style={{
                      left: Math.min(hoverInfo.point.x + 14, typeof window !== "undefined" ? window.innerWidth - 160 : hoverInfo.point.x + 14),
                      top: Math.min(hoverInfo.point.y + 14, typeof window !== "undefined" ? window.innerHeight - 120 : hoverInfo.point.y + 14),
                    }}
                  >
                    <strong>{hoverInfo.name}</strong>
                    {hoverInfo.rows.map((row) => (
                      <span key={row.label} className={masteryTooltipRow}>
                        <span className={masteryTooltipDot} style={{ background: row.accent }} />
                        {row.label}
                        <em>{row.mastered ? "★" : `${row.pct}%`}</em>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <aside className={masteryPanel}>
                {stats && <ProgressRing pct={stats.pct} accent={visual.accent} />}
                {stats && (
                  <p className={masteryStatLine}>
                    <strong style={{ color: visual.accent }}>{stats.mastered}</strong>
                    <span> / {stats.total}</span>
                    <br />
                    {mode === ALL_MODE ? "fully mastered" : "countries mastered"}
                  </p>
                )}

                {mode === ALL_MODE ? (
                  <div className={masteryLegend}>
                    <span className={masteryLegendTitle}>Modes mastered</span>
                    <span className={masteryLegendRow}>
                      <span className={masterySwatch} style={{ background: TIER_COLORS[1] }} />
                      Bronze · 1 mode <em>{stats?.tiers?.[1] ?? 0}</em>
                    </span>
                    <span className={masteryLegendRow}>
                      <span className={masterySwatch} style={{ background: TIER_COLORS[2] }} />
                      Silver · 2 modes <em>{stats?.tiers?.[2] ?? 0}</em>
                    </span>
                    <span className={masteryLegendRow}>
                      <span className={masterySwatch} style={{ background: TIER_COLORS[3] }} />
                      Gold · all 3 <em>{stats?.tiers?.[3] ?? 0}</em>
                    </span>
                  </div>
                ) : (
                  <div className={masteryLegend}>
                    <span className={masteryLegendTitle}>{getModeLabel(mode)} glow</span>
                    <span
                      className={masteryGradientBar}
                      style={{
                        background: `linear-gradient(90deg, ${BASE_DIM}, ${visual.accent})`,
                      }}
                    />
                    <span className={masteryLegendScale}>
                      <span>Learning</span>
                      <span>Mastered</span>
                    </span>
                  </div>
                )}
              </aside>
            </div>
          </>
        )}
      </main>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
}
