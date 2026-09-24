"use client";

import { useEffect, useState } from "react";
import { FREE_DAILY_LEARN_SESSION_LIMIT } from "@worldly/constants";
import { fetchBillingStatus, openBillingPortal, startCheckout } from "@/lib/billingClient";
import { cn } from "@/lib/cn";
import {
  linkBtn,
  primaryBtn,
  secondaryBtn,
  settingsSection,
  settingsSectionDescription,
  settingsSectionTitle,
} from "@/lib/ui";

const PAYMENT_ISSUE_STATUSES = new Set(["past_due", "unpaid", "incomplete"]);
// After returning from Checkout the webhook may land a few seconds later.
const ACTIVATION_POLL_MS = 2000;
const ACTIVATION_POLL_ATTEMPTS = 6;

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function readBillingReturnParam() {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("billing");
}

export default function LearnPlusSettings() {
  const [billing, setBilling] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [justPaid, setJustPaid] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer = null;
    const returnedFromCheckout = readBillingReturnParam() === "success";
    setJustPaid(returnedFromCheckout);

    const load = async (attempt = 1) => {
      try {
        const status = await fetchBillingStatus();
        if (cancelled) return;
        if (!status) {
          setLoadFailed(true);
          return;
        }
        setBilling(status);
        if (returnedFromCheckout && !status.isPremium && attempt < ACTIVATION_POLL_ATTEMPTS) {
          timer = setTimeout(() => load(attempt + 1), ACTIVATION_POLL_MS);
        }
      } catch {
        if (!cancelled) setLoadFailed(true);
      }
    };
    load();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const runBillingAction = async (action) => {
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      await action();
    } catch (actionError) {
      setError(actionError.message);
      setBusy(false);
    }
  };

  let body;
  if (loadFailed) {
    body = <p className={settingsSectionDescription}>Couldn&apos;t load your subscription.</p>;
  } else if (!billing) {
    body = <p className={settingsSectionDescription}>Loading…</p>;
  } else if (billing.isPremium) {
    const cancelDate = formatDate(billing.cancelAt);
    const renewDate = formatDate(billing.currentPeriodEnd);
    body = (
      <>
        {cancelDate ? (
          <p className={settingsSectionDescription}>
            <span className="font-semibold text-text">Ends {cancelDate}</span> — you&apos;ve
            cancelled, but you keep unlimited Learn sessions until then. You can renew from
            Manage subscription.
          </p>
        ) : (
          <p className={settingsSectionDescription}>
            <span className="font-semibold text-text">Active</span> — unlimited Learn sessions.
            {renewDate ? ` Renews on ${renewDate}.` : ""}
          </p>
        )}
        <button
          type="button"
          className={secondaryBtn}
          disabled={busy}
          onClick={() => runBillingAction(openBillingPortal)}
        >
          {busy ? "Opening…" : "Manage subscription"}
        </button>
        <p className={cn(settingsSectionDescription, "mb-0 mt-3")}>
          Update your card, see invoices, or cancel.
        </p>
      </>
    );
  } else if (PAYMENT_ISSUE_STATUSES.has(billing.status)) {
    body = (
      <>
        <p className={settingsSectionDescription}>
          <span className="font-semibold text-error">Payment problem</span> — your last Learn+
          payment didn&apos;t go through, so you&apos;re on the free plan for now. Update your
          payment method to get unlimited Learn sessions back.
        </p>
        <button
          type="button"
          className={primaryBtn}
          disabled={busy}
          onClick={() => runBillingAction(openBillingPortal)}
        >
          {busy ? "Opening…" : "Update payment method"}
        </button>
      </>
    );
  } else if (justPaid) {
    body = (
      <p className={settingsSectionDescription}>
        Thanks! Your payment went through — Learn+ should switch on in a moment. Reload this
        page if it doesn&apos;t.
      </p>
    );
  } else {
    body = (
      <>
        <p className={settingsSectionDescription}>
          You&apos;re on the free plan: {FREE_DAILY_LEARN_SESSION_LIMIT} Learn sessions a day.
          Learn+ gives you unlimited Learn sessions. Test, Discover, and Go! are always free.
        </p>
        <button
          type="button"
          className={primaryBtn}
          disabled={busy}
          onClick={() => runBillingAction(startCheckout)}
        >
          {busy ? "Opening checkout…" : "Upgrade to Learn+"}
        </button>
        {billing.hasBillingAccount && (
          <button
            type="button"
            className={cn(linkBtn, "mt-3 block text-sm")}
            disabled={busy}
            onClick={() => runBillingAction(openBillingPortal)}
          >
            View billing history
          </button>
        )}
      </>
    );
  }

  return (
    <section className={settingsSection}>
      <h2 className={settingsSectionTitle}>Learn+</h2>
      {body}
      {error && <p className="mt-3 text-[0.9rem] font-medium text-error">{error}</p>}
    </section>
  );
}
