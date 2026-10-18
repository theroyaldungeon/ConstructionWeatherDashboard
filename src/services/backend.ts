import { projectId, publicAnonKey } from "../../utils/supabase/info";

const baseUrl = `https://${projectId}.supabase.co/functions/v1/make-server-f1fd0577`;

type TokenProvider = () => Promise<string | null>;

export type LiveWeather = {
  source: string;
  issuedAt: string;
  current: {
    temperatureF: number | null;
    heatIndexF: number | null;
    humidityPercent: number | null;
    windMph: number | null;
    windDirection: string | null;
    rainProbabilityPercent: number | null;
    shortForecast: string | null;
  };
  forecast: Array<{
    name?: string;
    startTime?: string;
    temperature?: number;
    temperatureUnit?: string;
    windSpeed?: string;
    rainProbabilityPercent?: number | null;
    shortForecast?: string;
  }>;
  activeAlerts: Array<{
    id?: string;
    event?: string;
    severity?: string;
    headline?: string;
    instruction?: string;
    expires?: string;
  }>;
};

export type AIAnalysis = {
  weatherImpact: {
    summary: string;
    riskLevel: "low" | "moderate" | "high" | "extreme";
    predictedLostHours: number;
    predictedDelayDays: number;
    confidence: number;
  };
  hazardTrends: Array<{
    hazard: string;
    changePercent: number;
    hotspotSector: string;
    observation: string;
    recommendedMitigation: string;
  }>;
  recommendedActions: Array<{
    title: string;
    description: string;
    priority: "low" | "medium" | "high";
    requiresSupervisorApproval: boolean;
  }>;
};

async function headers(getToken: TokenProvider) {
  const token = await getToken();
  if (!token) throw new Error("No Clerk session token");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${publicAnonKey}`,
    "X-Clerk-JWT": token,
  };
}

export async function loadReports<T>(getToken: TokenProvider): Promise<T[] | null> {
  const response = await fetch(`${baseUrl}/reports`, {
    headers: await headers(getToken),
  });
  if (!response.ok) throw new Error("Unable to load reports");
  const data = await response.json();
  return data.reports;
}

export async function saveReports<T>(getToken: TokenProvider, reports: T[]) {
  const response = await fetch(`${baseUrl}/reports`, {
    method: "PUT",
    headers: await headers(getToken),
    body: JSON.stringify({ reports }),
  });
  if (!response.ok) throw new Error("Unable to save reports");
}

export async function testGeminiConnection(getToken: TokenProvider): Promise<{ status: string; model?: string; message?: string }> {
  const response = await fetch(`${baseUrl}/gemini/health`, {
    method: "POST",
    headers: await headers(getToken),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? "Unable to connect to Gemini");
  return data;
}

export async function loadCurrentWeather(getToken: TokenProvider): Promise<{ weather: LiveWeather; status: string; cachedAt?: string }> {
  const response = await fetch(`${baseUrl}/weather/current`, {
    headers: await headers(getToken),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? "Unable to load NOAA weather");
  return data;
}

export async function loadLatestAnalysis(getToken: TokenProvider): Promise<{ analysis: AIAnalysis; model: string; generatedAt: string } | null> {
  const response = await fetch(`${baseUrl}/analysis/latest`, {
    headers: await headers(getToken),
  });
  if (response.status === 404) return null;
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? "Unable to load AI analysis");
  return data;
}

export async function runDynamicAnalysis(getToken: TokenProvider): Promise<{ analysis: AIAnalysis; model: string; generatedAt: string }> {
  const response = await fetch(`${baseUrl}/analysis/run`, {
    method: "POST",
    headers: await headers(getToken),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? "Unable to run AI analysis");
  return data;
}
