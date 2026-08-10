const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

export function normalizeUsername(username) {
  return username?.trim().toLowerCase() ?? "";
}

export function validateUsername(username) {
  const normalized = normalizeUsername(username);
  if (!normalized) {
    return "Username is required.";
  }
  if (normalized.length < 3) {
    return "Username must be at least 3 characters.";
  }
  if (normalized.length > 20) {
    return "Username must be at most 20 characters.";
  }
  if (!USERNAME_PATTERN.test(normalized)) {
    return "Use 3–20 letters, numbers, or underscores only.";
  }
  return null;
}

/** Build a candidate username from an email local-part. */
export function deriveUsernameFromEmail(email) {
  const local = normalizeEmailLocalPart(email);
  let candidate = local
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (candidate.length < 3) {
    candidate = `user_${candidate}`.replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  }

  if (candidate.length < 3) {
    candidate = "user";
  }

  return candidate.slice(0, 20);
}

function normalizeEmailLocalPart(email) {
  const at = email?.indexOf("@") ?? -1;
  const local = at >= 0 ? email.slice(0, at) : email ?? "";
  return local.trim().toLowerCase();
}

/** Append numeric suffixes until the candidate is valid and unused. */
export function withUsernameSuffix(base, suffix) {
  const suffixText = suffix <= 1 ? "" : String(suffix);
  const maxBaseLength = 20 - suffixText.length;
  const trimmedBase = base.slice(0, Math.max(1, maxBaseLength)).replace(/_+$/, "");
  return `${trimmedBase}${suffixText}`;
}
