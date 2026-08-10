/**
 * Platform-agnostic Worldly HTTP client (Bearer token).
 * Used by the mobile app; web continues to use cookie-based relative fetch wrappers.
 */
export function createWorldlyClient({ baseURL, getToken, onUnauthorized }) {
  async function request(method, path, body) {
    const token = typeof getToken === "function" ? await getToken() : null;
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${baseURL}${path}`, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401) {
      onUnauthorized?.();
      throw new Error("Unauthorized");
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw Object.assign(new Error(err.error || err.message || "API error"), {
        status: res.status,
        body: err,
      });
    }

    if (res.status === 204) return null;
    return res.json();
  }

  return {
    login: (email, password) =>
      request("POST", "/api/mobile/auth/login", { email, password }),
    logout: () => request("POST", "/api/mobile/auth/logout"),
    refreshToken: () => request("POST", "/api/mobile/auth/refresh"),
    getMe: () => request("GET", "/api/mobile/auth/me"),

    getMastery: (mode) => request("GET", `/api/mastery?mode=${mode}`),
    getAllMastery: () => request("GET", "/api/mastery/all"),
    getWeakCountries: (mode, level, region) =>
      request(
        "GET",
        `/api/country-stats?mode=${mode}&level=${level}&region=${region}`
      ),
    recordCountryStat: (payload) => request("POST", "/api/country-stats", payload),

    getScores: () => request("GET", "/api/scores"),
    saveScore: (payload) => request("POST", "/api/scores", payload),

    getStreak: () => request("GET", "/api/streak"),
    recordSession: () => request("POST", "/api/streak"),

    getSeenFacts: (countryIds) =>
      request(
        "GET",
        `/api/learn-facts?countryIds=${(countryIds || []).join(",")}`
      ),
    markFactSeen: (countryId, factIndex) =>
      request("POST", "/api/learn-facts", { countryId, factIndex }),

    getLeaderboard: () => request("GET", "/api/leaderboard"),
    getFriends: () => request("GET", "/api/users/friends"),
    sendFriendRequest: (friendId) =>
      request("POST", "/api/users/friends", { friendId }),
    respondToFriendRequest: (requestId, action) =>
      request("PATCH", `/api/users/friend-requests/${requestId}`, { action }),
    searchUsers: (q) =>
      request("GET", `/api/users/search?q=${encodeURIComponent(q)}`),
    getProfile: () => request("GET", "/api/users/profile"),
    updateProfile: (payload) => request("PATCH", "/api/users/profile", payload),

    registerPushToken: (token, platform) =>
      request("POST", "/api/mobile/push/register", { token, platform }),

    getGameTour: () => request("GET", "/api/users/game-tour"),
    completeGameTour: () => request("POST", "/api/users/game-tour"),
  };
}
