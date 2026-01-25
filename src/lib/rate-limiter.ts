// Simple client-side rate limiter for Polygon API (5 calls per minute)
const RATE_LIMIT = 5;
const WINDOW_MS = 60 * 1000; // 1 minute

type CallRecord = {
  timestamp: number;
  endpoint: string;
};

// Track API calls in memory (client-side)
let apiCalls: CallRecord[] = [];

// Clean up old calls outside the window
function cleanupOldCalls() {
  const cutoff = Date.now() - WINDOW_MS;
  apiCalls = apiCalls.filter((call) => call.timestamp > cutoff);
}

// Check if we can make another API call
export function canMakeApiCall(): boolean {
  cleanupOldCalls();
  return apiCalls.length < RATE_LIMIT;
}

// Get remaining calls in current window
export function getRemainingCalls(): number {
  cleanupOldCalls();
  return Math.max(0, RATE_LIMIT - apiCalls.length);
}

// Get time until next call is available (in seconds)
export function getTimeUntilNextCall(): number {
  cleanupOldCalls();
  if (apiCalls.length < RATE_LIMIT) return 0;
  
  // Find oldest call and calculate when it expires
  const oldestCall = Math.min(...apiCalls.map((c) => c.timestamp));
  const expiresAt = oldestCall + WINDOW_MS;
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
}

// Record an API call
export function recordApiCall(endpoint: string = "unknown") {
  cleanupOldCalls();
  apiCalls.push({
    timestamp: Date.now(),
    endpoint,
  });
}

// Wrapper to make rate-limited fetch calls
export async function rateLimitedFetch(
  url: string,
  options?: RequestInit
): Promise<Response | null> {
  if (!canMakeApiCall()) {
    console.warn(`Rate limit reached. ${getTimeUntilNextCall()}s until next call available.`);
    return null;
  }
  
  recordApiCall(url);
  return fetch(url, options);
}

// Get rate limit status for display
export function getRateLimitStatus(): {
  remaining: number;
  total: number;
  resetIn: number;
} {
  cleanupOldCalls();
  return {
    remaining: getRemainingCalls(),
    total: RATE_LIMIT,
    resetIn: getTimeUntilNextCall(),
  };
}
