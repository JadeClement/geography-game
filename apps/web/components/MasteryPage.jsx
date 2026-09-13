"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import AppHeader from "@/components/AppHeader";
import AuthModal from "@/components/AuthModal";
import MasteryMap from "@/components/MasteryMap";
import CountryMasteryModal from "@/components/CountryMasteryModal";
import { useTheme } from "@/components/ThemeProvider";
import { loadCountriesGeoJSON } from "@/lib/countries";
import { fetchAllMasteryStats } from "@/lib/countryStats";
import { GAME_MODES, getCountryIdsForRegion, getModeLabel, REGIONS } from "@/lib/regions";
import {
  ALL_MODE,
  countLocatedForTab,
  countTierLabel,
  getModeVisual,
  MASTERY_MODES,
  MASTERY_MODE_THRESHOLD,
  paintScoreForTab,
  regionScoresForTab,
  TIER_COLORS,
  TIER_STATE,
} from "@/lib/masteryMap";
import {
  domainScoresFromStats,
  getMasteryTier,
  MASTERY_TIER_LABELS,
  MASTERY_TIERS,
} from "@/lib/masteryTiers";
import { applyWorldlyCurve } from "@/lib/worldlyScore";
import { THEMES } from "@/lib/theme";
import {
  masteryBack,
  masteryContent,
  masteryGradientBar,
  masteryHead,
  masteryLegend,
  masteryLegendRow,
  masteryLegendScale,
  masteryLegendTitle,
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
  masteryTabsCenter,
  masteryTitle,
  masteryToolbar,
  masteryTooltip,
  masteryTooltipDot,
  masteryTooltipRow,
  primaryBtn,
  secondaryBtn,
} from "@/lib/ui";
import { cn } from "@/lib/cn";

const MODE_TABS = [ALL_MODE, ...MASTERY_MODES];
const BASE_DIM = {
  [THEMES.LIGHT]: "#e2e8f0",
  [THEMES.DARK]: "#1a2740",
};

function ProgressRing({ pct, accent, label = "located" }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct / 100);
  return (
    <svg className={masteryRing} viewBox="0 0 120 120" role="img" aria-label={`${pct}% ${label}`}>
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
        {label}
      </text>
    </svg>
  );
}

export default function MasteryPage() {
  const { status } = useSession();
  const { theme } = useTheme();
  const signedIn = status === "authenticated";
  const baseDim = BASE_DIM[theme] ?? BASE_DIM[THEMES.DARK];

  const [authOpen, setAuthOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [mode, setMode] = useState(ALL_MODE);
  const [hover, setHover] = useState(null);
  const [selectedCountryId, setSelectedCountryId] = useState(null);

  const mapRef = useRef(null);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const syncScrollbarWidth = () => {
      const next = `${window.innerWidth - root.clientWidth}px`;
      if (root.style.getPropertyValue("--scrollbar-width") === next) return;
      root.style.setProperty("--scrollbar-width", next);
    };
    syncScrollbarWidth();
    window.addEventListener("resize", syncScrollbarWidth);
    const observer = new ResizeObserver(syncScrollbarWidth);
    observer.observe(root);
    observer.observe(document.body);
    return () => {
      window.removeEventListener("resize", syncScrollbarWidth);
      observer.disconnect();
      root.style.removeProperty("--scrollbar-width");
    };
  }, []);

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

    Promise.all([loadCountriesGeoJSON(), fetchAllMasteryStats()])
      .then(([geo, masteryData]) => {
        if (cancelled) return;
        const mastery = masteryData.mastery ?? {};
        const territoryFeatures = geo.territoryGeojson?.features ?? [];
        const statsByCountry = new Map();
        const addRows = (rows, modeKey) => {
          for (const row of rows ?? []) {
            if (!row?.countryId) continue;
            if (!statsByCountry.has(row.countryId)) statsByCountry.set(row.countryId, []);
            statsByCountry.get(row.countryId).push({ ...row, mode: row.mode ?? modeKey });
          }
        };
        addRows(mastery.countries, GAME_MODES.COUNTRIES);
        addRows(mastery.capitals, GAME_MODES.CAPITALS);
        addRows(mastery.flags, GAME_MODES.FLAGS);
        addRows(mastery.neighbors, "neighbors");

        setData({
          countries: geo.countries,
          geojson: {
            ...geo.geojson,
            features: [...geo.geojson.features, ...territoryFeatures],
          },
          statsByCountry,
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

  const neighborCountById = useMemo(() => {
    const map = new Map();
    if (data) {
      for (const country of data.countries) {
        map.set(country.id, Array.isArray(country.neighbors) ? country.neighbors.length : 0);
      }
    }
    return map;
  }, [data]);

  const paintMode = mode === ALL_MODE ? "tiers" : "score";

  const domainScoresByCountry = useMemo(() => {
    if (!data) return new Map();
    const out = new Map();
    for (const id of countryIds) {
      out.set(id, domainScoresFromStats(data.statsByCountry.get(id) ?? []));
    }
    return out;
  }, [data, countryIds]);

  const tierByCountry = useMemo(() => {
    if (!data) return new Map();
    const out = new Map();
    for (const id of countryIds) {
      const tier = getMasteryTier({
        stats: data.statsByCountry.get(id) ?? [],
        neighborCount: neighborCountById.get(id),
      });
      out.set(id, TIER_STATE[tier] ?? 0);
    }
    return out;
  }, [data, countryIds, neighborCountById]);

  const labelTierByCountry = useMemo(() => {
    if (!data) return new Map();
    const out = new Map();
    for (const id of countryIds) {
      out.set(
        id,
        getMasteryTier({
          stats: data.statsByCountry.get(id) ?? [],
          neighborCount: neighborCountById.get(id),
        })
      );
    }
    return out;
  }, [data, countryIds, neighborCountById]);

  const scoreByCountry = useMemo(() => {
    const out = new Map();
    for (const id of countryIds) {
      out.set(id, paintScoreForTab(mode, domainScoresByCountry.get(id)));
    }
    return out;
  }, [mode, countryIds, domainScoresByCountry]);

  const visual = getModeVisual(mode);
  const ringLabel = mode === ALL_MODE ? "located" : getModeLabel(mode).toLowerCase();

  const stats = useMemo(() => {
    if (!data) return null;
    const total = countryIds.length;
    if (paintMode === "tiers") {
      const located = countTierLabel(labelTierByCountry, countryIds, MASTERY_TIERS.LOCATED);
      const worldly = countTierLabel(labelTierByCountry, countryIds, MASTERY_TIERS.WORLDLY);
      const spotted = countTierLabel(labelTierByCountry, countryIds, MASTERY_TIERS.SPOTTED);
      return {
        total,
        mastered: located + worldly,
        pct: total ? Math.round(((located + worldly) / total) * 100) : 0,
        label: "located",
        tiers: {
          spotted,
          located,
          worldly,
        },
      };
    }
    const mastered = countLocatedForTab(mode, countryIds, domainScoresByCountry);
    return {
      total,
      mastered,
      pct: total ? Math.round((mastered / total) * 100) : 0,
      label: `${getModeLabel(mode).toLowerCase()} located`,
    };
  }, [data, mode, countryIds, labelTierByCountry, paintMode, domainScoresByCountry]);

  const regionScores = useMemo(
    () => regionScoresForTab(mode, REGIONS, getCountryIdsForRegion, domainScoresByCountry),
    [mode, domainScoresByCountry]
  );

  const handleShare = () => {
    if (!mapRef.current || !stats) return;
    const title = mode === ALL_MODE ? "Worldly Map" : `${getModeLabel(mode)} Mastery`;
    const stat = `${stats.mastered} / ${stats.total} ${stats.label}`;
    mapRef.current.exportImage({ title, stat, accent: visual.accent });
  };

  const hoverInfo = useMemo(() => {
    if (!hover || !data) return null;
    const name = nameById.get(hover.id);
    if (!name) return null;
    const scores = domainScoresByCountry.get(hover.id) ?? {};
    const tabs = mode === ALL_MODE ? MASTERY_MODES : [mode];
    const rows = tabs.map((tab) => {
      const raw = paintScoreForTab(tab, scores);
      return {
        label: getModeLabel(tab),
        pct: Math.round(applyWorldlyCurve(raw)),
        mastered: raw >= MASTERY_MODE_THRESHOLD,
        accent: getModeVisual(tab).accent,
      };
    });
    return { name, rows, point: hover.point };
  }, [hover, data, nameById, mode, domainScoresByCountry]);

  const selectedCountry = useMemo(() => {
    if (!selectedCountryId || !data) return null;
    return {
      id: selectedCountryId,
      name: nameById.get(selectedCountryId) ?? selectedCountryId,
      domainScores: domainScoresByCountry.get(selectedCountryId) ?? {},
    };
  }, [selectedCountryId, data, nameById, domainScoresByCountry]);

  return (
    <div className={masteryPage}>
      <AppHeader />

      <main className={masteryContent}>
        <Link href="/" className={masteryBack}>
          Play now!
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
            <p className={masteryMessage}>Sign in to see which countries you&apos;ve located.</p>
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
              <div className={masteryTabsCenter}>
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
                  paintMode={paintMode}
                  onHover={setHover}
                  onSelect={({ id }) => setSelectedCountryId(id)}
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
                {stats && <ProgressRing pct={stats.pct} accent={visual.accent} label={ringLabel} />}
                {stats && (
                  <p className={masteryStatLine}>
                    <strong style={{ color: visual.accent }}>{stats.mastered}</strong>
                    <span> / {stats.total}</span>
                    <br />
                    {stats.label}
                  </p>
                )}

                {paintMode === "tiers" ? (
                  <div className={masteryLegend}>
                    <span className={masteryLegendTitle}>Mastery tiers</span>
                    <span className={masteryLegendRow}>
                      <span className={masterySwatch} style={{ background: TIER_COLORS[1] }} />
                      {MASTERY_TIER_LABELS[MASTERY_TIERS.SPOTTED]} <em>{stats?.tiers?.spotted ?? 0}</em>
                    </span>
                    <span className={masteryLegendRow}>
                      <span className={masterySwatch} style={{ background: TIER_COLORS[2] }} />
                      {MASTERY_TIER_LABELS[MASTERY_TIERS.LOCATED]} <em>{stats?.tiers?.located ?? 0}</em>
                    </span>
                    <span className={masteryLegendRow}>
                      <span className={masterySwatch} style={{ background: TIER_COLORS[3] }} />
                      {MASTERY_TIER_LABELS[MASTERY_TIERS.WORLDLY]} <em>{stats?.tiers?.worldly ?? 0}</em>
                    </span>
                  </div>
                ) : (
                  <div className={masteryLegend}>
                    <span className={masteryLegendTitle}>{getModeLabel(mode)} glow</span>
                    <span
                      className={masteryGradientBar}
                      style={{
                        background: `linear-gradient(90deg, ${baseDim}, ${visual.accent})`,
                      }}
                    />
                    <span className={masteryLegendScale}>
                      <span>Learning</span>
                      <span>Located</span>
                    </span>
                  </div>
                )}

                <div className={masteryLegend}>
                  <span className={masteryLegendTitle}>Region score</span>
                  {regionScores.map((region) => (
                    <span key={region.id} className={masteryLegendRow}>
                      {region.label}
                      <em>{region.pct}%</em>
                    </span>
                  ))}
                </div>
              </aside>
            </div>
          </>
        )}
      </main>

      <CountryMasteryModal
        open={Boolean(selectedCountry)}
        countryName={selectedCountry?.name}
        domainScores={selectedCountry?.domainScores}
        onClose={() => setSelectedCountryId(null)}
      />
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
}
