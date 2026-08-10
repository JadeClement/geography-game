const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email) {
  return email?.trim().toLowerCase() ?? "";
}

export function isValidEmail(email) {
  const normalized = normalizeEmail(email);
  return normalized.length > 0 && EMAIL_PATTERN.test(normalized);
}

export function validatePassword(password) {
  if (!password || password.length < 8) {
    return "Password must be at least 8 characters.";
  }
  return null;
}
