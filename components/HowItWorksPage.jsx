"use client";

import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import {
  infoBack,
  infoCallout,
  infoCalloutIcon,
  infoChip,
  infoChipLabel,
  infoChips,
  infoChipValue,
  infoContent,
  infoDelta,
  infoFormula,
  infoFormulaAccent,
  infoHero,
  infoHeroBadge,
  infoHeroBody,
  infoHeroTitle,
  infoIntro,
  infoLead,
  infoPage,
  infoRow,
  infoRowDesc,
  infoRowIcon,
  infoRowMain,
  infoRowTitle,
  infoRows,
  infoSection,
  infoSectionBody,
  infoSectionHead,
  infoSectionIcon,
  infoSectionTitle,
  infoStep,
  infoStepNum,
  infoStepText,
  infoSteps,
  infoTitle,
  infoWeightBar,
  infoWeightLegend,
  infoWeightLegendRow,
  infoWeightLegendValue,
  infoWeightSegment,
  infoWeightSwatch,
} from "@/lib/ui";

// — Inline icons (kept local so the page is self-contained) —

function IconCheck() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconRetry() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 3v5h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconEye() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function IconGlobe() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M3 12h18M12 3c2.5 2.5 3.8 5.7 3.8 9S14.5 18.5 12 21c-2.5-2.5-3.8-5.7-3.8-9S9.5 5.5 12 3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function IconTrend() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 17l5-5 4 4 8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 8h5v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconCap() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 4 2 9l10 5 10-5-10-5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M6 11v5c0 1.1 2.7 2.5 6 2.5s6-1.4 6-2.5v-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7v5l3.5 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconTarget() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}

function IconLayers() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m12 3 9 5-9 5-9-5 9-5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="m3 13 9 5 9-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SectionCard({ tone, icon, title, children }) {
  return (
    <section className={infoSection}>
      <div className={infoSectionHead}>
        <span className={infoSectionIcon(tone)}>{icon}</span>
        <h2 className={infoSectionTitle}>{title}</h2>
      </div>
      <div className={infoSectionBody}>{children}</div>
    </section>
  );
}

const MODE_WEIGHTS = [
  { label: "Countries", pct: 50, bar: "bg-sky-500", swatch: "bg-sky-500" },
  { label: "Capitals", pct: 35, bar: "bg-violet-500", swatch: "bg-violet-500" },
  { label: "Flags", pct: 15, bar: "bg-amber-500", swatch: "bg-amber-500" },
];

const LEVEL_WEIGHTS = [
  { label: "Find it · Level 1", sub: "map fills in as you go", pct: 15, bar: "bg-teal-600", swatch: "bg-teal-600" },
  { label: "Find it · Level 2", sub: "countries disappear", pct: 25, bar: "bg-teal-500", swatch: "bg-teal-500" },
  { label: "Name it · Level 1", sub: "map fills in as you go", pct: 25, bar: "bg-emerald-600", swatch: "bg-emerald-600" },
  { label: "Name it · Level 2", sub: "countries disappear", pct: 35, bar: "bg-emerald-500", swatch: "bg-emerald-500" },
];

function WeightBreakdown({ items }) {
  return (
    <>
      <div className={infoWeightBar} role="img" aria-label={items.map((i) => `${i.label} ${i.pct}%`).join(", ")}>
        {items.map((item) => (
          <span
            key={item.label}
            className={infoWeightSegment(item.bar)}
            style={{ width: `${item.pct}%` }}
          >
            {item.pct >= 15 ? `${item.pct}%` : ""}
          </span>
        ))}
      </div>
      <div className={infoWeightLegend}>
        {items.map((item) => (
          <div key={item.label} className={infoWeightLegendRow}>
            <span className={`${infoWeightSwatch} ${item.swatch}`} aria-hidden="true" />
            <span>
              {item.label}
              {item.sub ? <span className="text-text-muted"> — {item.sub}</span> : null}
            </span>
            <span className={infoWeightLegendValue}>{item.pct}%</span>
          </div>
        ))}
      </div>
    </>
  );
}

export default function HowItWorksPage() {
  return (
    <div className={infoPage}>
      <AppHeader />

      <main className={infoContent}>
        <Link href="/results" className={infoBack}>
          ← Back to results
        </Link>

        <h1 className={infoTitle}>How scoring works</h1>
        <p className={infoIntro}>
          Worldly quietly measures how well you actually know each place — not just
          whether you got a lucky guess. Here&apos;s the whole system in plain language:
          how a single answer moves your score, how a country becomes &ldquo;mastered,&rdquo;
          how practice is chosen for you, and how it all rolls up into one headline number.
        </p>

        {/* Worldly Score hero */}
        <div className={infoHero}>
          <span className={infoHeroBadge}>
            <IconGlobe />
            Your headline number
          </span>
          <h2 className={infoHeroTitle}>The %Worldly Score</h2>
          <p className={infoHeroBody}>
            One percentage that answers &ldquo;how much of the world do I really know?&rdquo;
            It blends your mastery of countries, capitals, and flags across every region into
            a single number from <strong>0%</strong> to <strong>100%</strong>. Reaching 100%
            means you&apos;ve mastered every place, in every mode, at every level. Read on to
            see exactly how it&apos;s built from the ground up.
          </p>
        </div>

        {/* 1. Every answer */}
        <SectionCard tone="accent" icon={<IconTarget />} title="1. Every answer counts a little differently">
          <p className={infoLead}>
            After each question, we look at <strong>how</strong> you got it right — not just
            whether you did. There are three possible outcomes:
          </p>
          <div className={infoRows}>
            <div className={infoRow("success")}>
              <span className={infoRowIcon("success")}>
                <IconCheck />
              </span>
              <div className={infoRowMain}>
                <div className={infoRowTitle}>
                  First try, correct
                  <span className={infoDelta("success")}>mastery ↑</span>
                </div>
                <p className={infoRowDesc}>
                  The best outcome. Answering quickly boosts your mastery more than a slow
                  answer does (speed matters — see below).
                </p>
              </div>
            </div>

            <div className={infoRow("warning")}>
              <span className={infoRowIcon("warning")}>
                <IconRetry />
              </span>
              <div className={infoRowMain}>
                <div className={infoRowTitle}>
                  Second try, correct
                  <span className={infoDelta("warning")}>−0.15</span>
                </div>
                <p className={infoRowDesc}>
                  You missed once, then got it. A small penalty — you knew it, but it
                  wasn&apos;t instant.
                </p>
              </div>
            </div>

            <div className={infoRow("error")}>
              <span className={infoRowIcon("error")}>
                <IconEye />
              </span>
              <div className={infoRowMain}>
                <div className={infoRowTitle}>
                  Needed the answer revealed
                  <span className={infoDelta("error")}>−0.35</span>
                </div>
                <p className={infoRowDesc}>
                  You couldn&apos;t recall it and had to be shown. The biggest hit — this is a
                  place to focus on next.
                </p>
              </div>
            </div>
          </div>
        </SectionCard>

        {/* 2. Mastery + EMA */}
        <SectionCard tone="sky" icon={<IconTrend />} title="2. Mastery: a smooth running average (EMA)">
          <p>
            Every country you practice has a <strong>mastery score</strong> between 0 and 1
            (shown as 0–100%) for each mode and level. Instead of a simple &ldquo;percent
            correct,&rdquo; we use an <strong>exponential moving average (EMA)</strong>.
          </p>
          <p>
            An EMA leans on your <strong>recent</strong> performance while still remembering
            the past. Each correct answer nudges your score a fraction of the way toward a
            perfect 100% — so early wins move the needle a lot, and once you&apos;re near the
            top, each answer refines it gently. Misses subtract a flat amount right away.
          </p>

          <div className={infoFormula}>
            new mastery = old + <span className={infoFormulaAccent}>step</span> × (1 − old)
          </div>

          <div className={infoChips}>
            <div className={infoChip}>
              <span className={infoChipValue}>+0.20</span>
              <span className={infoChipLabel}>Fast correct</span>
            </div>
            <div className={infoChip}>
              <span className={infoChipValue}>+0.08</span>
              <span className={infoChipLabel}>Slow correct</span>
            </div>
            <div className={infoChip}>
              <span className={infoChipValue}>−0.15</span>
              <span className={infoChipLabel}>Second try</span>
            </div>
            <div className={infoChip}>
              <span className={infoChipValue}>−0.35</span>
              <span className={infoChipLabel}>Revealed</span>
            </div>
            <div className={infoChip}>
              <span className={infoChipValue}>0.90</span>
              <span className={infoChipLabel}>Mastered at</span>
            </div>
            <div className={infoChip}>
              <span className={infoChipValue}>0.85</span>
              <span className={infoChipLabel}>History cap</span>
            </div>
          </div>

          <div className={infoCallout("accent")}>
            <span className={infoCalloutIcon} aria-hidden="true">💡</span>
            <span>
              Because it&apos;s an average of many answers, one bad round won&apos;t wipe out a
              place you know well — and one lucky guess won&apos;t mark it as mastered.
            </span>
          </div>
        </SectionCard>

        {/* 3. Speed */}
        <SectionCard tone="amber" icon={<IconClock />} title="3. Speed: fast recall is real recall">
          <p>
            Knowing something instantly is different from digging it up after a pause. A
            correct answer is treated as <strong>fast</strong> when it lands within about
            <strong> 1.2×</strong> your own typical response time (kept between a 3 and 8 second
            window so it stays fair for everyone).
          </p>
          <p>
            Fast answers give the bigger <strong>+0.20</strong> boost and build a
            &ldquo;fast streak.&rdquo; Slower ones still count, just less. Your personal
            baseline speed is itself a running average, so the game calibrates to you.
          </p>
        </SectionCard>

        {/* 4. Graduation */}
        <SectionCard tone="success" icon={<IconCap />} title="4. Mastering (graduating) a country">
          <p>
            A country <strong>graduates</strong> — officially mastered — once you&apos;ve truly
            locked it in. That takes two things happening together, in <strong>Test mode</strong>:
          </p>
          <div className={infoSteps}>
            <div className={infoStep}>
              <span className={infoStepNum}>1</span>
              <span className={infoStepText}>
                Your mastery reaches <strong>0.90 (90%)</strong> or higher.
              </span>
            </div>
            <div className={infoStep}>
              <span className={infoStepNum}>2</span>
              <span className={infoStepText}>
                You answer it <strong>fast and first-try, 3 times in a row</strong> (a fast
                streak of 3).
              </span>
            </div>
          </div>
          <div className={infoCallout("success")}>
            <span className={infoCalloutIcon} aria-hidden="true">🎓</span>
            <span>
              Graduated countries leave the active practice pool, so your sessions focus on
              places you haven&apos;t nailed yet. Missing a graduated country on the first try
              during a Test sends it right back to studying.
            </span>
          </div>
        </SectionCard>

        {/* 5. Decay + spaced repetition */}
        <SectionCard tone="violet" icon={<IconRetry />} title="5. Memory fades — so mastery does too">
          <p>
            Real memory decays without review, and Worldly models that. A graduated country
            you never revisit slowly loses mastery on a <strong>30-day half-life</strong>:
            after about a month untouched, its stored mastery is halved; after two months,
            quartered, and so on.
          </p>
          <p>
            If that decayed score drops below <strong>0.75 (75%)</strong>, the country
            quietly re-enters your learning pool for a refresher — no test miss required.
            This is spaced repetition: you revisit things right as you&apos;re about to
            forget them.
          </p>
        </SectionCard>

        {/* 6. Learning queue strategy */}
        <SectionCard tone="accent" icon={<IconTarget />} title="6. How practice picks what you see">
          <p>
            Learning sessions don&apos;t show random countries — they focus on your weak
            spots. Each eligible country gets a <strong>weight</strong>, and weaker countries
            are far more likely to be drawn:
          </p>
          <div className={infoFormula}>
            weight = <span className={infoFormulaAccent}>(1 − mastery)²</span> + 0.05
          </div>
          <p>
            Squaring the gap means a country at 20% mastery is picked far more often than one
            at 80%. The small <strong>+0.05</strong> floor keeps even near-mastered places in
            the mix occasionally, so nothing gets stale. Only countries you&apos;ve actually
            struggled with (and haven&apos;t graduated) are eligible.
          </p>
          <div className={infoCallout("accent")}>
            <span className={infoCalloutIcon} aria-hidden="true">🎯</span>
            <span>
              The result: your time goes where it helps most — the places you keep missing —
              while mastered places rest until they need a refresh.
            </span>
          </div>
        </SectionCard>

        {/* 7. Levels + proving down */}
        <SectionCard tone="sky" icon={<IconLayers />} title="7. Levels, and how they credit each other">
          <p>
            Each mode has two sections with two levels each. <strong>Find it</strong> asks you
            to click the country on the map; <strong>Name it</strong> asks you to type its
            name. Within each, <strong>Level 1</strong> fills the map in as you go, while the
            harder <strong>Level 2</strong> makes countries disappear.
          </p>
          <p>
            Mastery <strong>proves downward</strong>: if you master the harder Level 2, it
            automatically credits the easier Level 1 of the same section — you don&apos;t have
            to replay the easy version to prove you know it. (It never works the other way
            around.)
          </p>
        </SectionCard>

        {/* 8. Worldly Score math */}
        <SectionCard tone="success" icon={<IconGlobe />} title="8. Rolling it all up into your %Worldly Score">
          <p>
            Your Worldly Score combines everything above. First, each country&apos;s four
            levels are blended — harder levels are worth more, because they prove deeper
            knowledge:
          </p>
          <WeightBreakdown items={LEVEL_WEIGHTS} />

          <p className="mt-5">
            That gives a per-country score in each mode. Those are averaged across{" "}
            <strong>every country in the world</strong> (places you haven&apos;t touched count
            as 0 — it&apos;s a true fraction of the whole world). Finally, the three modes are
            blended, with countries weighted most heavily:
          </p>
          <WeightBreakdown items={MODE_WEIGHTS} />

          <div className={infoCallout("success")}>
            <span className={infoCalloutIcon} aria-hidden="true">🌍</span>
            <span>
              Because the denominator is the entire world, your Worldly Score climbs steadily
              as you master more places — and it&apos;s directly comparable from one day to the
              next.
            </span>
          </div>
        </SectionCard>

        <p className="mt-6 text-center text-[0.9rem] text-text-muted">
          Ready to move the needle?{" "}
          <Link href="/" className="font-semibold text-link no-underline hover:underline">
            Jump back into the game →
          </Link>
        </p>
      </main>
    </div>
  );
}
