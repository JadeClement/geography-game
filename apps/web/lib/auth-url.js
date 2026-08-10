let warnedMissingAuthUrl = false;

function normalizeBaseUrl(url) {
  return url.replace(/\/$/, "");
}

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function getBaseUrlFromRequest(request) {
  if (!request) return null;

  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "http";

  if (host) {
    return `${proto}://${host}`;
  }

  return null;
}

export function getAppBaseUrl(request) {
  if (process.env.AUTH_URL) {
    return normalizeBaseUrl(process.env.AUTH_URL);
  }

  if (isProduction()) {
    if (!warnedMissingAuthUrl) {
      warnedMissingAuthUrl = true;
      console.warn(
        "[auth-url] AUTH_URL is not set in production. Set AUTH_URL to your public app origin (e.g. https://your-domain.com)."
      );
    }
    throw new Error("AUTH_URL must be set in production");
  }

  const fromRequest = getBaseUrlFromRequest(request);
  if (fromRequest) {
    return normalizeBaseUrl(fromRequest);
  }

  if (process.env.VERCEL_URL) {
    return normalizeBaseUrl(`https://${process.env.VERCEL_URL}`);
  }

  return "http://localhost:3000";
}
