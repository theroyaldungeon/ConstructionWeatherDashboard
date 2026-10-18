import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bell,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  CloudRain,
  Copy,
  Droplets,
  ExternalLink,
  FileText,
  Flame,
  Home,
  Link,
  Lock,
  Mail,
  MapPin,
  Menu,
  Plus,
  Search,
  Settings,
  ShieldAlert,
  Siren,
  ThumbsDown,
  ThumbsUp,
  UserPlus,
  Users,
  Wind,
  X,
} from "lucide-react";
import { AuthenticateWithRedirectCallback, useAuth, useClerk, useUser } from "@clerk/react";
import { useSignIn } from "@clerk/react/legacy";
import { loadCurrentWeather, loadLatestAnalysis, loadReports, runDynamicAnalysis, saveReports, testGeminiConnection, type AIAnalysis, type LiveWeather } from "./services/backend";

type Role = "worker" | "boss";
type Severity = "beware" | "pause" | "evacuate";
type HazardType = "Wildlife" | "Electrical" | "Flooding" | "Site safety" | "Weather";
type Page = "home" | "weather" | "alerts" | "team" | "more" | "safety" | "schedule" | "settings" | "about";

type FieldReport = {
  id: number;
  type: HazardType;
  detail: string;
  location: string;
  time: string;
  severity: Severity;
  status: "Pending supervisor" | "Active alert" | "AI resolved" | "Supervisor resolved";
  evidence?: string;
  unread?: boolean;
  source?: "worker" | "supervisor" | "AI";
  createdAt: number;
  resolvedAt?: number;
  alertDescription?: string;
  resolution?: string;
  groupCount?: number;
  evidenceCount?: number;
};

type TimeOffRequest = {
  id: number;
  worker: string;
  type: "Sick day" | "Vacation";
  start: string;
  end: string;
  note: string;
  status: "Pending" | "Approved" | "Declined";
};

const initialTimeOffRequests: TimeOffRequest[] = [
  { id: 1, worker: "Elena Ruiz", type: "Vacation", start: "2026-08-19", end: "2026-08-21", note: "Family travel", status: "Pending" },
  { id: 2, worker: "Devon Brooks", type: "Sick day", start: "2026-08-18", end: "2026-08-18", note: "Medical recovery", status: "Approved" },
];

const initialReports: FieldReport[] = [
  { id: 1, type: "Wildlife", detail: "American alligator near access road", location: "Sector B · Mile 4.2", time: "12 min ago", severity: "pause", status: "Supervisor resolved", unread: true, source: "supervisor", createdAt: Date.now() - 12 * 60_000, resolvedAt: Date.now() - 4 * 60_000, alertDescription: "Keep 50 feet away and use the north access road.", resolution: "Wildlife officer relocated the animal and cleared the road.", groupCount: 4, evidenceCount: 3 },
  { id: 2, type: "Electrical", detail: "Downed line near pump station", location: "Sector D · Pump 3", time: "31 min ago", severity: "evacuate", status: "Supervisor resolved", unread: true, source: "supervisor", evidence: "Photo attached", createdAt: Date.now() - 31 * 60_000, resolvedAt: Date.now() - 15 * 60_000, alertDescription: "Evacuate Pump 3 and maintain the electrical exclusion zone.", resolution: "Utility owner isolated the circuit; qualified electrician confirmed zero energy.", groupCount: 3, evidenceCount: 2 },
  { id: 3, type: "Flooding", detail: "Water rising over marked threshold", location: "Sector C · South trench", time: "4 min ago", severity: "beware", status: "Pending supervisor", unread: true, source: "worker", evidence: "Photo attached", createdAt: Date.now() - 4 * 60_000, groupCount: 2, evidenceCount: 2 },
  { id: 4, type: "Site safety", detail: "Loose materials reported after wind alert", location: "Sector A · Staging", time: "Yesterday", severity: "beware", status: "AI resolved", source: "AI", createdAt: Date.now() - 25 * 60 * 60_000, resolvedAt: Date.now() - 24.9 * 60 * 60_000, resolution: "Merged as a duplicate of alert #FC-1042; no second alert was sent.", groupCount: 6, evidenceCount: 1 },
  { id: 5, type: "Weather", detail: "Lightning cell entered the 10-mile safety radius", location: "All sectors", time: "2 hours ago", severity: "pause", status: "AI resolved", source: "AI", createdAt: Date.now() - 2 * 60 * 60_000, resolvedAt: Date.now() - 92 * 60_000, alertDescription: "NOAA forecast and local detection require an outdoor work pause.", resolution: "Automated all-clear after the required lightning-free interval.", groupCount: 1, evidenceCount: 0 },
];

const shifts = [
  { day: "Mon", date: "17", title: "Culvert inspection", time: "7:00 AM–3:30 PM", sector: "West · Sector A" },
  { day: "Tue", date: "18", title: "Pump station forms", time: "7:00 AM–3:30 PM", sector: "North · Sector D" },
  { day: "Wed", date: "19", title: "Storm preparation", time: "6:30 AM–2:30 PM", sector: "Main staging" },
  { day: "Thu", date: "20", title: "Drainage trench", time: "7:00 AM–3:30 PM", sector: "South · Sector C" },
  { day: "Fri", date: "21", title: "Equipment maintenance", time: "7:30 AM–2:00 PM", sector: "Service yard" },
];

const escalation = [
  { level: "Evacuate", time: "2 minutes", reason: "Immediate threat to life: energized lines, fire, structural collapse." },
  { level: "Pause work", time: "5 minutes", reason: "Serious localized hazard: wildlife, lightning proximity, unsafe equipment." },
  { level: "Beware", time: "15 minutes", reason: "Monitor-level condition that does not require an immediate shutdown." },
];

const severityStyles: Record<Severity, string> = {
  beware: "bg-amber-100 text-amber-900 border-amber-200",
  pause: "bg-orange-100 text-orange-900 border-orange-200",
  evacuate: "bg-red-100 text-red-900 border-red-200",
};

const severityLabel: Record<Severity, string> = { beware: "Beware", pause: "Pause work", evacuate: "Evacuate" };

function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

function elapsedLabel(timestamp: number, now: number) {
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function Button({ children, className = "", variant = "primary", onClick, disabled = false }: { children: ReactNode; className?: string; variant?: "primary" | "secondary" | "ghost" | "danger"; onClick?: () => void; disabled?: boolean }) {
  const variants = {
    primary: "bg-[#173f35] text-white hover:bg-[#0f3028]",
    secondary: "bg-white text-[#173f35] border border-[#d8dfd8] hover:bg-[#f4f7f4]",
    ghost: "text-[#415d55] hover:bg-[#edf2ee]",
    danger: "bg-[#dc4c34] text-white hover:bg-[#c53e29]",
  };
  return <button disabled={disabled} onClick={onClick} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold shadow-sm transition active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}>{children}</button>;
}

function Brand() {
  return <div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-[#173f35] text-white"><span className="text-lg font-extrabold tracking-tighter">FC</span></div><div><div className="text-[15px] font-extrabold tracking-tight text-[#173f35]">FIELDCAST</div><div className="text-[10px] font-bold uppercase tracking-[.16em] text-[#71837d]">Everglades operations</div></div></div>;
}

function Header({ role, unread, onBell, onLogo, onProfile }: { role: Role; unread: number; onBell: () => void; onLogo: () => void; onProfile: () => void }) {
  return (
    <header className="sticky top-0 z-30 border-b border-[#dfe5df] bg-[#f7f8f4]/95 backdrop-blur">
      <div className="mx-auto flex h-17 max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-8">
        <button onClick={onLogo} aria-label="About FieldCast" className="rounded-xl text-left"><Brand /></button>
        <div className="flex items-center gap-2">
          <button onClick={onBell} aria-label={`${unread} unread notifications`} className="relative grid size-11 place-items-center rounded-xl text-[#415d55] hover:bg-[#e9eeea]">
            <Bell size={19} />
            {unread > 0 && <span className="absolute right-1.5 top-1.5 grid min-w-5 place-items-center rounded-full bg-[#e65b3d] px-1 text-[10px] font-extrabold text-white ring-2 ring-[#f7f8f4]">{unread}</span>}
          </button>
          <button onClick={onProfile} aria-label="Open account settings" className="grid size-10 place-items-center rounded-full bg-[#d9e9df] text-xs font-extrabold text-[#173f35] ring-offset-2 hover:ring-2 hover:ring-[#9db9ac]">{role === "boss" ? "JR" : "MJ"}</button>
        </div>
      </div>
    </header>
  );
}

function FloodVisualizer() {
  return (
    <div className="relative h-64 overflow-hidden rounded-2xl bg-[#e8f2f3]">
      <div className="absolute inset-x-0 bottom-0 h-[30%] bg-[#70aeb8]/70"><div className="absolute -top-2 inset-x-0 h-4 rounded-[50%] bg-[#91c4cb]" /></div>
      <svg viewBox="0 0 140 200" className="absolute bottom-2 left-1/2 h-56 -translate-x-1/2 text-[#24483f]" fill="none" aria-label="Five-foot construction worker next to eighteen inches of water">
        <path d="M49 25 Q70 3 91 25 M47 27 H93 M55 27 C55 6 85 6 85 27" fill="#e7a93f" stroke="#24483f" strokeWidth="5" strokeLinejoin="round" />
        <circle cx="70" cy="43" r="15" stroke="currentColor" strokeWidth="7" />
        <path d="M58 59 L47 101 M82 59 L94 101 M58 62 C61 81 58 101 55 122 L44 185 M82 62 C79 81 82 101 85 122 L96 185 M56 122 H85" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="absolute bottom-3 right-3 top-3 flex w-11 flex-col justify-between border-l-2 border-[#315f64] py-1 text-[9px] font-extrabold text-[#315f64]">
        {["5 ft", "4 ft", "3 ft", "2 ft", "1 ft", "0"].map((mark) => <span key={mark} className="-ml-1 flex items-center gap-1 before:h-px before:w-2 before:bg-[#315f64]">{mark}</span>)}
      </div>
      <div className="absolute left-3 top-3 rounded-lg bg-white/90 px-2.5 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-[#315f64]">Worker height: 5 ft</div>
      <div className="absolute bottom-[27%] left-3 rounded-lg bg-[#173f35] px-2.5 py-1.5 text-xs font-bold text-white">Water: 18 in</div>
    </div>
  );
}

function WorkerHome({ reports, onReport, go, checklist, onToggleChecklist, weather }: { reports: FieldReport[]; onReport: () => void; go: (page: Page) => void; checklist: boolean[]; onToggleChecklist: (index: number) => void; weather?: LiveWeather | null }) {
  const pending = reports.filter((report) => report.status === "Pending supervisor");
  return (
    <div className="space-y-7">
      <section className="overflow-hidden rounded-3xl bg-[#173f35] p-5 text-white shadow-[0_12px_35px_rgba(25,59,50,.18)] sm:p-8">
        <div className="max-w-2xl"><div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold"><span className="size-2 rounded-full bg-[#ffcc67]" />Conditions updated 2 min ago</div><div className="text-3xl font-extrabold tracking-[-.035em] sm:text-4xl">Good morning, Marcus.</div><p className="mt-2 text-sm leading-6 text-[#c8d8d2]">Heat precautions are active. Sector B remains paused for wildlife clearance.</p></div>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row"><Button onClick={onReport} className="bg-white !text-[#173f35] hover:!bg-[#eef4ef]"><Plus size={17} />Report a hazard</Button><Button onClick={() => go("safety")} className="border !border-white/20 !bg-white/10">View safety plan <ArrowRight size={16} /></Button></div>
      </section>
      {pending.length > 0 && <button onClick={() => go("alerts")} className="flex w-full items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-800"><ClipboardCheck size={19} /></div><div className="flex-1"><div className="text-sm font-extrabold text-amber-950">{pending.length} report{pending.length > 1 ? "s" : ""} pending review</div><div className="mt-0.5 text-xs text-amber-800">We’ll notify you when a supervisor or AI triage responds.</div></div><ChevronRight size={18} className="text-amber-800" /></button>}
      <WeatherCards weather={weather} />
      <div className="grid gap-4 lg:grid-cols-[1.35fr_.65fr]">
        <Card label="Field reports" title="Active site alerts"><div className="mt-2">{reports.slice(0, 3).map((report) => <AlertRow key={report.id} report={report} />)}</div><Button onClick={() => go("alerts")} variant="secondary" className="mt-3 w-full">View all alerts</Button></Card>
        <Card label="Your shift" title="Safety checklist">{["Complete heat briefing", "Inspect and log PPE", "Review emergency route"].map((item, i) => <button key={item} onClick={() => onToggleChecklist(i)} className="mt-3 flex w-full items-center gap-3 rounded-xl p-2 text-left transition hover:bg-[#f1f5f2]"><div className={`grid size-7 place-items-center rounded-full transition ${checklist[i] ? "bg-[#2f6b55] text-white" : "border-2 border-[#bfcac4] text-transparent"}`}><Check size={14} strokeWidth={3} /></div><span className={`text-sm font-semibold ${checklist[i] ? "text-[#71807b] line-through" : "text-[#344e46]"}`}>{item}</span></button>)}<div className="mt-4 h-2 overflow-hidden rounded-full bg-[#e1e7e2]"><div className={`h-full rounded-full bg-[#3f7c64] transition-all ${["w-0", "w-1/3", "w-2/3", "w-full"][checklist.filter(Boolean).length]}`} /></div><div className="mt-2 text-xs font-bold text-[#71807b]">{checklist.filter(Boolean).length} of {checklist.length} complete</div></Card>
      </div>
    </div>
  );
}

function Card({ label, title, children, dark = false }: { label?: string; title?: string; children: ReactNode; dark?: boolean }) {
  return <section className={`rounded-2xl border p-5 shadow-[0_4px_18px_rgba(31,55,46,.05)] ${dark ? "border-[#233e48] bg-[#233e48] text-white" : "border-[#dfe5df] bg-white"}`}>{label && <div className={`section-label ${dark ? "!text-[#a9bdc1]" : ""}`}>{label}</div>}{title && <div className={`section-title ${dark ? "!text-white" : ""}`}>{title}</div>}{children}</section>;
}

function WeatherCards({ weather }: { weather?: LiveWeather | null } = {}) {
  const cards = [
    { icon: <Flame size={20} />, label: "Heat index", value: weather?.current.heatIndexF != null ? `${weather.current.heatIndexF}°F` : "104°F", note: weather ? weather.current.shortForecast ?? "Current NOAA conditions" : "Hydrate every 15 min", color: "bg-[#fff0dc] text-[#a04b18]" },
    { icon: <Droplets size={20} />, label: "Humidity", value: weather?.current.humidityPercent != null ? `${weather.current.humidityPercent}%` : "88%", note: weather ? "Latest station observation" : "Feels 8° warmer", color: "bg-[#e5f3f3] text-[#28656b]" },
    { icon: <Wind size={20} />, label: "Wind", value: weather?.current.windMph != null ? `${weather.current.windMph} mph` : "17 mph", note: weather ? `${weather.current.windDirection ?? "Variable"} wind` : "Gusts up to 26 mph", color: "bg-[#e9f0e8] text-[#3a674d]" },
    { icon: <CloudRain size={20} />, label: "Rain chance", value: weather?.current.rainProbabilityPercent != null ? `${weather.current.rainProbabilityPercent}%` : "72%", note: weather ? `${weather.activeAlerts.length} active NOAA alert${weather.activeAlerts.length === 1 ? "" : "s"}` : "Flood risk elevated", color: "bg-[#e8ecf8] text-[#40588a]" },
  ];
  return <section><div className="mb-4"><div className="section-label">Shark Valley · {weather ? "Live NOAA" : "Site conditions"}</div><div className="section-title">Live site conditions</div>{weather?.issuedAt && <div className="mt-1 text-[10px] font-bold text-[#7b8984]">Updated {new Date(weather.issuedAt).toLocaleString()}</div>}</div><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{cards.map((card) => <div key={card.label} className="rounded-2xl border border-[#dfe5df] bg-white p-4"><div className={`grid size-10 place-items-center rounded-xl ${card.color}`}>{card.icon}</div><div className="mt-4 text-xs font-bold uppercase tracking-wide text-[#76857f]">{card.label}</div><div className="mt-1 text-2xl font-extrabold">{card.value}</div><div className="mt-1 text-xs text-[#6c7b76]">{card.note}</div></div>)}</div></section>;
}

function AlertRow({ report, onClick, showAggregation = false }: { report: FieldReport; onClick?: () => void; showAggregation?: boolean }) {
  const now = useNow();
  return <button onClick={onClick} disabled={!onClick} className={`flex w-full gap-3 border-b border-[#e6ebe6] py-4 text-left last:border-0 ${onClick ? "cursor-pointer" : "cursor-default"}`}><div className={`mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl border ${severityStyles[report.severity]}`}><ShieldAlert size={18} /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-md border px-2 py-.5 text-[10px] font-extrabold uppercase ${severityStyles[report.severity]}`}>{severityLabel[report.severity]}</span><span className="text-[11px] font-semibold text-[#87938f]">{elapsedLabel(report.createdAt, now)}</span>{report.unread && <span className="size-2 rounded-full bg-[#df573b]" />}</div><div className="mt-1.5 text-sm font-extrabold text-[#1e4037]">{report.detail}</div><div className="mt-1 flex items-center gap-1 text-xs text-[#6e7c77]"><MapPin size={12} />{report.location}</div><div className="mt-2 text-[11px] font-bold text-[#6a7d76]">{report.status}{report.source ? ` · ${report.source}` : ""}{showAggregation && report.groupCount && report.groupCount > 1 ? ` · ${report.groupCount} reports grouped` : ""}</div></div>{onClick && <ChevronRight className="mt-3 shrink-0 text-[#81908a]" size={17} />}</button>;
}

function WorkerWeather() {
  const [trackOpen, setTrackOpen] = useState(false);
  return <div className="space-y-4"><PageTitle eyebrow="Weather" title="Conditions at Shark Valley" subtitle="NOAA forecast context with field sensor thresholds." /><WeatherCards /><div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]"><Card label="Flash flood risk" title="Water at knee level"><div className="mt-4 grid gap-4 sm:grid-cols-[230px_1fr] sm:items-center"><FloodVisualizer /><div><div className="text-xl font-extrabold">South trench rising</div><p className="mt-2 text-sm leading-6 text-[#64756f]">The 5-foot worker scale shows 18 inches of water. Avoid low crossings; this is approaching the pause-work threshold.</p></div></div></Card><Card dark label="National Hurricane Center" title="Atlantic 7-day outlook"><p className="mt-3 text-sm leading-6 text-[#b8c8cc]">No active storm is currently shown. FieldCast checks each official NHC advisory—normally every 6 hours, plus intermediate advisories when issued.</p><a href="https://www.nhc.noaa.gov/" target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-white">Open NOAA 7-day outlook <ExternalLink size={15} /></a><button onClick={() => setTrackOpen(!trackOpen)} className="mt-5 flex w-full items-center justify-between rounded-xl bg-white/10 p-3 text-left text-sm font-bold"><span>Hurricane track planning example</span><ChevronRight className={`transition ${trackOpen ? "rotate-90" : ""}`} size={17} /></button>{trackOpen && <div className="mt-3 rounded-xl bg-[#182f37] p-4"><div className="text-xs font-extrabold uppercase tracking-wide text-[#f4c96d]">Historical scenario · Irma-inspired</div><div className="my-4 overflow-hidden rounded-lg border border-white/20"><img src="/hurricane-irma-reference.png" alt="Historical National Hurricane Center track for Hurricane Irma" className="block w-full" /><div className="flex flex-wrap gap-x-4 gap-y-2 bg-white p-3 text-[10px] font-bold text-[#243e47]"><span className="flex items-center gap-1"><i className="size-3 rounded-full bg-black" />H · Cat 1–2</span><span className="flex items-center gap-1"><i className="grid size-3 place-items-center rounded-full bg-black text-[7px] text-white">M</i>Major · Cat 3–5</span><span className="flex items-center gap-1"><i className="h-1 w-5 bg-[#f04f39]" />Forecast path</span><span className="flex items-center gap-1"><i className="size-3 rounded-sm border border-[#8a8f91] bg-white/70" />Potential track</span></div></div><div className="space-y-2 text-xs leading-5 text-[#c6d4d7]"><p><strong className="text-white">Watch:</strong> secure materials, fuel equipment, confirm evacuation roster.</p><p><strong className="text-white">Warning:</strong> stop field work, evacuate exposed sectors, account for all workers.</p><p>This is a training example, not a live forecast. Live tracks must come from NHC advisories.</p></div></div>}</Card></div></div>;
}

function AlertsPage({ reports, role, onReview, onRate, analysis }: { reports: FieldReport[]; role: Role; onReview: (report: FieldReport) => void; onRate: (id: number, accurate: boolean) => void; analysis?: AIAnalysis | null }) {
  const [ratings, setRatings] = useState<Record<number, boolean>>({});
  const rate = (id: number, accurate: boolean) => {
    setRatings((current) => ({ ...current, [id]: accurate }));
    onRate(id, accurate);
  };
  return <div><PageTitle eyebrow={role === "boss" ? "Operations center" : "Safety feed"} title={role === "boss" ? "All team alerts" : "Alerts & your reports"} subtitle={role === "boss" ? "Weather alerts are issued by AI from current and forecast conditions; field hazards combine worker evidence with supervisor review." : "Track pending reports and help improve alert accuracy."} />{role === "boss" && <div className="mt-6"><HazardTrend trends={analysis?.hazardTrends} /></div>}<div className="mt-4 grid gap-4 lg:grid-cols-[1.3fr_.7fr]"><Card>{reports.map((report) => <AlertRow key={report.id} report={report} showAggregation={role === "boss"} onClick={role === "boss" ? () => onReview(report) : undefined} />)}</Card>{role === "boss" ? <Card label="AI escalation" title="Response thresholds"><p className="mt-2 text-xs leading-5 text-[#6c7b76]">For field hazards, AI can group likely duplicates and prepare evidence while the supervisor decides. Automated alert authority is limited to weather conditions.</p>{escalation.map((item) => <div key={item.level} className="mt-4 rounded-xl bg-[#f1f4f0] p-3"><div className="flex justify-between text-sm font-extrabold"><span>{item.level}</span><span>{item.time}</span></div><p className="mt-1 text-xs leading-5 text-[#687873]">{item.reason}</p></div>)}</Card> : <Card label="Improve field AI" title="Rate resolved alerts"><p className="mt-2 text-xs leading-5 text-[#6c7b76]">Was the alert accurate? Feedback supports quality review and model training; it never changes safety policy automatically.</p>{reports.filter((r) => r.status !== "Pending supervisor").slice(0, 2).map((report) => <div key={report.id} className="mt-4 rounded-xl bg-[#f1f4f0] p-3"><div className="text-sm font-bold">{report.detail}</div>{report.id in ratings ? <div className="mt-3 flex items-center gap-2 text-xs font-bold text-[#2d6554]"><CheckCircle2 size={16} />Feedback recorded: {ratings[report.id] ? "accurate" : "needs improvement"}</div> : <div className="mt-3 flex gap-2"><Button variant="secondary" className="!min-h-9 flex-1 !px-2" onClick={() => rate(report.id, true)}><ThumbsUp size={14} />Accurate</Button><Button variant="secondary" className="!min-h-9 flex-1 !px-2" onClick={() => rate(report.id, false)}><ThumbsDown size={14} />Not quite</Button></div>}</div>)}</Card>}</div></div>;
}

function HazardTrend({ trends }: { trends?: AIAnalysis["hazardTrends"] }) {
  if (trends?.length) {
    return <Card label="Gemini mitigation insight" title="Recurring hazard patterns"><div className="mt-4 grid gap-3 md:grid-cols-2">{trends.map((trend) => <div key={`${trend.hazard}-${trend.hotspotSector}`} className="rounded-xl border border-[#e3e8e3] bg-[#f8f6f0] p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-extrabold">{trend.hazard}</div><div className="mt-1 text-xs font-bold text-[#ad622c]">{trend.hotspotSector}</div></div><span className={`rounded-full px-2 py-1 text-xs font-extrabold ${trend.changePercent > 0 ? "bg-orange-100 text-orange-800" : "bg-emerald-100 text-emerald-800"}`}>{trend.changePercent > 0 ? "+" : ""}{trend.changePercent}%</span></div><p className="mt-3 text-xs leading-5 text-[#667770]">{trend.observation}</p><div className="mt-3 rounded-lg bg-white p-3 text-xs font-semibold leading-5 text-[#34594e]">{trend.recommendedMitigation}</div></div>)}</div></Card>;
  }
  return <Card label="Mitigation insight" title="Coming soon"><div className="mt-4 rounded-xl bg-[#f5f3ed] p-5 text-sm leading-6 text-[#667770]">Recurring hazard mitigation insights will appear here as enough verified site data becomes available.</div></Card>;
}

function SafetyPlan() {
  const sections = [
    ["Heat illness prevention", "Water, rest, shade, acclimatization, buddy checks, and emergency response. OSHA General Duty Clause, OSH Act §5(a)(1); OSHA Heat guidance; 29 CFR 1926.51."],
    ["Severe weather & evacuation", "Supervisors monitor NOAA alerts, designate assembly points, account for workers, and stop exposed work. 29 CFR 1926.35 and 1926.21(b)(2)."],
    ["Electrical hazards", "Treat all lines as energized, maintain safe clearance, barricade the area, and use qualified personnel. 29 CFR 1926.416."],
    ["Flooding & excavations", "Do not enter excavations with accumulating water without approved controls and competent-person inspection. 29 CFR 1926.651(h)."],
    ["PPE & wildlife", "Wear assigned PPE, never approach wildlife, stop work, create distance, and contact designated wildlife authorities. 29 CFR 1926.95."],
    ["Incident reporting", "Report the location, description, urgency, and evidence without entering a hazard zone. Supervisors preserve records and initiate emergency services when needed."],
  ];
  return <div><PageTitle eyebrow="OSHA-aligned field guide" title="Site safety plan" subtitle="Shark Valley construction operations · revision 1.0" /><div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><strong>Important:</strong> This template summarizes federal OSHA requirements and guidance; it is not legal advice or a substitute for the employer’s approved, site-specific plan, competent-person assessment, Florida requirements, or emergency procedures.</div><div className="mt-4 grid gap-3 md:grid-cols-2">{sections.map(([title, detail], i) => <Card key={title}><div className="flex items-start gap-3"><div className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#e4eee8] text-xs font-extrabold">{i + 1}</div><div><div className="font-extrabold">{title}</div><p className="mt-1 text-sm leading-6 text-[#65756f]">{detail}</p></div></div></Card>)}</div><a href="https://www.osha.gov/construction" target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-[#285e4f]">Official OSHA construction resources <ExternalLink size={15} /></a></div>;
}

function SchedulePage({ onRequest }: { onRequest: (request: Omit<TimeOffRequest, "id" | "worker" | "status">) => void }) {
  const [type, setType] = useState<"Sick day" | "Vacation">("Sick day");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);
  return <div><PageTitle eyebrow="Your work" title="Weekly schedule" subtitle="Assignments from your supervisor. Schedule changes trigger an alert." /><Card><div className="mt-1 space-y-2">{shifts.map((shift) => <div key={shift.day} className="grid grid-cols-[52px_1fr] gap-3 rounded-xl border border-[#e3e8e3] p-3"><div className="rounded-lg bg-[#e7eee9] py-2 text-center"><div className="text-[10px] font-extrabold uppercase">{shift.day}</div><div className="text-lg font-extrabold">{shift.date}</div></div><div><div className="text-sm font-extrabold">{shift.title}</div><div className="mt-1 text-xs text-[#6c7b76]">{shift.time}</div><div className="mt-1 flex items-center gap-1 text-xs text-[#6c7b76]"><MapPin size={12} />{shift.sector}</div></div></div>)}</div></Card><div className="mt-4"><Card label="Availability" title="Request time off"><div className="mt-4 grid grid-cols-2 gap-2">{(["Sick day", "Vacation"] as const).map((item) => <button key={item} onClick={() => setType(item)} className={`rounded-xl border p-3 text-sm font-bold ${type === item ? "border-[#d07a35] bg-[#fff0dc] text-[#8d4b1d]" : "border-[#dfe5df]"}`}>{item}</button>)}</div><div className="mt-4 grid grid-cols-2 gap-2"><label className="text-xs font-bold text-[#61736d]">Start<input type="date" value={start} onChange={(event) => setStart(event.target.value)} className="mt-1 w-full rounded-xl border border-[#d8e0d9] p-3 text-sm" /></label><label className="text-xs font-bold text-[#61736d]">End<input type="date" value={end} onChange={(event) => setEnd(event.target.value)} className="mt-1 w-full rounded-xl border border-[#d8e0d9] p-3 text-sm" /></label></div><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional note for your supervisor" className="mt-3 min-h-20 w-full rounded-xl border border-[#d8e0d9] p-3 text-sm" />{sent ? <div className="mt-3 flex items-center gap-2 text-sm font-bold text-[#2f6957]"><CheckCircle2 size={17} />Request sent for supervisor review.</div> : <Button className="mt-3 w-full" disabled={!start || !end} onClick={() => { onRequest({ type, start, end, note }); setSent(true); }}>Submit time-off request</Button>}</Card></div></div>;
}

function SettingsPage({ authEnabled, onSignOut, getToken }: { authEnabled: boolean; onSignOut: () => void; getToken?: () => Promise<string | null> }) {
  const [push, setPush] = useState(Notification.permission === "granted");
  const [banner, setBanner] = useState(true);
  const [resetSent, setResetSent] = useState(false);
  const [geminiStatus, setGeminiStatus] = useState<"idle" | "checking" | "connected" | "error">("idle");
  const [geminiMessage, setGeminiMessage] = useState("");
  const enablePush = async () => {
    if (!("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setPush(result === "granted");
    if (result === "granted") new Notification("FieldCast alerts enabled", { body: "Critical site alerts can now appear on your lock screen." });
  };
  const checkGemini = async () => {
    if (!getToken) return;
    setGeminiStatus("checking");
    setGeminiMessage("");
    try {
      const result = await testGeminiConnection(getToken);
      setGeminiStatus("connected");
      setGeminiMessage(`Connected to ${result.model}.`);
    } catch (error) {
      setGeminiStatus("error");
      setGeminiMessage(error instanceof Error ? error.message : "Connection failed.");
    }
  };
  return <div><PageTitle eyebrow="Account" title="Settings & notifications" subtitle="Manage identity and critical alert delivery." /><div className="mt-6 grid gap-4 lg:grid-cols-2"><Card label="Profile & security" title="Account details"><InfoRow icon={<Users size={17} />} label="Username" value="Marcus Johnson" /><InfoRow icon={<Mail size={17} />} label="Email" value={authEnabled ? "Clerk verified account" : "Presentation account"} /><button onClick={() => setResetSent(true)} className="mt-4 flex w-full items-center gap-3 rounded-xl border border-[#e3e8e3] p-3 text-left"><Lock size={17} /><div className="flex-1 text-sm font-bold">Email a password reset link</div><ChevronRight size={17} /></button>{resetSent && <div className="mt-3 rounded-xl bg-[#e8f1eb] p-3 text-xs font-bold text-[#2f6957]">Reset instructions requested through Clerk.</div>}<Button variant="danger" className="mt-5 w-full" onClick={onSignOut}>Sign out</Button></Card><Card label="Phone alerts" title="Notification delivery"><ToggleRow label="In-app banners" detail="Show active warnings while FieldCast is open." checked={banner} onClick={() => setBanner(!banner)} /><ToggleRow label="Lock screen & banners" detail={push ? "Browser permission granted." : "Requires Web Push permission and an installed PWA."} checked={push} onClick={enablePush} /></Card>{authEnabled && <Card label="AI services" title="Gemini connection"><Button className="mt-3 w-full" disabled={geminiStatus === "checking"} onClick={checkGemini}>{geminiStatus === "checking" ? "Checking…" : "Test Gemini connection"}</Button>{geminiMessage && <div className="mt-3 rounded-xl bg-[#edf2ee] p-3 text-xs font-bold">{geminiMessage}</div>}</Card>}</div></div>;
}
function ClerkAccountButton() {
  const clerk = useClerk();
  return <Button onClick={() => clerk.openUserProfile()} variant="secondary" className="mt-5 w-full">Manage account & password <ExternalLink size={15} /></Button>;
}

function InfoRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="mt-4 flex items-center gap-3 rounded-xl border border-[#e3e8e3] p-3"><div className="text-[#527168]">{icon}</div><div><div className="text-[10px] font-extrabold uppercase tracking-wide text-[#7a8984]">{label}</div><div className="text-sm font-bold">{value}</div></div></div>;
}

function ToggleRow({ label, detail, checked, onClick }: { label: string; detail: string; checked: boolean; onClick: () => void }) {
  return <button onClick={onClick} className="mt-4 flex w-full items-center gap-3 text-left"><div className="flex-1"><div className="text-sm font-extrabold">{label}</div><div className="mt-1 text-xs leading-5 text-[#6c7b76]">{detail}</div></div><div className={`flex h-7 w-12 items-center rounded-full p-1 transition ${checked ? "justify-end bg-[#2c6655]" : "justify-start bg-[#cad3ce]"}`}><span className="size-5 rounded-full bg-white shadow" /></div></button>;
}

function MorePage({ role, go }: { role: Role; go: (page: Page) => void }) {
  const items = role === "worker" ? [{ icon: FileText, title: "Safety plan", detail: "OSHA-aligned site procedures", page: "safety" as Page }, { icon: CalendarDays, title: "Weekly schedule", detail: "Your shifts and assignments", page: "schedule" as Page }] : [{ icon: CalendarDays, title: "Manage schedules", detail: "Staffing, sick calls, and time-off requests", page: "schedule" as Page }, { icon: FileText, title: "Safety plan", detail: "Review company procedures", page: "safety" as Page }];
  return <div><PageTitle eyebrow="Work resources" title="More" subtitle="Safety plans and role-specific resources." /><Card><div className="divide-y divide-[#e6ebe6]">{items.map(({ icon: Icon, title, detail, page }) => <button key={title} onClick={() => go(page)} className="flex w-full items-center gap-3 py-4 text-left"><div className="grid size-10 place-items-center rounded-xl bg-[#e8efe9] text-[#315d50]"><Icon size={19} /></div><div className="flex-1"><div className="text-sm font-extrabold">{title}</div><div className="mt-1 text-xs text-[#71807b]">{detail}</div></div><ChevronRight size={18} className="text-[#82908b]" /></button>)}</div></Card></div>;
}

function AboutPage() {
  const [helpful, setHelpful] = useState<"yes" | "no" | null>(null);
  const [feedback, setFeedback] = useState("");
  const [sent, setSent] = useState(false);
  const faqs = [
    ["Who is FieldCast for?", "Construction workers, supervisors, and HR administrators operating in weather- and wildlife-sensitive environments."],
    ["Where do weather alerts come from?", "Weather context comes from NOAA and the National Hurricane Center. Field reports come from workers, supervisors, and clearly labeled AI-assisted triage."],
    ["Does AI make the final safety decision?", "No. AI can issue time-sensitive fallback guidance using defined thresholds, but supervisors remain responsible for review and can override an alert."],
    ["What should I do in an emergency?", "Follow the approved site emergency action plan, move away from danger, contact emergency services, and use FieldCast only when it is safe to do so."],
  ];
  return <div><section className="overflow-hidden rounded-3xl bg-[#fff0d7] p-6 sm:p-8"><div className="section-label !text-[#a85a24]">About FieldCast</div><div className="mt-1 text-3xl font-extrabold tracking-tight text-[#55351f]">Safer work in a changing environment</div><p className="mt-3 max-w-3xl text-sm leading-6 text-[#76553e]">Our mission is to help Everglades crews act earlier by combining official NOAA weather data, worker observations, and supervisor decisions in one clear safety workflow.</p><div className="mt-5 rounded-2xl border border-[#efc36f] bg-[#fff9ed] p-4"><div className="flex items-center gap-2 text-sm font-extrabold text-[#8e491e]"><Siren size={17} />How AI is used—and limited</div><p className="mt-2 text-sm leading-6 text-[#76553e]">AI analyzes weather forecasts, groups likely duplicate field reports, and summarizes evidence. It may automatically issue weather alerts from defined thresholds. It does not independently issue alerts for worker-reported field hazards; supervisors review those decisions. Every AI action is labeled, logged, and open to worker feedback.</p></div></section><div className="mt-4 grid gap-4 lg:grid-cols-[1.05fr_.95fr]"><Card label="Why we exist" title="Built for the field"><p className="mt-3 text-sm leading-6 text-[#64756f]">FieldCast helps crews coordinate work without losing sight of heat, water, wildlife, electrical hazards, or severe storms.</p><div className="mt-5 grid grid-cols-3 gap-2">{[["Fast", "Clear alerts"], ["Accountable", "Human review"], ["Local", "Site-aware"]].map(([top, bottom], index) => <div key={top} className={`rounded-xl p-3 text-center ${index === 1 ? "bg-[#fff0dc] text-[#8f4e22]" : "bg-[#edf3ee]"}`}><div className="break-words text-sm font-extrabold sm:text-base">{top}</div><div className="text-[10px] font-bold uppercase tracking-wide opacity-70">{bottom}</div></div>)}</div></Card><Card label="Frequently asked" title="Quick answers"><div className="mt-2 divide-y divide-[#eadfce]">{faqs.map(([question, answer]) => <details key={question} className="group py-3"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-extrabold">{question}<Plus size={16} className="shrink-0 text-[#cf762f] transition group-open:rotate-45" /></summary><p className="mt-2 text-xs leading-5 text-[#687973]">{answer}</p></details>)}</div></Card></div><section className="mt-4 rounded-2xl border border-[#edc880] bg-[#fff9ee] p-5"><div className="section-label !text-[#aa6029]">Help us improve</div><div className="section-title !text-[#573a25]">One-minute feedback</div><div className="mt-4 text-sm font-bold">Was FieldCast easy to understand today?</div><div className="mt-2 flex gap-2"><Button variant={helpful === "yes" ? "primary" : "secondary"} onClick={() => setHelpful("yes")}><ThumbsUp size={15} />Yes</Button><Button variant={helpful === "no" ? "primary" : "secondary"} onClick={() => setHelpful("no")}><ThumbsDown size={15} />Not yet</Button></div><textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="What should we improve?" className="mt-4 min-h-24 w-full rounded-xl border border-[#e5c892] bg-white p-3 text-sm outline-none focus:border-[#d28745]" />{sent ? <div className="mt-3 flex items-center gap-2 text-sm font-bold text-[#9b551f]"><CheckCircle2 size={17} />Thanks—your feedback was recorded.</div> : <Button className="mt-3 !bg-[#d6732d]" disabled={!helpful} onClick={() => setSent(true)}>Send feedback</Button>}</section></div>;
}

function SupervisorHome({ reports, go, onReview }: { reports: FieldReport[]; go: (page: Page) => void; onReview: (r: FieldReport) => void }) {
  const pending = reports.filter((r) => r.status === "Pending supervisor");
  const controlled = reports.filter((report) => report.type !== "Weather" && report.resolvedAt);
  const averageMinutes = controlled.length ? Math.round(controlled.reduce((total, report) => total + ((report.resolvedAt ?? report.createdAt) - report.createdAt) / 60_000, 0) / controlled.length) : 0;
  return <div className="space-y-6"><section className="rounded-3xl bg-[#203e49] p-6 text-white sm:p-8"><div className="section-label !text-[#a9bdc1]">Supervisor command</div><div className="mt-1 text-3xl font-extrabold tracking-tight">Project needs a weather decision.</div><p className="mt-2 max-w-2xl text-sm leading-6 text-[#c2d0d3]">Gemini’s planning forecast estimates 2.5 lost workdays next week from heavy rainfall and saturated ground.</p><div className="mt-6 flex flex-wrap gap-2"><Button onClick={() => go("weather")} className="bg-white !text-[#203e49]">Review impact forecast</Button><Button onClick={() => go("team")} className="border !border-white/20 !bg-white/10">Manage team</Button></div></section><div className="grid gap-4 lg:grid-cols-3"><Card label="Needs review" title={`${pending.length} report awaiting action`}>{pending.map((report) => <div key={report.id}><AlertRow report={report} showAggregation /><Button onClick={() => onReview(report)} className="w-full">Review report now</Button></div>)}</Card><Card label="Resolution performance" title="Supervisor-controlled hazards"><div className="mt-5 text-4xl font-extrabold text-[#d77a32]">{averageMinutes} min</div><p className="mt-2 text-sm leading-6 text-[#667770]">Average report-to-resolution time. Weather alerts are excluded because they are issued automatically.</p></Card><Card label="Timeline health" title="Completion at risk"><div className="mt-5 text-4xl font-extrabold text-[#d75a3f]">+5 days</div><p className="mt-2 text-sm leading-6 text-[#667770]">Projected completion moves from Aug 14 to Aug 19 unless drainage tasks are resequenced.</p></Card></div></div>;
}

function ImpactPage({ onBroadcast, analysis, weather, onRefresh, refreshing, error, generatedAt }: { onBroadcast: (message: string) => void; analysis?: AIAnalysis | null; weather?: LiveWeather | null; onRefresh: () => void; refreshing: boolean; error?: string; generatedAt?: string }) {
  const fallbackDays = [{ name: "Mon", rainProbabilityPercent: 72 }, { name: "Tue", rainProbabilityPercent: 88 }, { name: "Wed", rainProbabilityPercent: 64 }, { name: "Thu", rainProbabilityPercent: 42 }, { name: "Fri", rainProbabilityPercent: 28 }];
  const days = weather?.forecast.filter((period) => period.name && !period.name.toLowerCase().includes("night")).slice(0, 5) ?? fallbackDays;
  const impact = analysis?.weatherImpact;
  const rawConfidence = impact?.confidence ?? 0.78;
  const confidencePercent = Math.min(99.9, Math.max(0, rawConfidence <= 1 ? rawConfidence * 100 : rawConfidence));
  const primaryAction = analysis?.recommendedActions?.[0];
  return <div><div className="flex flex-wrap items-end justify-between gap-3"><PageTitle eyebrow="NOAA + Gemini planning" title="Project weather impact" subtitle={analysis ? "Live NOAA facts interpreted by Gemini with supervisor approval required." : "Run the connected analysis to generate the current planning forecast."} /><Button onClick={onRefresh} disabled={refreshing}>{refreshing ? "Analyzing…" : analysis ? "Refresh AI analysis" : "Run AI analysis"}</Button></div>{error && <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-800">{error}</div>}{generatedAt && <div className="mt-3 text-xs font-bold text-[#76857f]">Generated {new Date(generatedAt).toLocaleString()} · {weather ? "Live NOAA data" : "Cached weather"}</div>}<div className="mt-6 grid gap-4 lg:grid-cols-[1.3fr_.7fr]"><Card label="5-day NOAA outlook" title={impact?.summary ?? "Rain may delay earthwork"}><div className="mt-4 grid grid-cols-5 gap-2">{days.map((day, index) => <div key={`${day.name}-${index}`} className="rounded-xl bg-[#edf2f1] p-2 text-center"><div className="text-xs font-bold">{(day.name ?? `Day ${index + 1}`).slice(0, 3)}</div><CloudRain className="mx-auto my-2 text-[#4f7480]" size={19} /><div className="text-sm font-extrabold">{day.rainProbabilityPercent ?? 0}%</div></div>)}</div><div className="mt-5 grid grid-cols-3 gap-2"><div className="rounded-xl bg-[#f3f5f1] p-3"><div className="text-2xl font-extrabold">{impact?.predictedLostHours ?? 18}</div><div className="text-[10px] font-bold uppercase text-[#71807b]">Lost hours</div></div><div className="rounded-xl bg-[#fff0dc] p-3"><div className="text-2xl font-extrabold text-[#a45420]">+{impact?.predictedDelayDays ?? 5}</div><div className="text-[10px] font-bold uppercase text-[#8a6b55]">Delay days</div></div><div className="rounded-xl bg-[#e7f0eb] p-3"><div className="text-2xl font-extrabold">{confidencePercent.toFixed(1)}%</div><div className="text-[10px] font-bold uppercase text-[#71807b]">Confidence</div></div></div><p className="mt-4 text-[11px] leading-5 text-[#74837e]">NOAA supplies the factual forecast. Gemini analyzes likely project impact; supervisors approve all schedule actions.</p></Card><Card label="Recommended decision" title={primaryAction?.title ?? "Protect next week"}><p className="mt-3 text-sm leading-6 text-[#65766f]">{primaryAction?.description ?? "Pause exposed earthwork during the highest rain window and move maintenance tasks indoors."}</p><div className="mt-4 rounded-xl bg-[#f1f4f0] p-3 text-xs font-bold text-[#5d7069]">Priority: {primaryAction?.priority ?? "high"} · Supervisor approval required</div><Button onClick={() => onBroadcast(primaryAction?.description ?? "Weather pause: check your updated schedule before reporting to the field.")} className="mt-5 w-full"><Siren size={16} />Send decision to workers</Button></Card></div></div>;
}

function TeamPage({ requests, onDecision }: { requests: TimeOffRequest[]; onDecision: (id: number, status: "Approved" | "Declined") => void }) {
  const [email, setEmail] = useState("");
  const [copied, setCopied] = useState(false);
  const approvedDays = requests.filter((request) => request.status === "Approved").length;
  return <div><PageTitle eyebrow="Crew management" title="Team Cypress" subtitle="Manage membership, availability changes, and projected on-site staffing." /><div className="mt-6 grid gap-4 lg:grid-cols-2"><Card label="Schedule changes" title={`${requests.filter((request) => request.status === "Pending").length} requests need review`}>{requests.map((request) => <div key={request.id} className="mt-3 rounded-xl border border-[#e3e8e3] p-3"><div className="flex items-start justify-between gap-2"><div><div className="text-sm font-extrabold">{request.worker}</div><div className="mt-1 text-xs text-[#6b7b75]">{request.type} · {request.start} to {request.end}</div></div><span className={`rounded-full px-2 py-1 text-[10px] font-extrabold ${request.status === "Pending" ? "bg-amber-100 text-amber-800" : request.status === "Approved" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>{request.status}</span></div>{request.note && <p className="mt-2 text-xs text-[#6b7b75]">{request.note}</p>}{request.status === "Pending" && <div className="mt-3 flex gap-2"><Button className="!min-h-9 flex-1" onClick={() => onDecision(request.id, "Approved")}>Approve</Button><Button variant="secondary" className="!min-h-9 flex-1" onClick={() => onDecision(request.id, "Declined")}>Decline</Button></div>}</div>)}</Card><Card label="Staffing outlook" title="Expected workers on site"><div className="mt-4 space-y-3">{[["Mon", 12, "92%"], ["Tue", 11 - approvedDays, "78%"], ["Wed", 10, "74%"], ["Thu", 12, "91%"], ["Fri", 9, "69%"]].map(([day, count, efficiency]) => <div key={day as string} className="grid grid-cols-[42px_1fr_auto] items-center gap-3"><span className="text-xs font-extrabold">{day}</span><div className="h-2 overflow-hidden rounded-full bg-[#e3e8e4]"><div className={`h-full rounded-full bg-[#d77a32] ${Number(count) >= 11 ? "w-full" : Number(count) >= 10 ? "w-4/5" : "w-2/3"}`} /></div><span className="text-xs font-bold">{count} · {efficiency}</span></div>)}</div><p className="mt-5 text-xs leading-5 text-[#6d7d77]">Efficiency compares completed planned hours with crew availability. Weather interruptions are reported separately.</p></Card><Card label="Invite workers" title="Grow your team"><div className="mt-3 flex gap-2"><input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="worker@company.com" className="min-w-0 flex-1 rounded-xl border border-[#d8e0d9] px-3 text-sm" /><Button disabled={!email}><UserPlus size={16} /></Button></div><button onClick={() => { navigator.clipboard?.writeText("https://fieldcast.app/join/cypress-8L2K"); setCopied(true); }} className="mt-3 flex w-full items-center gap-3 rounded-xl border border-dashed border-[#9caaa4] p-3 text-left"><Link size={17} /><span className="min-w-0 flex-1 truncate text-xs font-bold">fieldcast.app/join/cypress-8L2K</span>{copied ? <Check size={16} /> : <Copy size={16} />}</button></Card></div></div>;
}

function PageTitle({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return <div><div className="section-label">{eyebrow}</div><div className="text-2xl font-extrabold tracking-tight text-[#173f35] sm:text-3xl">{title}</div><p className="mt-1 text-sm leading-6 text-[#697a74]">{subtitle}</p></div>;
}

function ManualAlertSheet({ onClose, onSend }: { onClose: () => void; onSend: (alert: FieldReport) => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("All sectors");
  const [severity, setSeverity] = useState<Severity>("beware");
  return <Modal onClose={onClose}><PageTitle eyebrow="Supervisor broadcast" title="Send a manual alert" subtitle="Issue an operational alert without waiting for a worker report." /><div className="mt-5 text-xs font-extrabold uppercase tracking-wide text-[#65766f]">Alert level</div><div className="mt-2 grid grid-cols-3 gap-2">{(["beware", "pause", "evacuate"] as Severity[]).map((item) => <button key={item} onClick={() => setSeverity(item)} className={`rounded-xl border p-3 text-xs font-extrabold ${severity === item ? severityStyles[item] : "border-[#dfe5df] bg-white"}`}>{severityLabel[item]}</button>)}</div><label className="mt-4 block text-xs font-extrabold uppercase tracking-wide text-[#65766f]">Affected area</label><select value={location} onChange={(event) => setLocation(event.target.value)} className="mt-2 w-full rounded-xl border border-[#d8e0d9] bg-white p-3 text-sm"><option>All sectors</option><option>Sector A</option><option>Sector B</option><option>Sector C</option><option>Sector D</option></select><label className="mt-4 block text-xs font-extrabold uppercase tracking-wide text-[#65766f]">Alert title</label><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Example: Equipment access temporarily closed" className="mt-2 w-full rounded-xl border border-[#d8e0d9] p-3 text-sm" /><label className="mt-4 block text-xs font-extrabold uppercase tracking-wide text-[#65766f]">Instructions for workers</label><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Explain what is happening and what workers should do." className="mt-2 min-h-24 w-full rounded-xl border border-[#d8e0d9] p-3 text-sm" /><div className="mt-5 grid grid-cols-2 gap-3"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant={severity === "evacuate" ? "danger" : "primary"} disabled={!title || !description} onClick={() => { const now = Date.now(); onSend({ id: now, type: "Site safety", detail: title, location, time: "Just now", createdAt: now, severity, status: "Active alert", unread: true, source: "supervisor", alertDescription: description, groupCount: 1, evidenceCount: 0 }); onClose(); }}>Send alert</Button></div></Modal>;
}

function ReportSheet({ onClose, onSubmit }: { onClose: () => void; onSubmit: (report: FieldReport) => void }) {
  const [type, setType] = useState<HazardType>("Wildlife");
  const [area, setArea] = useState("Sector A");
  const [detail, setDetail] = useState("");
  const [photo, setPhoto] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const severity = useMemo<Severity>(() => type === "Electrical" ? "evacuate" : type === "Wildlife" ? "pause" : "beware", [type]);
  return <Modal onClose={onClose}><PageTitle eyebrow="Field safety" title="Report a hazard" subtitle="Choose a common hazard and work area so similar reports can be grouped without hiding separate incidents." /><div className="mt-5 text-xs font-extrabold uppercase tracking-wide text-[#65766f]">Hazard</div><div className="mt-2 grid grid-cols-2 gap-2">{(["Wildlife", "Electrical", "Flooding", "Site safety"] as HazardType[]).map((item) => <button key={item} onClick={() => setType(item)} className={`min-h-12 rounded-xl border px-3 text-left text-sm font-bold ${type === item ? "border-[#315f50] bg-[#e2eee7]" : "border-[#dce3dd] bg-white"}`}>{item}</button>)}</div><div className="mt-4 text-xs font-extrabold uppercase tracking-wide text-[#65766f]">Work area</div><div className="mt-2 grid grid-cols-4 gap-2">{["Sector A", "Sector B", "Sector C", "Sector D"].map((item) => <button key={item} onClick={() => setArea(item)} className={`rounded-xl border px-2 py-3 text-xs font-bold ${area === item ? "border-[#d58138] bg-[#fff0dc] text-[#8f4718]" : "border-[#dce3dd] bg-white"}`}>{item.replace("Sector ", "")}</button>)}</div><textarea value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Describe exactly what you saw..." className="mt-4 min-h-28 w-full rounded-xl border border-[#d8e0d9] p-3 text-sm outline-none" /><input ref={input} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setPhoto(e.target.files?.[0]?.name ?? "")} /><Button onClick={() => input.current?.click()} variant="secondary" className="mt-3 w-full"><Camera size={17} />{photo || "Take or attach evidence photo"}</Button><div className={`mt-4 rounded-xl border p-3 ${severityStyles[severity]}`}><div className="flex items-center gap-2 text-sm font-extrabold"><Siren size={17} />Suggested: {severityLabel[severity]}</div><p className="mt-1 text-xs leading-5">Supervisor review window: {severity === "evacuate" ? "2" : severity === "pause" ? "5" : "15"} minutes. AI may group duplicates, but field-hazard alert decisions remain with supervisors.</p></div><div className="mt-5 grid grid-cols-2 gap-3"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => { const now = Date.now(); onSubmit({ id: now, type, detail: detail || `${type} hazard reported`, location: `${area} · Current location`, time: "Just now", createdAt: now, severity, status: "Pending supervisor", evidence: photo ? "Photo attached" : undefined, evidenceCount: photo ? 1 : 0, groupCount: 1, unread: true, source: "worker" }); onClose(); }}>Send report</Button></div></Modal>;
}

function ReviewSheet({ report, onClose, onResolve }: { report: FieldReport; onClose: () => void; onResolve: (severity: Severity, description: string, resolution: string, duplicate?: boolean) => void }) {
  const [grade, setGrade] = useState(report.severity);
  const [description, setDescription] = useState(report.alertDescription ?? "");
  const [resolution, setResolution] = useState(report.resolution ?? "");
  const isPending = report.status === "Pending supervisor";
  const now = useNow();
  const resolutionMinutes = report.resolvedAt ? Math.max(1, Math.round((report.resolvedAt - report.createdAt) / 60_000)) : null;
  return <Modal onClose={onClose}><PageTitle eyebrow={isPending ? "Supervisor review" : "Alert details"} title={report.detail} subtitle={`${report.location} · ${elapsedLabel(report.createdAt, now)}`} /><div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-xl bg-[#fff0dc] p-3"><div className="text-2xl font-extrabold text-[#a25320]">{report.groupCount ?? 1}</div><div className="text-[10px] font-extrabold uppercase text-[#8e694e]">Matching reports</div></div><div className="rounded-xl bg-[#e8f1ed] p-3"><div className="text-2xl font-extrabold text-[#315f50]">{report.evidenceCount ?? 0}</div><div className="text-[10px] font-extrabold uppercase text-[#60766d]">Evidence files</div></div></div>{report.evidenceCount ? <div className="mt-3 grid grid-cols-3 gap-2">{Array.from({ length: Math.min(3, report.evidenceCount) }).map((_, index) => <div key={index} className="grid h-20 place-items-center rounded-xl bg-[#dce5de] text-[#5d746c]"><Camera size={20} /><span className="-mt-5 text-[9px] font-bold">Evidence {index + 1}</span></div>)}</div> : null}<div className="mt-5 text-xs font-extrabold uppercase tracking-wide text-[#65766f]">Alert level</div><div className="mt-2 grid grid-cols-3 gap-2">{(["beware", "pause", "evacuate"] as Severity[]).map((item) => <button key={item} disabled={!isPending} onClick={() => setGrade(item)} className={`rounded-xl border p-3 text-xs font-extrabold disabled:cursor-default ${grade === item ? severityStyles[item] : "border-[#dfe5df] bg-white"}`}>{severityLabel[item]}</button>)}</div><label className="mt-4 block text-xs font-extrabold uppercase tracking-wide text-[#65766f]">Alert description</label><textarea disabled={!isPending} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Tell workers what is happening and what action to take." className="mt-2 min-h-20 w-full rounded-xl border border-[#d8e0d9] bg-white p-3 text-sm outline-none disabled:bg-[#f2f4f1]" /><label className="mt-4 block text-xs font-extrabold uppercase tracking-wide text-[#65766f]">How it was resolved</label><textarea disabled={!isPending} value={resolution} onChange={(event) => setResolution(event.target.value)} placeholder="Document the control, repair, clearance, or other resolution." className="mt-2 min-h-20 w-full rounded-xl border border-[#d8e0d9] bg-white p-3 text-sm outline-none disabled:bg-[#f2f4f1]" />{resolutionMinutes && <div className="mt-3 rounded-xl bg-[#edf2ee] p-3 text-sm font-bold text-[#385f53]"><CheckCircle2 size={16} className="mr-2 inline" />Resolved in {resolutionMinutes} minutes · {report.source}</div>}{isPending && <><div className="mt-4 rounded-xl bg-[#f0f4f1] p-3 text-xs leading-5 text-[#64756f]">Likely duplicate reports are grouped by hazard tag, area, time, and evidence similarity. One alert is sent for the group to reduce spam.</div><div className="mt-5 grid grid-cols-2 gap-3"><Button variant="secondary" onClick={() => onResolve(grade, description, "Duplicate of an existing alert; evidence merged into the original.", true)}>Resolve duplicate</Button><Button variant={grade === "evacuate" ? "danger" : "primary"} disabled={!description || !resolution} onClick={() => onResolve(grade, description, resolution)}>Resolve & alert</Button></div></>}</Modal>;
}

function Modal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#102a24]/55 backdrop-blur-sm sm:items-center sm:p-6"><div className="max-h-[92vh] w-full overflow-auto rounded-t-3xl bg-[#f8f9f6] p-5 shadow-2xl sm:max-w-lg sm:rounded-3xl sm:p-6"><button onClick={onClose} className="float-right grid size-10 place-items-center rounded-xl bg-[#e9eeea]"><X size={18} /></button>{children}</div></div>;
}

function NotificationsSheet({ reports, onClose, onRead }: { reports: FieldReport[]; onClose: () => void; onRead: () => void }) {
  useEffect(() => { onRead(); }, [onRead]);
  return <Modal onClose={onClose}><PageTitle eyebrow="Since you were away" title="Notifications" subtitle="Unread reports, automatic alerts, and supervisor actions." /><div className="mt-3">{reports.slice(0, 4).map((report) => <AlertRow key={report.id} report={report} />)}</div></Modal>;
}

function Nav({ role, page, go, onReport }: { role: Role; page: Page; go: (p: Page) => void; onReport: () => void }) {
  const items = role === "worker" ? [{ p: "home" as Page, l: "Home", i: Home }, { p: "weather" as Page, l: "Weather", i: CloudRain }, { p: "alerts" as Page, l: "Alerts", i: Bell }, { p: "more" as Page, l: "More", i: Menu }] : [{ p: "home" as Page, l: "Overview", i: Home }, { p: "weather" as Page, l: "Impact", i: CloudRain }, { p: "team" as Page, l: "Team", i: Users }, { p: "alerts" as Page, l: "Alerts", i: Bell }, { p: "more" as Page, l: "More", i: Menu }];
  return <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[#dbe2dc] bg-white/95 px-2 pb-[max(.7rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur"><div className="mx-auto flex max-w-2xl items-end justify-around">{items.map(({ p, l, i: Icon }, index) => <div key={p} className="contents">{role === "worker" && index === 2 && <button onClick={onReport} className="-mt-7 grid size-14 place-items-center rounded-2xl bg-[#e75b3e] text-white shadow-lg" aria-label="Report hazard"><Plus size={25} /></button>}<button onClick={() => go(p)} className={`flex min-w-14 flex-col items-center gap-1 text-[10px] font-bold ${page === p || (p === "more" && ["safety", "schedule", "settings"].includes(page)) ? "text-[#173f35]" : "text-[#7a8883]"}`}><Icon size={20} />{l}</button></div>)}</div></nav>;
}

function Dashboard({ authEnabled, initialRole = "worker", getToken, onSignOut }: { authEnabled: boolean; initialRole?: Role; getToken?: () => Promise<string | null>; onSignOut: () => void }) {
  const role = initialRole;
  const [page, setPage] = useState<Page>("home");
  const [reports, setReports] = useState(initialReports);
  const [checklist, setChecklist] = useState([false, false, false]);
  const [reportOpen, setReportOpen] = useState(false);
  const [manualAlertOpen, setManualAlertOpen] = useState(false);
  const [review, setReview] = useState<FieldReport | null>(null);
  const [notifications, setNotifications] = useState(false);
  const [remoteReady, setRemoteReady] = useState(!getToken);
  const [liveWeather, setLiveWeather] = useState<LiveWeather | null>(null);
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [analysisGeneratedAt, setAnalysisGeneratedAt] = useState("");
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [timeOffRequests, setTimeOffRequests] = useState(initialTimeOffRequests);
  const unread = reports.filter((r) => r.unread).length;
  const go = (next: Page) => { setPage(next); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const broadcast = (message: string) => { const now = Date.now(); setReports((current) => [{ id: now, type: "Site safety", detail: message, location: "All sectors", time: "Just now", createdAt: now, severity: "pause", status: "Supervisor resolved", unread: true, source: "supervisor", alertDescription: message, groupCount: 1, evidenceCount: 0 }, ...current]); };
  const applyAutomatedWeatherAlerts = (weather: LiveWeather) => {
    const generated: FieldReport[] = [];
    const now = Date.now();
    if ((weather.current.windMph ?? 0) >= 30) {
      generated.push({ id: now + 1, type: "Weather", detail: "Stop crane operations due to high wind", location: "All crane zones", time: "Just now", createdAt: now, severity: "pause", status: "Active alert", unread: true, source: "AI", alertDescription: `NOAA reports ${weather.current.windMph} mph wind. Crane operations remain stopped pending supervisor and manufacturer-limit review.`, groupCount: 1, evidenceCount: 0 });
    }
    const tornado = weather.activeAlerts.find((alert) => alert.event?.toLowerCase().includes("tornado warning"));
    if (tornado) {
      generated.push({ id: now + 2, type: "Weather", detail: tornado.headline ?? "Tornado Warning issued for the project area", location: "All sectors", time: "Just now", createdAt: now, severity: "evacuate", status: "Active alert", unread: true, source: "AI", alertDescription: tornado.instruction ?? "Stop work and move immediately to the designated tornado shelter.", groupCount: 1, evidenceCount: 0 });
    }
    if (generated.length) setReports((current) => [...generated.filter((alert) => !current.some((existing) => existing.detail === alert.detail && existing.status === "Active alert")), ...current]);
  };

  useEffect(() => {
    if (!getToken) return;
    loadReports<FieldReport>(getToken)
      .then((stored) => {
        if (stored?.length) setReports(stored.map((report) => ({
          ...report,
          createdAt: report.createdAt ?? Date.now(),
          groupCount: report.groupCount ?? 1,
          evidenceCount: report.evidenceCount ?? (report.evidence ? 1 : 0),
        })));
      })
      .catch((error) => console.warn("Using local report data:", error))
      .finally(() => setRemoteReady(true));
  }, [getToken]);

  useEffect(() => {
    if (!getToken || !remoteReady) return;
    const timeout = window.setTimeout(() => {
      saveReports(getToken, reports).catch((error) => console.warn("Report sync failed:", error));
    }, 400);
    return () => window.clearTimeout(timeout);
  }, [getToken, remoteReady, reports]);

  useEffect(() => {
    if (!getToken) return;
    loadCurrentWeather(getToken)
      .then((result) => {
        setLiveWeather(result.weather);
        applyAutomatedWeatherAlerts(result.weather);
      })
      .catch((error) => console.warn("Using fallback weather:", error));
    loadLatestAnalysis(getToken)
      .then((result) => {
        if (result) {
          setAnalysis(result.analysis);
          setAnalysisGeneratedAt(result.generatedAt);
        }
      })
      .catch((error) => console.warn("No saved AI analysis:", error));
  }, [getToken]);

  const refreshAnalysis = async () => {
    if (!getToken) return;
    setAnalysisLoading(true);
    setAnalysisError("");
    try {
      const result = await runDynamicAnalysis(getToken);
      setAnalysis(result.analysis);
      setAnalysisGeneratedAt(result.generatedAt);
      const weatherResult = await loadCurrentWeather(getToken);
      setLiveWeather(weatherResult.weather);
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "Analysis could not be refreshed.");
    } finally {
      setAnalysisLoading(false);
    }
  };

  let content: ReactNode;
  if (page === "safety") content = <SafetyPlan />;
  else if (page === "schedule") content = role === "boss" ? <TeamPage requests={timeOffRequests} onDecision={(id, status) => setTimeOffRequests((current) => current.map((request) => request.id === id ? { ...request, status } : request))} /> : <SchedulePage onRequest={(request) => setTimeOffRequests((current) => [{ ...request, id: Date.now(), worker: "Marcus Johnson", status: "Pending" }, ...current])} />;
  else if (page === "settings") content = <SettingsPage authEnabled={authEnabled} onSignOut={onSignOut} getToken={getToken} />;
  else if (page === "about") content = <AboutPage />;
  else if (page === "more") content = <MorePage role={role} go={go} />;
  else if (page === "alerts") content = <>{role === "boss" && <div className="mb-4 flex justify-end"><Button onClick={() => setManualAlertOpen(true)}><Siren size={16} />Send manual alert</Button></div>}<AlertsPage reports={reports} role={role} onReview={setReview} onRate={() => undefined} analysis={analysis} /></>;
  else if (role === "boss" && page === "weather") content = <ImpactPage onBroadcast={(message) => { broadcast(message); go("alerts"); }} analysis={analysis} weather={liveWeather} onRefresh={refreshAnalysis} refreshing={analysisLoading} error={analysisError} generatedAt={analysisGeneratedAt} />;
  else if (role === "boss" && page === "team") content = <TeamPage requests={timeOffRequests} onDecision={(id, status) => setTimeOffRequests((current) => current.map((request) => request.id === id ? { ...request, status } : request))} />;
  else if (role === "worker" && page === "weather") content = <WorkerWeather />;
  else content = role === "worker" ? <WorkerHome reports={reports} onReport={() => setReportOpen(true)} go={go} checklist={checklist} weather={liveWeather} onToggleChecklist={(index) => setChecklist((current) => current.map((done, itemIndex) => itemIndex === index ? !done : done))} /> : <SupervisorHome reports={reports} go={go} onReview={setReview} />;

  return <div className="theme-everglades min-h-screen bg-[#f3f5f1] pb-28 text-[#183c33]"><Header role={role} unread={unread} onBell={() => setNotifications(true)} onLogo={() => go("about")} onProfile={() => go("settings")} /><main className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 sm:py-7 lg:px-8">{page !== "home" && <button onClick={() => go("home")} className="mb-5 inline-flex items-center gap-1 text-sm font-bold text-[#577068]"><ArrowLeft size={16} />{page === "about" ? "Back to homepage" : "Back to overview"}</button>}{content}</main><Nav role={role} page={page} go={go} onReport={() => setReportOpen(true)} />{reportOpen && <ReportSheet onClose={() => setReportOpen(false)} onSubmit={(report) => setReports((current) => [report, ...current])} />}{manualAlertOpen && <ManualAlertSheet onClose={() => setManualAlertOpen(false)} onSend={(alert) => setReports((current) => [alert, ...current])} />}{review && <ReviewSheet report={review} onClose={() => setReview(null)} onResolve={(severity, description, resolution) => { const resolvedAt = Date.now(); setReports((current) => { const resolved = current.find((r) => r.id === review.id); if (!resolved) return current; const alert = { ...resolved, severity, alertDescription: description || resolved.alertDescription, resolution, resolvedAt, status: "Supervisor resolved" as const, source: "supervisor" as const, unread: true }; return [alert, ...current.filter((r) => r.id !== review.id)]; }); setReview(null); }} />}{notifications && <NotificationsSheet reports={reports} onClose={() => setNotifications(false)} onRead={() => setReports((current) => current.map((r) => ({ ...r, unread: false })))} />}</div>;
}

function SignInScreen({ onDemoLogin, productionReady = false, onProductionLogin }: { onDemoLogin: (role: Role) => void; productionReady?: boolean; onProductionLogin?: () => void }) {
  const [email, setEmail] = useState("worker@fieldcast.app");
  const [password, setPassword] = useState("FieldCast2026!");
  const [error, setError] = useState("");
  const login = () => {
    if (password !== "FieldCast2026!") return setError("Use the presentation access password.");
    if (email === "worker@fieldcast.app") onDemoLogin("worker");
    else if (email === "supervisor@fieldcast.app") onDemoLogin("boss");
    else setError("Choose one of the two presentation accounts.");
  };
  return (
    <div className="grid min-h-screen place-items-center bg-[#edf2ed] p-5">
      <div className="w-full max-w-xl rounded-3xl border border-[#d9e1da] bg-white p-6 shadow-[0_20px_60px_rgba(28,63,53,.12)] sm:p-8">
        <div className="mx-auto w-fit"><Brand /></div>
        <div className="mt-7 text-center text-3xl font-extrabold tracking-tight text-[#173f35]">Choose your workspace.</div>
        <p className="mx-auto mt-2 max-w-sm text-center text-sm leading-6 text-[#677872]">Sign in as a worker or supervisor to see the correct tools from the start.</p>
        <div className="mt-6 grid grid-cols-2 gap-2">
          <button onClick={() => { setEmail("worker@fieldcast.app"); setPassword("FieldCast2026!"); setError(""); }} className={`rounded-xl border p-3 text-left ${email.startsWith("worker") ? "border-[#2f6957] bg-[#e7f0ea]" : "border-[#dce3dd]"}`}>
            <div className="text-sm font-extrabold">Worker access</div>
            <div className="mt-1 truncate text-[10px] text-[#71807b]">worker@fieldcast.app</div>
          </button>
          <button onClick={() => { setEmail("supervisor@fieldcast.app"); setPassword("FieldCast2026!"); setError(""); }} className={`rounded-xl border p-3 text-left ${email.startsWith("supervisor") ? "border-[#2f6957] bg-[#e7f0ea]" : "border-[#dce3dd]"}`}>
            <div className="text-sm font-extrabold">Supervisor access</div>
            <div className="mt-1 truncate text-[10px] text-[#71807b]">supervisor@fieldcast.app</div>
          </button>
        </div>
        <label className="mt-5 block text-xs font-extrabold uppercase tracking-wide text-[#61736d]">Email</label>
        <input value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded-xl border border-[#d8e0d9] px-3 py-3 text-sm outline-none focus:border-[#4d796c]" />
        <label className="mt-4 block text-xs font-extrabold uppercase tracking-wide text-[#61736d]">Password</label>
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-[#d8e0d9] px-3 py-3 text-sm outline-none focus:border-[#4d796c]" />
        
        {error && <div className="mt-3 text-xs font-bold text-red-700">{error}</div>}
        <Button className="mt-5 w-full" onClick={login}>Enter workspace <ArrowRight size={16} /></Button>
        <div className="my-5 flex items-center gap-3 text-[10px] font-extrabold uppercase tracking-wide text-[#8a9792]"><span className="h-px flex-1 bg-[#dfe5df]" />Production account<span className="h-px flex-1 bg-[#dfe5df]" /></div>
        {productionReady ? (
          <Button variant="secondary" className="w-full" onClick={onProductionLogin}>Continue with signed-in account <ArrowRight size={16} /></Button>
        ) : (
          <ClerkAccess onComplete={onProductionLogin} />
        )}
        <p className="mt-3 text-center text-xs leading-5 text-[#75847f]">Production authentication returns securely to square-smooth-51287559.figma.site.</p>
        <div className="mt-4 flex items-center justify-center gap-2 text-xs font-semibold text-[#75847f]"><ShieldAlert size={14} />Production accounts secured by Clerk</div>
      </div>
    </div>
  );
}

function ClerkAccess({ onComplete }: { onComplete?: () => void }) {
  const { isLoaded, signIn, setActive } = useSignIn();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const sendEmailCode = async () => {
    if (!isLoaded || !signIn) return;
    setLoading(true);
    setError("");
    try {
      await signIn.create({ strategy: "email_code", identifier: email, signUpIfMissing: true });
      setCodeSent(true);
    } catch (reason) {
      const message = (reason as { errors?: Array<{ longMessage?: string; message?: string }> })?.errors?.[0];
      setError(message?.longMessage ?? message?.message ?? "Clerk could not send a verification code.");
    } finally {
      setLoading(false);
    }
  };

  const verifyEmailCode = async () => {
    if (!isLoaded || !signIn) return;
    setLoading(true);
    setError("");
    try {
      const result = await signIn.attemptFirstFactor({ strategy: "email_code", code });
      if (result.status === "complete" && result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
        onComplete?.();
      } else {
        setError("Clerk requires an additional verification step.");
      }
    } catch (reason) {
      const message = (reason as { errors?: Array<{ longMessage?: string; message?: string }> })?.errors?.[0];
      setError(message?.longMessage ?? message?.message ?? "The verification code was not accepted.");
    } finally {
      setLoading(false);
    }
  };

  return <div className="space-y-3"><input type="email" value={email} onChange={(event) => { setEmail(event.target.value); setCodeSent(false); setCode(""); }} placeholder="Company email" className="w-full rounded-xl border border-[#d8e0d9] px-3 py-3 text-sm outline-none focus:border-[#4d796c]" />{codeSent ? <><input inputMode="numeric" value={code} onChange={(event) => setCode(event.target.value)} placeholder="Enter the email verification code" className="w-full rounded-xl border border-[#d8e0d9] px-3 py-3 text-sm outline-none focus:border-[#4d796c]" /><Button variant="secondary" className="w-full" disabled={!code || loading} onClick={verifyEmailCode}>{loading ? "Verifying…" : "Verify code & sign in"}</Button><button onClick={sendEmailCode} className="w-full text-center text-xs font-bold text-[#41695d]">Send a new code</button></> : <Button variant="secondary" className="w-full" disabled={!isLoaded || !email || loading} onClick={sendEmailCode}>{loading ? "Sending code…" : "Continue with email code"}</Button>}{error && <div className="rounded-xl bg-red-50 p-3 text-xs font-bold text-red-800">{error}</div>}</div>;
}

export default function App({ authEnabled = false }: { authEnabled?: boolean }) {
  const [presentationRole, setPresentationRole] = useState<Role | null>(null);
  if (new URLSearchParams(window.location.search).get("sso-callback") === "1") {
    return <AuthenticateWithRedirectCallback />;
  }
  if (presentationRole) return <Dashboard authEnabled={false} initialRole={presentationRole} onSignOut={() => setPresentationRole(null)} />;
  return authEnabled ? <AuthenticatedApp onDemoLogin={setPresentationRole} /> : <SignInScreen onDemoLogin={setPresentationRole} />;
}

function AuthenticatedApp({ onDemoLogin }: { onDemoLogin: (role: Role) => void }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const clerk = useClerk();
  const { user } = useUser();
  const [productionEntered, setProductionEntered] = useState(false);
  if (!isLoaded) return <div className="grid min-h-screen place-items-center bg-[#edf2ed] p-5"><div className="rounded-2xl border border-[#d9e1da] bg-white p-6 text-center shadow-sm"><div className="mx-auto w-fit"><Brand /></div><div className="mt-5 text-lg font-extrabold text-[#173f35]">Connecting to Clerk…</div><p className="mt-2 text-sm text-[#6b7b75]">Loading secure authentication for the selected application.</p></div></div>;
  const role: Role = user?.publicMetadata.role === "boss" || user?.publicMetadata.role === "supervisor" ? "boss" : "worker";
  if (!productionEntered) return <SignInScreen onDemoLogin={onDemoLogin} productionReady={Boolean(isSignedIn)} onProductionLogin={() => setProductionEntered(true)} />;
  return isSignedIn ? <Dashboard authEnabled initialRole={role} getToken={getToken} onSignOut={() => { clerk.signOut(); setProductionEntered(false); }} /> : <SignInScreen onDemoLogin={onDemoLogin} />;
}
