"use client";

import { useEffect, useState } from "react";
import { friendToast, friendToastSubtitle, friendToastTitle } from "@/lib/ui";

const VISIBLE_MS = 3200;
const FADE_MS = 400;

export default function FriendAddedToast({ friend, onDismiss }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!friend) return undefined;

    setLeaving(false);
    const hideTimer = window.setTimeout(() => setLeaving(true), VISIBLE_MS);
    const dismissTimer = window.setTimeout(() => onDismiss?.(), VISIBLE_MS + FADE_MS);

    return () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(dismissTimer);
    };
  }, [friend, onDismiss]);

  if (!friend) return null;

  return (
    <div
      className={`${friendToast} ${leaving ? "opacity-0" : "opacity-100"}`}
      role="status"
      aria-live="polite"
      onClick={() => {
        setLeaving(true);
        window.setTimeout(() => onDismiss?.(), FADE_MS);
      }}
    >
      <p className={friendToastTitle}>{friend.name} is now your friend!</p>
      <p className={friendToastSubtitle}>(and your competition:))</p>
    </div>
  );
}
