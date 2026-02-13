import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Map Open-Meteo WMO weather_code to short condition. */
function weatherCodeToCondition(code: number): string {
  if (code === 0) return "sunny";
  if (code >= 1 && code <= 3) return "partly cloudy";
  if (code >= 4 && code <= 49) return "cloudy";
  if (code === 45 || code === 48) return "foggy";
  if (code >= 51 && code <= 67) return "rainy";
  if (code >= 71 && code <= 77) return "snowy";
  if (code >= 80 && code <= 82) return "rainy";
  if (code >= 85 && code <= 86) return "snowy";
  if (code >= 95 && code <= 99) return "stormy";
  return "cloudy";
}

/** GET /api/weather — Returns current weather condition (server-side fetch to avoid CORS/ad-blocker). */
export async function GET() {
  try {
    const lat = 40.7128;
    const lon = -74.006;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=weather_code&timezone=America/New_York`;
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) {
      return NextResponse.json({ condition: null });
    }
    const data = (await res.json()) as { current?: { weather_code?: number } };
    const code = data.current?.weather_code;
    const condition = typeof code === "number" ? weatherCodeToCondition(code) : null;
    return NextResponse.json({ condition });
  } catch {
    return NextResponse.json({ condition: null });
  }
}
