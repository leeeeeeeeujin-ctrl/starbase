import { globalManifest } from "#app/global-manifest";

function isAbsoluteUrl(url: string): boolean {
  return /^(?:[a-z]+:)?\/\//i.test(url) || url.startsWith("data:");
}

function toBaseUrl(url: string): string {
  if (isAbsoluteUrl(url)) {
    return url;
  }

  const cleaned = url.replace(/^\.\//, "").replace(/^\//, "");
  const base = import.meta.env.BASE_URL || "/";
  return `${base.replace(/\/?$/, "/")}${cleaned}`;
}

export function getCachedUrl(url: string): string {
  if (isAbsoluteUrl(url)) {
    return url;
  }

  const manifest = globalManifest;
  const cleaned = url.replace(/^\.\//, "").replace(/^\//, "");
  const resolvedUrl = toBaseUrl(cleaned);
  if (!manifest) {
    return resolvedUrl;
  }

  const normalizedUrl = `/${cleaned}`;
  const timestamp = manifest[normalizedUrl];
  if (timestamp) {
    return `${resolvedUrl}?t=${timestamp}`;
  }
  return resolvedUrl;
}

export function cachedFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(getCachedUrl(url), init);
}
