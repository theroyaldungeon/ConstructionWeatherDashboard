export type SiteForecast = {
  source: "NOAA" | "demo";
  periods: Array<{ name: string; rainChance: number; summary?: string }>;
};

const fallback: SiteForecast = {
  source: "demo",
  periods: [
    { name: "Monday", rainChance: 72, summary: "Heavy rain" },
    { name: "Tuesday", rainChance: 88, summary: "Thunderstorms" },
    { name: "Wednesday", rainChance: 64, summary: "Showers" },
    { name: "Thursday", rainChance: 42, summary: "Scattered rain" },
    { name: "Friday", rainChance: 28, summary: "Partly cloudy" },
  ],
};

// Shark Valley / Tram Road temporary project reference: 25.76, -80.77.
// NOAA is intentionally called without a secret. Gemini must be called only
// from a protected server function; never expose its key in VITE_* variables.
export async function getSharkValleyForecast(): Promise<SiteForecast> {
  try {
    const point = await fetch("https://api.weather.gov/points/25.76,-80.77", {
      headers: { Accept: "application/geo+json" },
    });
    if (!point.ok) return fallback;
    const pointData = await point.json();
    const forecastUrl = pointData?.properties?.forecast;
    if (!forecastUrl) return fallback;
    const response = await fetch(forecastUrl, { headers: { Accept: "application/geo+json" } });
    if (!response.ok) return fallback;
    const data = await response.json();
    return {
      source: "NOAA",
      periods: (data?.properties?.periods ?? []).filter((period: { isDaytime?: boolean }) => period.isDaytime).slice(0, 5).map((period: { name: string; probabilityOfPrecipitation?: { value?: number }; shortForecast?: string }) => ({
        name: period.name,
        rainChance: period.probabilityOfPrecipitation?.value ?? 0,
        summary: period.shortForecast,
      })),
    };
  } catch {
    return fallback;
  }
}
