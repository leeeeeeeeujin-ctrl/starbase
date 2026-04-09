interface EmbeddedSupabaseSession {
  accessToken: string | null;
  user: Record<string, any> | null;
}

interface EmbeddedSupabaseUserInfo {
  username: string;
  email: string;
  id: string;
}

function extractSessionCandidate(value: unknown, depth = 0): EmbeddedSupabaseSession | null {
  if (depth > 6 || value == null) {
    return null;
  }

  if (typeof value === "object") {
    const candidate = value as Record<string, any>;

    if (typeof candidate.access_token === "string") {
      return {
        accessToken: candidate.access_token,
        user: typeof candidate.user === "object" && candidate.user ? candidate.user : null,
      };
    }

    for (const nestedKey of [
      "currentSession",
      "session",
      "data",
      "value",
      "persisted",
      "state",
      "auth",
    ]) {
      if (candidate[nestedKey] !== undefined) {
        const nested = extractSessionCandidate(candidate[nestedKey], depth + 1);
        if (nested?.accessToken) {
          return nested;
        }
      }
    }

    for (const nestedValue of Object.values(candidate)) {
      const nested = extractSessionCandidate(nestedValue, depth + 1);
      if (nested?.accessToken) {
        return nested;
      }
    }
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = extractSessionCandidate(item, depth + 1);
      if (nested?.accessToken) {
        return nested;
      }
    }
  }

  return null;
}

function parseStoredValue(rawValue: string): EmbeddedSupabaseSession | null {
  try {
    return extractSessionCandidate(JSON.parse(rawValue));
  } catch {
    return null;
  }
}

export function getEmbeddedSupabaseSession(): EmbeddedSupabaseSession | null {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }

  for (let i = 0; i < window.localStorage.length; i++) {
    const storageKey = window.localStorage.key(i);
    if (!storageKey) {
      continue;
    }

    if (!storageKey.includes("auth-token") && !storageKey.startsWith("sb-")) {
      continue;
    }

    const rawValue = window.localStorage.getItem(storageKey);
    if (!rawValue) {
      continue;
    }

    const session = parseStoredValue(rawValue);
    if (session?.accessToken) {
      return session;
    }
  }

  return null;
}

export function getEmbeddedSupabaseAccessToken(): string | null {
  return getEmbeddedSupabaseSession()?.accessToken ?? null;
}

export function getEmbeddedSupabaseUserInfo(): EmbeddedSupabaseUserInfo | null {
  const session = getEmbeddedSupabaseSession();
  const user = session?.user;

  if (!user) {
    return null;
  }

  const metadata = typeof user.user_metadata === "object" && user.user_metadata ? user.user_metadata : {};
  const usernameCandidates = [
    metadata.user_name,
    metadata.username,
    metadata.name,
    metadata.full_name,
    typeof user.email === "string" ? user.email.split("@")[0] : null,
    typeof user.id === "string" ? user.id.slice(0, 8) : null,
  ].filter(Boolean) as string[];

  const username = usernameCandidates[0] ?? "Player";

  return {
    username,
    email: typeof user.email === "string" ? user.email : "",
    id: typeof user.id === "string" ? user.id : "",
  };
}
