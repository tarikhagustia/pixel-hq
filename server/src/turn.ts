// Cloudflare Calls TURN credential fetcher.
// Cloudflare TURN credentials are short-lived by design (they rotate), so we
// can't just hardcode them in ICE_SERVERS like a regular TURN server — we
// fetch fresh ones from Cloudflare's REST API and cache them until shortly
// before they expire. Falls back to the static ICE_SERVERS env var (or
// public STUN) when Cloudflare credentials aren't configured.
import type { RTCIceServerLike } from '../../shared/protocol';

// Ask Cloudflare for credentials valid this long (seconds). Cloudflare allows
// up to 86400 (24h); we refresh a bit before that so no in-flight call ever
// gets a server response with an already-expired set.
const TTL_SECONDS = 23 * 60 * 60; // 23h
const REFRESH_MARGIN_MS = 30 * 60 * 1000; // refresh 30min before expiry

let cached: { iceServers: RTCIceServerLike[]; expiresAt: number } | null = null;
let inFlight: Promise<RTCIceServerLike[]> | null = null;

function staticFallback(): RTCIceServerLike[] {
  return process.env.ICE_SERVERS
    ? JSON.parse(process.env.ICE_SERVERS)
    : [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
}

async function fetchFromCloudflare(tokenId: string, apiToken: string): Promise<RTCIceServerLike[]> {
  const res = await fetch(
    `https://rtc.live.cloudflare.com/v1/turn/keys/${tokenId}/credentials/generate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ttl: TTL_SECONDS }),
    },
  );
  if (!res.ok) {
    throw new Error(`Cloudflare TURN credential request failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { iceServers?: RTCIceServerLike | RTCIceServerLike[] };
  const servers = Array.isArray(data.iceServers) ? data.iceServers : data.iceServers ? [data.iceServers] : [];
  if (!servers.length) throw new Error('Cloudflare TURN response had no iceServers');
  return servers;
}

/** Returns current ICE servers, refreshing from Cloudflare when the cache is stale or missing. */
export async function getIceServers(): Promise<RTCIceServerLike[]> {
  // Read lazily (not as a module-level const) so this works regardless of
  // import/dotenv-config ordering — ESM hoists static imports above
  // top-of-file side effects like `config()`, so a module-level constant
  // here would always see `undefined` and silently use the fallback.
  const tokenId = process.env.CLOUDFLARE_TURN_TOKEN_ID;
  const apiToken = process.env.CLOUDFLARE_TURN_API_TOKEN;
  if (!tokenId || !apiToken) return staticFallback();

  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.iceServers;
  if (inFlight) return inFlight;

  inFlight = fetchFromCloudflare(tokenId, apiToken)
    .then((iceServers) => {
      cached = { iceServers, expiresAt: now + TTL_SECONDS * 1000 - REFRESH_MARGIN_MS };
      return iceServers;
    })
    .catch((err) => {
      console.error('[turn] Cloudflare credential fetch failed, falling back to static ICE_SERVERS:', err);
      // Don't poison the cache — try again next call. Serve the static list for now.
      return staticFallback();
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}
