"use client";

import { cn } from "@/lib/cn";
import { getFlagUrl } from "@/lib/flags";
import { resolveAvatar } from "@/lib/avatars";
import { userAvatarColor, userAvatarFlag, userAvatarImage } from "@/lib/ui";

export default function UserAvatar({
  avatar,
  name,
  username,
  size = "md",
  className,
}) {
  const initial = (name || username || "?").charAt(0).toUpperCase();
  const resolved = resolveAvatar(avatar, { username, name });

  if (resolved.type === "image" && resolved.image) {
    return (
      <img
        src={resolved.image}
        alt=""
        aria-hidden="true"
        className={cn(userAvatarImage(size), className)}
      />
    );
  }

  if (resolved.type === "flag" && resolved.flag) {
    return (
      <span className={cn(userAvatarFlag(size), className)} aria-hidden="true">
        <img src={getFlagUrl(resolved.flag, 80)} alt="" />
      </span>
    );
  }

  return (
    <span className={cn(userAvatarColor(resolved.color, size), className)} aria-hidden="true">
      {initial}
    </span>
  );
}
