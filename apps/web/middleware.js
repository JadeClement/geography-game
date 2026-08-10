import { NextResponse } from "next/server";

const ALLOWED_ORIGINS = new Set([
  "https://beworldly.app",
  "http://localhost:3000",
  "https://expo.dev",
]);

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  // Expo dev client: exp://localhost:* (and common LAN variants)
  if (/^exp:\/\/localhost(?::\d+)?$/i.test(origin)) return true;
  if (/^exp:\/\/127\.0\.0\.1(?::\d+)?$/i.test(origin)) return true;
  // Expo Go / Metro bundler during local development
  if (/^http:\/\/localhost:\d+$/i.test(origin)) return true;
  if (/^http:\/\/127\.0\.0\.1:\d+$/i.test(origin)) return true;
  return false;
}

function corsHeaders(origin) {
  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
  if (origin && isAllowedOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

export function middleware(request) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 200, headers });
  }

  const response = NextResponse.next();
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  return response;
}

export const config = {
  matcher: "/api/:path*",
};
