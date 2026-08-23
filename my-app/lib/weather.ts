/**
 * KyaPehnu – Weather Telemetry Module
 * ─────────────────────────────────────────────────────────────────────────────
 * Anti-Gravity Rules enforced in this file:
 *
 * 1. Fail-Safe Circuit Breaker
 *    Every remote fetch is wrapped in an AbortController with a hard timeout so
 *    the application never freezes on a hanging network request.  A consecutive-
 *    failure counter (_cbFailures) trips the breaker at CB_THRESHOLD; once
 *    tripped, all live paths are skipped and MOCK_WEATHER is returned instantly
 *    until CB_RESET_MS has elapsed.  Non-200 response bodies are captured into
 *    the telemetry log as diagnostic snapshots — they never propagate as throws.
 *
 * 2. Encapsulated Memory Array States
 *    All internal mutable state (_telemetryLogs, _cbFailures, _cbOpenAt) is
 *    module-private.  Diagnostic panels receive data exclusively through
 *    read-only snapshot functions (getTelemetryLogs, getCircuitBreakerSnapshot)
 *    that return frozen copies — no live reference to internal arrays is ever
 *    exported.  Error diagnostic payloads are captured in detached
 *    TelemetryLogEntry objects; they never share identity with runtime state.
 */

export type WeatherCondition =
  | "clear"
  | "clouds"
  | "rain"
  | "drizzle"
  | "thunderstorm"
  | "snow"
  | "mist"
  | "haze";

/** Season hint derived purely from temperature — no new DB columns created. */
export type SeasonHint = "summer" | "spring" | "autumn" | "winter";

export interface WeatherPayload {
  city:        string;
  country:     string;
  tempC:       number;       // Degrees Celsius
  feelsLikeC:  number;
  condition:   WeatherCondition;
  description: string;
  humidity:    number;       // Percentage 0–100
  windKph:     number;
  season:      SeasonHint;   // Derived from tempC in-memory — schema unchanged
  isMock:      boolean;      // true = mock data, false = live telemetry
}

// ── Mock Payload — Instant, Zero API Dependency ───────────────────────────────
export const MOCK_WEATHER: WeatherPayload = {
  city:        "New Delhi",
  country:     "IN",
  tempC:       32,
  feelsLikeC:  38,
  condition:   "clear",
  description: "Clear sky",
  humidity:    45,
  windKph:     12,
  season:      "summer",
  isMock:      true,
};

// ── Telemetry Log (Rule 2: Encapsulated Memory Array State) ───────────────────
// Module-private mutable array. External code reads only through frozen snapshots
// via getTelemetryLogs(). No live reference is ever exported.
interface TelemetryLogEntry {
  ts:      string;
  level:   "warn" | "error" | "info";
  source:  string;
  message: string;
  /** Optional: captured non-200 HTTP status from a failed live path */
  httpStatus?: number;
  /** Optional: captured response body text for diagnostic panels */
  responseBody?: string;
}

const _telemetryLogs: TelemetryLogEntry[] = [];

function safeLog(
  level:   TelemetryLogEntry["level"],
  source:  string,
  message: string,
  extras?: { httpStatus?: number; responseBody?: string },
): void {
  // Build a detached entry object — no reference to any runtime mutable state
  const entry: TelemetryLogEntry = {
    ts:      new Date().toISOString(),
    level,
    source,
    message,
    ...extras,
  };
  _telemetryLogs.push(entry);
  try {
    if (level === "error") console.warn(`[${source}] (ERROR)`, message);
    else if (level === "warn")  console.warn(`[${source}]`, message);
    else                        console.info(`[${source}]`, message);
  } catch {
    // swallow — console may be unavailable in all server contexts
  }
}

/**
 * Returns a frozen read-only snapshot of the telemetry log array.
 * Diagnostic panels MUST use this function — they must never hold a live
 * reference to _telemetryLogs.
 */
export function getTelemetryLogs(): ReadonlyArray<Readonly<TelemetryLogEntry>> {
  // Spread into a new array, then freeze each entry — double isolation
  return Object.freeze(_telemetryLogs.map((e) => Object.freeze({ ...e })));
}

// ── Circuit Breaker State (Rule 1: Fail-Safe Circuit Breaker) ─────────────────
// Module-private. External code reads only through getCircuitBreakerSnapshot().
//
// States:
//   CLOSED  — normal operation, live paths attempted
//   OPEN    — breaker tripped; MOCK returned instantly until CB_RESET_MS elapses
//
// Transitions:
//   CLOSED → OPEN  : _cbFailures reaches CB_THRESHOLD
//   OPEN   → CLOSED: CB_RESET_MS has elapsed since _cbOpenAt

const CB_THRESHOLD = 3;           // consecutive failures before breaker opens
const CB_RESET_MS  = 5 * 60_000;  // 5 minutes before breaker resets to CLOSED
const FETCH_TIMEOUT_MS = 8_000;   // 8 s hard timeout per fetch (AbortController)

let _cbFailures = 0;              // consecutive live-path failure counter
let _cbOpenAt: number | null = null; // timestamp (ms) when breaker was opened

/** Circuit breaker state snapshot — read-only, suitable for diagnostic panels */
export interface CircuitBreakerSnapshot {
  readonly state:           "CLOSED" | "OPEN";
  readonly consecutiveFails: number;
  readonly openedAt:        string | null;  // ISO timestamp or null
  readonly resetsAt:        string | null;  // ISO timestamp or null
  readonly threshold:       number;
  readonly resetMs:         number;
}

/**
 * Returns a frozen read-only snapshot of the circuit breaker state.
 * No live reference to internal counters is exported.
 */
export function getCircuitBreakerSnapshot(): CircuitBreakerSnapshot {
  const isOpen = _cbOpenAt !== null;
  return Object.freeze({
    state:            isOpen ? "OPEN" : "CLOSED",
    consecutiveFails: _cbFailures,
    openedAt:         _cbOpenAt ? new Date(_cbOpenAt).toISOString() : null,
    resetsAt:         _cbOpenAt ? new Date(_cbOpenAt + CB_RESET_MS).toISOString() : null,
    threshold:        CB_THRESHOLD,
    resetMs:          CB_RESET_MS,
  });
}

/** Check breaker; auto-reset to CLOSED if reset window has elapsed. */
function isBreakerOpen(): boolean {
  if (_cbOpenAt === null) return false;
  if (Date.now() - _cbOpenAt >= CB_RESET_MS) {
    // Auto-reset: half-open → attempt live path again
    _cbFailures = 0;
    _cbOpenAt   = null;
    safeLog("info", "weather.ts/circuitBreaker",
      "Circuit breaker auto-reset to CLOSED after reset window elapsed.");
    return false;
  }
  return true;
}

/** Record a live-path success — resets the consecutive failure counter. */
function recordSuccess(): void {
  if (_cbFailures > 0 || _cbOpenAt !== null) {
    safeLog("info", "weather.ts/circuitBreaker",
      `Live fetch succeeded — resetting failure counter from ${_cbFailures} to 0.`);
  }
  _cbFailures = 0;
  _cbOpenAt   = null;
}

/** Record a live-path failure — increments counter and may open the breaker. */
function recordFailure(source: string): void {
  _cbFailures += 1;
  if (_cbFailures >= CB_THRESHOLD && _cbOpenAt === null) {
    _cbOpenAt = Date.now();
    safeLog("error", source,
      `Circuit breaker OPENED after ${_cbFailures} consecutive failures. ` +
      `MOCK_WEATHER will be returned until ${new Date(_cbOpenAt + CB_RESET_MS).toISOString()}.`);
  }
}

// ── Abort-Safe Fetch (Rule 1: hard timeout per request) ───────────────────────
/**
 * Wraps fetch with an AbortController that fires after FETCH_TIMEOUT_MS.
 * On timeout or network error, throws — callers catch and record the failure.
 * Never freezes the application thread.
 */
async function timedFetch(
  url:     string,
  options: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── Heuristic: Temperature → Season ──────────────────────────────────────────
export function tempToSeason(tempC: number): SeasonHint {
  if (tempC >= 28) return "summer";
  if (tempC >= 18) return "spring";
  if (tempC >= 10) return "autumn";
  return "winter";
}

// ── Heuristic: Weather → Occasion Preference Order ───────────────────────────
export function weatherToOccasionHints(payload: WeatherPayload): string[] {
  const { condition, tempC } = payload;
  if (condition === "rain" || condition === "drizzle" || condition === "thunderstorm") {
    return ["casual", "sport", "party", "formal"];
  }
  if (tempC > 30) return ["casual", "party", "sport", "formal"];
  if (tempC < 12) return ["formal", "casual", "party", "sport"];
  return ["casual", "formal", "party", "sport"];
}

// ── Heuristic: Tag Affinity Score ─────────────────────────────────────────────
export function tagAffinityScore(tags: string[], payload: WeatherPayload): number {
  let score = 0;
  const { tempC, condition } = payload;
  const tagSet = new Set(tags.map((t) => t.toLowerCase()));

  if (tempC > 28) {
    if (tagSet.has("casual"))    score += 2;
    if (tagSet.has("everyday"))  score += 1;
    if (tagSet.has("versatile")) score += 1;
    if (tagSet.has("cozy"))      score -= 1;
    if (tagSet.has("winter"))    score -= 2;
  }
  if (tempC < 15) {
    if (tagSet.has("cozy"))      score += 3;
    if (tagSet.has("classic"))   score += 1;
    if (tagSet.has("layered"))   score += 2;
    if (tagSet.has("casual"))    score += 1;
    if (tagSet.has("versatile")) score += 1;
  }
  if (condition === "rain" || condition === "drizzle") {
    if (tagSet.has("formal"))    score -= 1;
    if (tagSet.has("casual"))    score += 1;
    if (tagSet.has("sport"))     score += 1;
  }
  if (tagSet.has("versatile"))   score += 1;
  if (tagSet.has("smart-casual")) score += 1;
  return score;
}

// ── One Call 3.0 response parser ──────────────────────────────────────────────
function parseOneCall(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>,
  cityName: string,
): WeatherPayload {
  const current    = data.current ?? {};
  const weatherArr = current.weather ?? [];
  const first      = weatherArr[0] ?? {};
  const rawCond    = (first.main ?? "clear").toLowerCase();
  const known: WeatherCondition[] = [
    "clear","clouds","rain","drizzle","thunderstorm","snow","mist","haze",
  ];
  const condition: WeatherCondition = known.includes(rawCond as WeatherCondition)
    ? (rawCond as WeatherCondition)
    : "clear";
  const tempC      = Math.round(current.temp       ?? MOCK_WEATHER.tempC);
  const feelsLikeC = Math.round(current.feels_like ?? tempC);
  const humidity   = current.humidity  ?? MOCK_WEATHER.humidity;
  const windMs     = current.wind_speed ?? 0;
  return {
    city:        cityName,
    country:     data.timezone?.split("/")[0] ?? "",
    tempC,
    feelsLikeC,
    condition,
    description: first.description ?? "",
    humidity,
    windKph:     Math.round(windMs * 3.6),
    season:      tempToSeason(tempC),
    isMock:      false,
  };
}

// ── Geocoding helper ──────────────────────────────────────────────────────────
async function geocodeCity(
  city:   string,
  apiKey: string,
): Promise<{ lat: number; lon: number } | null> {
  try {
    const url =
      "https://api.openweathermap.org/geo/1.0/direct" +
      `?q=${encodeURIComponent(city)}&limit=1&appid=${apiKey}`;
    const res = await timedFetch(url, { next: { revalidate: 86400 } } as RequestInit);
    if (!res.ok) {
      const body = await res.text().catch(() => "(unreadable)");
      safeLog("warn", "weather.ts/geocode",
        `Geocoding HTTP ${res.status} for city="${city}"`,
        { httpStatus: res.status, responseBody: body.slice(0, 300) });
      return null;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const arr: any[] = await res.json();
    if (!Array.isArray(arr) || arr.length === 0) return null;
    return { lat: arr[0].lat, lon: arr[0].lon };
  } catch (err) {
    safeLog("warn", "weather.ts/geocode",
      `Geocoding exception for city="${city}": ${(err as Error).message}`);
    return null;
  }
}

// ── Main Fetcher: Mock-First, Live One Call 3.0 ───────────────────────────────
/**
 * Priority chain (zero freeze on any failure):
 *   1. No key                → MOCK_WEATHER instantly (zero network)
 *   2. Breaker OPEN          → MOCK_WEATHER instantly (zero network)
 *   3. Key present + CLOSED  → Geocode → One Call 3.0
 *   4. One Call fails        → Legacy 2.5 fallback
 *   5. All live paths fail   → MOCK_WEATHER + circuit breaker records failure
 *
 * Timeouts: every fetch is bounded by FETCH_TIMEOUT_MS via AbortController.
 * Non-200 bodies: captured as responseBody in TelemetryLogEntry (read-only).
 */
export async function getWeather(city = "New Delhi"): Promise<WeatherPayload> {
  const apiKey = process.env.NEXT_PUBLIC_OPENWEATHER_KEY;

  if (!apiKey) {
    safeLog("info", "weather.ts/getWeather",
      "No API key — returning MOCK_WEATHER. Set NEXT_PUBLIC_OPENWEATHER_KEY to enable live telemetry.");
    return { ...MOCK_WEATHER };
  }

  // ── Circuit breaker gate ──────────────────────────────────────────────────
  if (isBreakerOpen()) {
    safeLog("warn", "weather.ts/getWeather",
      `Circuit breaker is OPEN — returning MOCK_WEATHER immediately. ` +
      `Resets at ${getCircuitBreakerSnapshot().resetsAt}.`);
    return { ...MOCK_WEATHER };
  }

  // ── Live path 1: One Call 3.0 ─────────────────────────────────────────────
  try {
    const coords = await geocodeCity(city, apiKey);
    if (coords) {
      const url =
        "https://api.openweathermap.org/data/3.0/onecall" +
        `?lat=${coords.lat}&lon=${coords.lon}` +
        `&appid=${apiKey}&units=metric` +
        `&exclude=minutely,hourly,daily,alerts`;

      const res = await timedFetch(url, { next: { revalidate: 1800 } } as RequestInit);

      if (res.ok) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: Record<string, any> = await res.json();
        recordSuccess();
        safeLog("info", "weather.ts/getWeather",
          `One Call 3.0 live fetch OK for city="${city}" (lat=${coords.lat}, lon=${coords.lon})`);
        return parseOneCall(data, city);
      }

      // Non-200: capture body into telemetry log (encapsulated, never thrown)
      const body = await res.text().catch(() => "(unreadable)");
      safeLog("warn", "weather.ts/getWeather",
        `One Call 3.0 HTTP ${res.status} — trying legacy 2.5 fallback`,
        { httpStatus: res.status, responseBody: body.slice(0, 300) });
    }
  } catch (err) {
    safeLog("warn", "weather.ts/getWeather",
      `One Call 3.0 exception: ${(err as Error).message} — trying legacy 2.5 fallback`);
  }

  // ── Live path 2: legacy data/2.5/weather ─────────────────────────────────
  try {
    const url =
      "https://api.openweathermap.org/data/2.5/weather" +
      `?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric`;

    const res = await timedFetch(url, { next: { revalidate: 1800 } } as RequestInit);

    if (!res.ok) {
      const body = await res.text().catch(() => "(unreadable)");
      safeLog("warn", "weather.ts/getWeather",
        `Legacy 2.5 HTTP ${res.status}`,
        { httpStatus: res.status, responseBody: body.slice(0, 300) });
      throw new Error(`Legacy API HTTP ${res.status}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: Record<string, any> = await res.json();
    const rawCond = ((data.weather?.[0]?.main ?? "clear") as string).toLowerCase();
    const known: WeatherCondition[] = [
      "clear","clouds","rain","drizzle","thunderstorm","snow","mist","haze",
    ];
    const condition: WeatherCondition = known.includes(rawCond as WeatherCondition)
      ? (rawCond as WeatherCondition)
      : "clear";
    const tempC = Math.round(data.main?.temp ?? 25);

    recordSuccess();
    safeLog("info", "weather.ts/getWeather", `Legacy 2.5 fetch OK for city="${city}"`);

    return {
      city:        data.name ?? city,
      country:     data.sys?.country ?? "",
      tempC,
      feelsLikeC:  Math.round(data.main?.feels_like ?? tempC),
      condition,
      description: data.weather?.[0]?.description ?? "",
      humidity:    data.main?.humidity ?? 0,
      windKph:     Math.round((data.wind?.speed ?? 0) * 3.6),
      season:      tempToSeason(tempC),
      isMock:      false,
    };
  } catch (err) {
    // All live paths failed — record failure, update circuit breaker, return MOCK
    recordFailure("weather.ts/getWeather");
    safeLog("error", "weather.ts/getWeather",
      `All live paths failed for city="${city}": ${(err as Error).message} — returning MOCK_WEATHER`);
    return { ...MOCK_WEATHER };
  }
}

// ── Live Coordinates → Weather Payload ─────────────────────────────────────────
export async function getWeatherByCoords(lat: number, lon: number): Promise<WeatherPayload> {
  const apiKey = process.env.NEXT_PUBLIC_OPENWEATHER_KEY;

  if (!apiKey) {
    safeLog("info", "weather.ts/getWeatherByCoords", "No API key — returning MOCK_WEATHER.");
    return { ...MOCK_WEATHER };
  }

  if (isBreakerOpen()) {
    return { ...MOCK_WEATHER };
  }

  try {
    // Reverse Geocoding to get City Name
    let cityName = "Unknown Location";
    try {
      const geoUrl = `https://api.openweathermap.org/geo/1.0/reverse?lat=${lat}&lon=${lon}&limit=1&appid=${apiKey}`;
      const geoRes = await timedFetch(geoUrl);
      if (geoRes.ok) {
        const geoData = await geoRes.json();
        if (geoData && geoData.length > 0) {
          const loc = geoData[0];
          cityName = loc.name;
          if (loc.state) cityName += `, ${loc.state}`;
        }
      }
    } catch (e) {
      // Ignore geo errors
    }

    // Try One Call 3.0 First
    const url3 = `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric&exclude=minutely,hourly,daily,alerts`;
    const res3 = await timedFetch(url3);
    
    if (res3.ok) {
      const data = await res3.json();
      recordSuccess();
      return parseOneCall(data, cityName);
    }
    
    // Fallback to 2.5
    const url25 = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;
    const res25 = await timedFetch(url25);
    
    if (res25.ok) {
      const data = await res25.json();
      recordSuccess();
      const rawCond = ((data.weather?.[0]?.main ?? "clear") as string).toLowerCase();
      const known: WeatherCondition[] = ["clear","clouds","rain","drizzle","thunderstorm","snow","mist","haze"];
      const condition = known.includes(rawCond as WeatherCondition) ? (rawCond as WeatherCondition) : "clear";
      const tempC = Math.round(data.main?.temp ?? 25);
      
      return {
        city: cityName !== "Unknown Location" ? cityName : (data.name || cityName),
        country: data.sys?.country ?? "",
        tempC,
        feelsLikeC: Math.round(data.main?.feels_like ?? tempC),
        condition,
        description: data.weather?.[0]?.description ?? "",
        humidity: data.main?.humidity ?? 0,
        windKph: Math.round((data.wind?.speed ?? 0) * 3.6),
        season: tempToSeason(tempC),
        isMock: false,
      };
    }
    
    throw new Error("Both 3.0 and 2.5 failed");
  } catch (err) {
    recordFailure("weather.ts/getWeatherByCoords");
    safeLog("error", "weather.ts/getWeatherByCoords", `Failed for ${lat},${lon}: ${(err as Error).message}`);
    return { ...MOCK_WEATHER };
  }
}


// ── Coords → Season Array ─────────────────────────────────────────────────────
/**
 * Priority chain (zero freeze on any failure):
 *   1. No key                → mock season array instantly
 *   2. Breaker OPEN          → mock season array instantly
 *   3. Key present + CLOSED  → One Call 3.0 lat/lon
 *   4. One Call fails        → Legacy 2.5 lat/lon
 *   5. All live paths fail   → mock season array + circuit breaker records failure
 */
export async function coordsToSeasons(
  lat: number,
  lon: number,
): Promise<SeasonHint[]> {
  const apiKey =
    process.env.OPENWEATHER_KEY ??
    process.env.NEXT_PUBLIC_OPENWEATHER_KEY;

  if (!apiKey) {
    safeLog("info", "weather.ts/coordsToSeasons", "No API key — using MOCK season array.");
    return buildSeasonArray(MOCK_WEATHER.season);
  }

  // ── Circuit breaker gate ──────────────────────────────────────────────────
  if (isBreakerOpen()) {
    safeLog("warn", "weather.ts/coordsToSeasons",
      `Circuit breaker OPEN — returning MOCK season array. ` +
      `Resets at ${getCircuitBreakerSnapshot().resetsAt}.`);
    return buildSeasonArray(MOCK_WEATHER.season);
  }

  // ── Live path 1: One Call 3.0 ─────────────────────────────────────────────
  try {
    const url =
      "https://api.openweathermap.org/data/3.0/onecall" +
      `?lat=${lat}&lon=${lon}` +
      `&appid=${apiKey}&units=metric` +
      `&exclude=minutely,hourly,daily,alerts`;

    const res = await timedFetch(url, { next: { revalidate: 1800 } } as RequestInit);

    if (res.ok) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: Record<string, any> = await res.json();
      const tempC = Math.round(data.current?.temp ?? MOCK_WEATHER.tempC);
      recordSuccess();
      safeLog("info", "weather.ts/coordsToSeasons",
        `One Call 3.0 OK (lat=${lat}, lon=${lon}) → tempC=${tempC}`);
      return buildSeasonArray(tempToSeason(tempC));
    }

    const body = await res.text().catch(() => "(unreadable)");
    safeLog("warn", "weather.ts/coordsToSeasons",
      `One Call 3.0 HTTP ${res.status} for (${lat},${lon}) — trying 2.5 fallback`,
      { httpStatus: res.status, responseBody: body.slice(0, 300) });
  } catch (err) {
    safeLog("warn", "weather.ts/coordsToSeasons",
      `One Call 3.0 exception for (${lat},${lon}): ${(err as Error).message}`);
  }

  // ── Live path 2: legacy data/2.5/weather ─────────────────────────────────
  try {
    const url =
      "https://api.openweathermap.org/data/2.5/weather" +
      `?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;

    const res = await timedFetch(url, { next: { revalidate: 1800 } } as RequestInit);

    if (!res.ok) {
      const body = await res.text().catch(() => "(unreadable)");
      safeLog("warn", "weather.ts/coordsToSeasons",
        `Legacy 2.5 HTTP ${res.status} for (${lat},${lon})`,
        { httpStatus: res.status, responseBody: body.slice(0, 300) });
      throw new Error(`Legacy 2.5 HTTP ${res.status} for (${lat}, ${lon})`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: Record<string, any> = await res.json();
    const tempC = Math.round(data.main?.temp ?? MOCK_WEATHER.tempC);
    recordSuccess();
    safeLog("info", "weather.ts/coordsToSeasons",
      `Legacy 2.5 OK (lat=${lat}, lon=${lon}) → tempC=${tempC}`);
    return buildSeasonArray(tempToSeason(tempC));
  } catch (err) {
    recordFailure("weather.ts/coordsToSeasons");
    safeLog("error", "weather.ts/coordsToSeasons",
      `All live paths failed for (${lat},${lon}): ${(err as Error).message} — using mock fallback`);
    return buildSeasonArray(MOCK_WEATHER.season);
  }
}

// ── Season array builder ──────────────────────────────────────────────────────
function buildSeasonArray(primary: SeasonHint): SeasonHint[] {
  const adjacency: Record<SeasonHint, SeasonHint> = {
    summer: "spring",
    spring: "summer",
    autumn: "winter",
    winter: "autumn",
  };
  const seasons: SeasonHint[] = [primary, adjacency[primary]];
  return [...new Set([...seasons, "all" as SeasonHint])];
}
