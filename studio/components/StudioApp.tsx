"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  Archive, ArrowLeft, ArrowRight, CalendarDays, Check, CheckCircle2, ChevronRight, Clipboard,
  Download, FileCheck2, FileText, Grid3X3, Image as ImageIcon, ScanLine, Library, List, LogOut,
  Menu, Moon, Plus, Search, ShieldCheck, Sparkles, Sun, Video, X, WandSparkles, Clapperboard, Link2, RefreshCw, Ban,
  PanelLeftClose, PanelLeftOpen, Pencil, Upload, Home, ChevronLeft,
} from "lucide-react";
import { createZip } from "@/lib/zip";
import { MotionCanvas, StillCanvas, renderPromotionFile } from "./CreativeCanvas";
import type { Asset, CalendarItem, Campaign, Candidate, ContentRecord, Deliverable, StudioData } from "@/lib/client-types";
import { isDateInMonth } from "@/lib/calendar";
import { calendarDays, clubDate, DEFAULT_OUTPUTS, outputLabel, PROMOTION_OUTPUTS, recordSchedule, type PromotionOutput } from "@/lib/promotion";
import { parseStudioRoute, studioSearch, type StudioRoute, type StudioView } from "@/lib/studio-navigation";
import { uploadAsset } from "@/lib/assets-client";
import PromoKit from "./PromoKit";
import MotionStudio from "./MotionStudio";

const API = "/studio/api";
type View = StudioView;
const STATUS: Record<string, { label: string; tone: string }> = {
  needs_information: { label: "Needs information", tone: "neutral" },
  verified: { label: "Verified", tone: "teal" },
  campaign_generated: { label: "In progress", tone: "yellow" },
  done: { label: "Downloaded", tone: "dark" },
};
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Something went wrong.");
  return body;
}


function StatusBadge({ status }: { status: string }) {
  const value = STATUS[status] || STATUS.needs_information;
  return <span className={`status status-${value.tone}`}><span />{value.label}</span>;
}

function BrandMark({ inverse = false }: { inverse?: boolean }) {
  return (
    <span className={`brand-mark ${inverse ? "inverse" : ""}`} aria-label="Sun Oaks">
      <svg viewBox="0 0 44 44" role="img" aria-hidden="true">
        <circle cx="22" cy="22" r="8" fill="currentColor" />
        {[0, 45, 90, 135].map((degree) => <path key={degree} d="M22 2v9M22 33v9" stroke="currentColor" strokeWidth="2" transform={`rotate(${degree} 22 22)`} />)}
      </svg>
      <span>SUN OAKS<small>MARKETING STUDIO</small></span>
    </span>
  );
}

function Login({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      await api("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
      onSuccess();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign in failed.");
    } finally {
      setPending(false);
    }
  };
  return (
    <main className="login-page">
      <section className="login-visual" aria-label="Sun Oaks community">
        <div className="login-brand"><BrandMark inverse /></div>
        <div className="login-statement">
          <p className="eyebrow light">FACTS FIRST. CREATIVITY READY.</p>
          <h1>Turn trusted club information into a complete campaign.</h1>
          <p>One verified source. Coordinated stills, motion, caption, and email.</p>
        </div>
      </section>
      <section className="login-form-wrap">
        <form className="login-form" onSubmit={submit}>
          <p className="eyebrow">PILOT ACCESS</p>
          <h2>Welcome back</h2>
          <p className="muted">Sign in with the single Sun Oaks pilot account.</p>
          <label htmlFor="username">Username</label>
          <input id="username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required data-testid="input-username" />
          <label htmlFor="password">Password</label>
          <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required data-testid="input-password" />
          {error && <p className="inline-error" role="alert">{error}</p>}
          <button className="button primary full" disabled={pending} data-testid="button-sign-in">{pending ? "Checking…" : "Sign in"}<ArrowRight size={17} /></button>
          <p className="security-note"><ShieldCheck size={16} />Session credentials stay server-side.</p>
        </form>
      </section>
    </main>
  );
}

export default function StudioApp() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [data, setData] = useState<StudioData | null>(null);
  const [route, setRoute] = useState<StudioRoute>({ view: "create" });
  const routeRef = useRef(route);
  const dirtyRef = useRef(false);
  const markDirty = useCallback((dirty: boolean) => { dirtyRef.current = dirty; }, []);
  const view = route.view;
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [mobileNav, setMobileNav] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const editorRecordId = route.recordId || "";
  const editorOrigin = route.origin || "create";
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const load = async () => {
    try {
      const session = await api<{ authenticated: boolean }>("/auth/me");
      if (!session.authenticated) {
        setAuthenticated(false);
        setData(null);
        return;
      }
      setAuthenticated(true);
      setData(await api<StudioData>("/data"));
    } catch {
      setAuthenticated(false);
    }
  };
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => {
    const change = () => {
      if (dirtyRef.current && !window.confirm("You have unsaved changes. Leave without saving?")) {
        window.history.pushState(null, "", window.location.pathname + studioSearch(routeRef.current));
        return;
      }
      dirtyRef.current = false;
      const next = parseStudioRoute(window.location.search);
      routeRef.current = next;
      setRoute(next);
    };
    const timer = window.setTimeout(change, 0);
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirtyRef.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("popstate", change);
    window.addEventListener("beforeunload", beforeUnload);
    return () => { window.clearTimeout(timer); window.removeEventListener("popstate", change); window.removeEventListener("beforeunload", beforeUnload); };
  }, []);

  const mutate = async (payload: Record<string, unknown>) => {
    setError("");
    setLoading(true);
    try {
      const response = await api<Record<string, unknown>>("/actions", { method: "POST", body: JSON.stringify(payload) });
      setData(await api<StudioData>("/data"));
      return response;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The change could not be saved.");
      throw caught;
    } finally {
      setLoading(false);
    }
  };
  if (authenticated === null) return <main className="boot-screen"><BrandMark /><div className="skeleton-line" /></main>;
  if (!authenticated) return <Login onSuccess={load} />;
  if (!data) return <main className="boot-screen"><BrandMark /><div className="skeleton-line" /></main>;

  const nav = [
    { id: "create" as const, label: "Home", icon: Home },
    { id: "campaigns" as const, label: "Promotions", icon: Sparkles },
    { id: "library" as const, label: "Classes & events", icon: Library },
    { id: "calendar" as const, label: "Calendar", icon: CalendarDays },
  ];
  const go = (next: View, details: Omit<StudioRoute, "view"> = {}) => {
    if (dirtyRef.current && !window.confirm("You have unsaved changes. Leave without saving?")) return;
    dirtyRef.current = false;
    const nextRoute = { view: next, ...details };
    window.history.pushState(null, "", window.location.pathname + studioSearch(nextRoute));
    routeRef.current = nextRoute;
    setRoute(nextRoute);
    setMobileNav(false);
  };
  const openCampaign = (campaignId: string) => go("campaigns", { campaignId });
  const openEditor = (next: "promo" | "motion", recordId: string, origin: typeof editorOrigin) => go(next, { recordId, origin, campaignId: route.campaignId });
  const activePrimary = view === "promo" || view === "motion" || view === "ingester" ? editorOrigin : view;
  return (
    <div className={`app-shell ${sidebarCollapsed ? "sidebar-is-collapsed" : ""}`}>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside className={`sidebar ${mobileNav ? "is-open" : ""} ${sidebarCollapsed ? "is-collapsed" : ""}`}>
        <div className="sidebar-head"><BrandMark inverse /><button className="icon-button mobile-only" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X /></button></div>
        <nav aria-label="Studio navigation">
          {nav.map((item) => {
            const Icon = item.icon;
            return <button key={item.id} className={activePrimary === item.id ? "active" : ""} onClick={() => go(item.id)} data-testid={`nav-${item.id}`} title={sidebarCollapsed ? item.label : undefined}><Icon size={19} /><span>{item.label}</span></button>;
          })}
        </nav>
        <div className="sidebar-foot">
          {/* Static Brand House is intentionally outside the Next.js base path. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" className="brand-house-link" title={sidebarCollapsed ? "Brand House" : undefined}><Archive size={17} /><span>Brand House</span></a>
          <div className="account-row"><span className="avatar">SO</span><span>Pilot account<small>All capabilities</small></span>
            <button className="icon-button inverse" aria-label="Sign out" title="Sign out" onClick={async () => { await api("/auth/logout", { method: "POST" }); setAuthenticated(false); }}><LogOut size={17} /></button>
          </div>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <button className="icon-button mobile-only" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu /></button>
          <button className="icon-button desktop-only" onClick={() => setSidebarCollapsed((value) => !value)} aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"} title={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"} data-testid="button-collapse-nav">
            {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
          <div className="topbar-context"><span className="sync-dot" />Sun Oaks Studio</div>
          <button className="icon-button" onClick={() => setTheme(theme === "light" ? "dark" : "light")} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`} data-testid="button-theme">
            {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
          </button>
        </header>
        {error && <div className="global-error" role="alert">{error}<button onClick={() => setError("")} aria-label="Dismiss error"><X size={16} /></button></div>}
        <main id="main-content" className="content">
          {view === "create" && <CreateView key={route.itemId || route.recordId || "home"} data={data} mutate={mutate} initialRecordId={route.recordId} initialItemId={route.itemId} openImport={() => go("ingester")} openCampaign={openCampaign} />}
          {view === "calendar" && <CalendarView data={data} mutate={mutate} openCampaign={openCampaign} goCreate={() => go("create")} />}
          {view === "promo" && <PromoKit key={`promo-${editorRecordId}`} data={data} mutate={mutate} initialRecordId={editorRecordId} onDirtyChange={markDirty} onBack={() => go(editorOrigin, { campaignId: route.campaignId })} />}
          {view === "motion" && <MotionStudio key={`motion-${editorRecordId}`} data={data} mutate={mutate} initialRecordId={editorRecordId} onDirtyChange={markDirty} onBack={() => go(editorOrigin, { campaignId: route.campaignId })} />}
          {view === "ingester" && <IngesterView data={data} mutate={mutate} onPublished={(recordId, itemId) => go("create", { recordId, itemId })} />}
          {view === "library" && <LibraryView data={data} mutate={mutate} refresh={load} openEditor={(next, id) => openEditor(next, id, "library")} />}
          {view === "campaigns" && <CampaignsView key={route.campaignId || "promotions"} data={data} campaignId={route.campaignId} mutate={mutate} refresh={load} onDirtyChange={markDirty} openCampaign={openCampaign} openEditor={(next, id) => openEditor(next, id, "campaigns")} goCreate={(recordId) => go("create", { recordId })} />}

        </main>
        {loading && <div className="saving-indicator" role="status">Saving to Studio…</div>}
      </div>

    </div>
  );
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <header className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>{action}</header>;
}

function CreateView({ data, mutate, initialRecordId, initialItemId, openImport, openCampaign }: {
  data: StudioData; mutate: (value: Record<string, unknown>) => Promise<Record<string, unknown>>;
  initialRecordId?: string; initialItemId?: string; openImport: () => void; openCampaign: (id: string) => void;
}) {
  const records = data.records.filter((record) => record.active && record.verificationStatus === "verified");
  const [recordId, setRecordId] = useState(initialRecordId || records[0]?.id || "");
  const [creating, setCreating] = useState(Boolean(initialRecordId));
  const [chosenItemId, setChosenItemId] = useState(initialItemId);
  const record = records.find((item) => item.id === recordId);
  const pendingItem = data.calendarItems.find((item) => item.contentRecordId === recordId && !item.campaignId && (!chosenItemId || item.id === chosenItemId));
  const recent = [...data.campaigns].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);
  const upcoming = [...data.calendarItems].filter((item) => item.marketingDate >= clubDate() && !item.campaignId).sort((a, b) => a.marketingDate.localeCompare(b.marketingDate)).slice(0, 4);
  return <div className="promotion-home">
    <PageHeading eyebrow="SUN OAKS STUDIO" title="What are we promoting?" description="Start with a class or event. Make the materials you need." action={<button className="button secondary" onClick={openImport}><Plus size={17} />Add a class or event</button>} />
    <section className="promotion-start">
      <div><label htmlFor="promotion-source">Class or event</label><select id="promotion-source" value={recordId} onChange={(event) => { setRecordId(event.target.value); setChosenItemId(undefined); }}><option value="" disabled>Choose a class or event</option>{records.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{record && <p>{recordSchedule(record, data.scheduleRules)}{record.location ? ` · ${record.location}` : ""}</p>}</div>
      <button className="button primary" disabled={!record} onClick={() => setCreating(true)}>Create promotion<ArrowRight size={17} /></button>
    </section>
    {!records.length && <section className="empty-state"><h2>Start with your next class or event</h2><p>Add its details once, then use them across your promotional materials.</p><button className="button primary" onClick={openImport}>Add details</button></section>}
    <section className="promotion-section"><header><h2>Recent promotions</h2><span>{recent.length ? "Pick up where you left off" : "Your work will appear here"}</span></header>
      {recent.length ? <div className="promotion-grid">{recent.map((campaign) => <PromotionCard key={campaign.id} campaign={campaign} data={data} open={() => openCampaign(campaign.id)} />)}</div> : <div className="promotion-empty"><ImageIcon size={25} /><p>Create your first promotion above. Your images, copy, and review status will stay together.</p></div>}
    </section>
    {upcoming.length > 0 && <section className="promotion-section"><header><h2>Coming up</h2><span>Planned promotions</span></header><div className="upcoming-list">{upcoming.map((item) => {
      const source = records.find((entry) => entry.id === item.contentRecordId);
      return source && <button key={item.id} onClick={() => { setRecordId(source.id); setChosenItemId(item.id); setCreating(true); }}><time>{new Date(`${item.marketingDate}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</time><strong>{source.name}</strong><span>Create materials<ArrowRight size={16} /></span></button>;
    })}</div></section>}
    {creating && record && <QuickCreate record={record} item={pendingItem} data={data} mutate={mutate} onClose={() => setCreating(false)} onGenerated={openCampaign} />}
  </div>;
}

function PromotionCard({ campaign, data, open }: { campaign: Campaign; data: StudioData; open: () => void }) {
  const outputs = data.deliverables.filter((item) => item.campaignId === campaign.id);
  const downloaded = data.calendarItems.find((item) => item.id === campaign.calendarItemId)?.status === "done";
  const label = downloaded ? "Downloaded" : campaign.rollupStatus === "ready" ? "Ready to download" : campaign.rollupStatus === "changes_requested" ? "Changes requested" : campaign.rollupStatus === "blocked" ? "Needs attention" : "Draft";
  return <button className="promotion-card" onClick={open}>
    <div className="promotion-card-photo" style={campaign.sourceSnapshot.asset ? { backgroundImage: `url("${campaign.sourceSnapshot.asset.fileReference}")` } : undefined}><span>{campaign.sourceSnapshot.facts.recordType === "event" ? "EVENT" : "CLASS"}</span></div>
    <div className="promotion-card-body"><span className="promotion-card-status">{label}</span><h3>{campaign.sourceSnapshot.facts.name}</h3><p>{outputs.length} {outputs.length === 1 ? "material" : "materials"} · {new Date(campaign.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p><span className="promotion-card-action">{downloaded || campaign.rollupStatus === "ready" ? "Open materials" : "Continue editing"}<ArrowRight size={16} /></span></div>
  </button>;
}

function CalendarView({ data, mutate, openCampaign, goCreate }: { data: StudioData; mutate: (value: Record<string, unknown>) => Promise<Record<string, unknown>>; openCampaign: (id: string) => void; goCreate: () => void }) {
  const today = clubDate();
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [year, monthNumber] = month.split("-").map(Number);
  const [mode, setMode] = useState<"month" | "agenda">("agenda");
  const [selected, setSelected] = useState<CalendarItem | null>(null);
  const title = new Date(year, monthNumber - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const items = [...data.calendarItems].filter((item) => isDateInMonth(item.marketingDate, year, monthNumber)).sort((a, b) => a.marketingDate.localeCompare(b.marketingDate));
  const moveMonth = (amount: number) => { const next = new Date(year, monthNumber - 1 + amount, 1); setMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`); };
  const open = (item: CalendarItem) => item.campaignId ? openCampaign(item.campaignId) : setSelected(item);
  const record = selected && data.records.find((item) => item.id === selected.contentRecordId);
  return <>
    <PageHeading eyebrow="PROMOTION CALENDAR" title={title} description="When you plan to share each promotion." action={<button className="button primary" onClick={goCreate}><Plus size={17} />Create promotion</button>} />
    <section className="calendar-toolbar" aria-label="Calendar controls"><div className="month-navigation"><button className="icon-button" onClick={() => moveMonth(-1)} aria-label="Previous month"><ChevronLeft size={18} /></button><button className="button secondary compact" onClick={() => setMonth(today.slice(0, 7))}>This month</button><button className="icon-button" onClick={() => moveMonth(1)} aria-label="Next month"><ChevronRight size={18} /></button></div><div className="segmented"><button className={mode === "agenda" ? "active" : ""} onClick={() => setMode("agenda")}>List</button><button className={mode === "month" ? "active" : ""} onClick={() => setMode("month")}>Month</button></div></section>
    {mode === "month" ? <section className="month-grid" aria-label={`${title} promotion calendar`}>{WEEKDAYS.map((day) => <div className="weekday" key={day}>{day}</div>)}{calendarDays(year, monthNumber).map((day, index) => <div key={index} className={`calendar-day ${day && `${month}-${String(day).padStart(2, "0")}` === today ? "today" : ""} ${day === null ? "outside" : ""}`}>
      {day && <span className="day-number">{day}</span>}{day && items.filter((item) => Number(item.marketingDate.slice(-2)) === day).map((item) => <button className="calendar-card" key={item.id} onClick={() => open(item)}><strong>{data.records.find((source) => source.id === item.contentRecordId)?.name}</strong><span>{item.campaignId ? "Open promotion" : "Create materials"}</span></button>)}
    </div>)}</section> : items.length ? <section className="agenda-list">{items.map((item) => <article className="agenda-row" key={item.id}><time>{new Date(`${item.marketingDate}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</time><div><h2>{data.records.find((source) => source.id === item.contentRecordId)?.name}</h2></div><StatusBadge status={item.status} /><button className="button secondary compact" onClick={() => open(item)}>Open<ChevronRight size={16} /></button></article>)}</section> : <section className="empty-state"><CalendarDays size={32} /><h2>No promotions planned this month</h2><button className="button primary" onClick={goCreate}>Create promotion</button></section>}
    {selected && record && <QuickCreate item={selected} record={record} data={data} onClose={() => setSelected(null)} mutate={mutate} onGenerated={openCampaign} />}
  </>;
}

function QuickCreate({ item, record, data, onClose, mutate, onGenerated }: {
  item?: CalendarItem; record: ContentRecord; data: StudioData; onClose: () => void;
  mutate: (value: Record<string, unknown>) => Promise<Record<string, unknown>>; onGenerated: (id: string) => void;
}) {
  const [formats, setFormats] = useState<PromotionOutput[]>([...DEFAULT_OUTPUTS]);
  const [marketingDate, setMarketingDate] = useState(item?.marketingDate || clubDate());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const focusable = () => dialog ? [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')] : [];
    focusable()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      opener?.focus();
    };
  }, [onClose]);
  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside ref={dialogRef} className="drawer" role="dialog" aria-modal="true" aria-labelledby="quick-title">
        <header><div><p className="eyebrow">NEW PROMOTION</p><h2 id="quick-title">{record.name}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close new promotion"><X /></button></header>
        <div className="confirmed-details"><ShieldCheck size={18} /><div><strong>Confirmed details</strong><p>{recordSchedule(record, data.scheduleRules)}</p><p>{record.location}</p><p>{record.price} {record.instructor ? ` · ${record.instructor}` : ""}</p><p>{record.cta}</p></div></div>
        <fieldset className="output-picker"><legend>What do you need?</legend>{PROMOTION_OUTPUTS.map((output) => <label key={output.id} className={formats.includes(output.id) ? "selected" : ""}><input type="checkbox" checked={formats.includes(output.id)} onChange={() => setFormats((current) => current.includes(output.id) ? current.filter((id) => id !== output.id) : [...current, output.id])} /><span><strong>{output.label}</strong><small>{output.detail}</small></span></label>)}</fieldset>
        <label className="promotion-date">Plan to share on<input type="date" value={marketingDate} onChange={(event) => setMarketingDate(event.target.value)} required /></label>
        {error && <p className="inline-error" role="alert">{error}</p>}
        <button className="button primary full generate" disabled={pending || !formats.length || !marketingDate} onClick={async () => {
          setPending(true); setError("");
          try { const result = await mutate({ action: "createPromotion", recordId: record.id, calendarItemId: item?.id, marketingDate, formats }); onGenerated(String(result.campaignId)); }
          catch (caught) { setError(caught instanceof Error ? caught.message : "Could not create your promotion. Try again."); }
          finally { setPending(false); }
        }} data-testid="button-generate-campaign">{pending ? "Creating your materials…" : `Create ${formats.length} ${formats.length === 1 ? "material" : "materials"}`}<ArrowRight size={17} /></button>
        <p className="drawer-footnote">Nothing is posted or sent. Review your materials before downloading.</p>

      </aside>
    </div>
  );
}

function IngesterView({ data, mutate, onPublished }: { data: StudioData; mutate: (value: Record<string, unknown>) => Promise<Record<string, unknown>>; onPublished: (recordId: string, itemId: string) => void }) {
  const [mode, setMode] = useState<"plain_text" | "guided">("plain_text");
  const [rawText, setRawText] = useState("");
  const [guidedType, setGuidedType] = useState<"event" | "recurring_class">("event");
  const [guided, setGuided] = useState({ name: "", date: "", days: "", startTime: "", endTime: "", location: "", instructor: "", price: "" });
  const [preview, setPreview] = useState<{ source: { id: string }; candidate: Candidate; duplicate: { kind: string; record?: ContentRecord } | null } | null>(null);
  const [marketingDate, setMarketingDate] = useState(clubDate);
  const [duplicateDecision, setDuplicateDecision] = useState<"create" | "update">("create");
  useEffect(() => {
    try {
      const draft = window.localStorage.getItem("sunoaks-ingester-draft");
      if (draft) queueMicrotask(() => setRawText(draft));
    } catch {}
  }, []);
  useEffect(() => {
    const handle = window.setTimeout(() => { try { window.localStorage.setItem("sunoaks-ingester-draft", rawText); } catch {} }, 350);
    return () => window.clearTimeout(handle);
  }, [rawText]);
  const displayTime = (value: string) => {
    if (!value) return "";
    const [hourText, minute] = value.split(":");
    const hour = Number(hourText);
    return `${hour % 12 || 12}:${minute} ${hour >= 12 ? "PM" : "AM"}`;
  };
  const guidedText = [
    guided.name,
    guidedType === "event" ? guided.date : guided.days ? `Every ${guided.days}` : "",
    guidedType === "recurring_class" && guided.date ? `Starts: ${guided.date}` : "",
    guided.startTime ? `Time: ${displayTime(guided.startTime)}${guided.endTime ? ` to ${displayTime(guided.endTime)}` : ""}` : "",
    guided.location ? `Location: ${guided.location}` : "",
    guided.instructor ? `Instructor: ${guided.instructor}` : "",
    guided.price ? `Price: ${guided.price}` : "",
  ].filter(Boolean).join("\n");
  const sourceText = mode === "plain_text" ? rawText : guidedText;
  const setGuidedField = (field: keyof typeof guided, value: string) => setGuided((current) => ({ ...current, [field]: value }));
  const parse = async () => {
    const result = await mutate({ action: "previewSource", rawText: sourceText, sourceType: mode, guidedType: mode === "guided" ? guidedType : undefined });
    setPreview(result as typeof preview);
  };
  const edit = (field: keyof Candidate, value: string | number[]) => setPreview((current) => current ? { ...current, candidate: { ...current.candidate, [field]: value } } : current);
  return (
    <>
      <PageHeading eyebrow="ADD A CLASS OR EVENT" title={preview ? "Check the details" : "What’s happening at Sun Oaks?"} description={preview ? "Confirm the details your promotional materials will use." : "Paste an announcement or fill in the details."} />
      {!preview ? (
        <section className="ingest-layout">
          <div className="ingest-panel">
            <div className="segmented wide"><button className={mode === "plain_text" ? "active" : ""} onClick={() => setMode("plain_text")}><Clipboard size={16} />Plain text</button><button className={mode === "guided" ? "active" : ""} onClick={() => setMode("guided")}><FileText size={16} />Guided</button></div>
            {mode === "guided" && <>
              <fieldset className="type-choice"><legend>What are you adding?</legend><label><input type="radio" checked={guidedType === "event"} onChange={() => setGuidedType("event")} />One-time event</label><label><input type="radio" checked={guidedType === "recurring_class"} onChange={() => setGuidedType("recurring_class")} />Recurring class</label></fieldset>
              <div className="guided-grid">
                <label className="span-2">Name<input value={guided.name} onChange={(event) => setGuidedField("name", event.target.value)} data-testid="input-guided-name" /></label>
                {guidedType === "event"
                  ? <label>Date<input type="date" value={guided.date} onChange={(event) => setGuidedField("date", event.target.value)} /></label>
                  : <><label>Schedule starts<input type="date" value={guided.date} onChange={(event) => setGuidedField("date", event.target.value)} /></label><label>Recurring days<input value={guided.days} onChange={(event) => setGuidedField("days", event.target.value)} placeholder="Tuesday, Thursday" /></label></>}
                <label>Start time<input type="time" value={guided.startTime} onChange={(event) => setGuidedField("startTime", event.target.value)} /></label>
                <label>End time<input type="time" value={guided.endTime} onChange={(event) => setGuidedField("endTime", event.target.value)} /></label>
                <label>Location<input value={guided.location} onChange={(event) => setGuidedField("location", event.target.value)} /></label>
                <label>Instructor / host<input value={guided.instructor} onChange={(event) => setGuidedField("instructor", event.target.value)} /></label>
                <label>Price<input value={guided.price} onChange={(event) => setGuidedField("price", event.target.value)} placeholder="Optional" /></label>
              </div>
            </>}
            {mode === "plain_text" && <>
              <label htmlFor="source-text">Paste source information</label>
              <textarea id="source-text" rows={12} value={rawText} onChange={(event) => setRawText(event.target.value)} placeholder={"Example:\nPoolside Family Night\nSeptember 18, 2026 at 6:30 PM\nOutdoor Pool\nMembers and guests welcome."} data-testid="textarea-source" />
              <div className="draft-row"><span><CheckCircle2 size={15} />Draft autosaved on this browser only</span><span>{rawText.length} characters</span></div>
            </>}
            <button className="button primary" disabled={sourceText.trim().length < 2} onClick={parse} data-testid="button-extract">Continue<ArrowRight size={17} /></button>
          </div>
          <aside className="process-note"><h2>A little detail goes a long way</h2><p>Include the name, date or recurring days, time, location, and how to register. You can check and correct everything before creating materials.</p></aside>
        </section>
      ) : (
        <section className="review-layout">
          <div className="review-form">
            {preview.duplicate && <div className="duplicate-alert"><Search size={19} /><div><strong>{preview.duplicate.kind === "source_fingerprint" ? "This exact source was processed before." : "A possible matching record exists."}</strong><p>Choose whether to create a separate record or publish this as a new verified version.</p></div></div>}
            <div className="review-head"><div><span className="source-tag">SOURCE SAVED</span><h2>Candidate {preview.candidate.recordType === "event" ? "event" : "recurring class"}</h2></div><button className="button text" onClick={() => setPreview(null)}><ArrowLeft size={16} />Back to source</button></div>
            <div className="form-grid">
              <label className="span-2">Name<input value={preview.candidate.name} onChange={(e) => edit("name", e.target.value)} /><small>Source: “{preview.candidate.sourceExcerpts.name}”</small></label>
              <label className="span-2">Summary<textarea rows={3} value={preview.candidate.summary} onChange={(e) => edit("summary", e.target.value)} /></label>
              {preview.candidate.recordType === "event" ? <label>Date<input type="date" value={preview.candidate.date || ""} onChange={(e) => edit("date", e.target.value)} /></label> :
                <><fieldset className="span-2 days"><legend>Repeats on</legend>{DAY_NAMES.map((day, index) => <label key={day}><input type="checkbox" checked={preview.candidate.daysOfWeek.includes(index)} onChange={() => edit("daysOfWeek", preview.candidate.daysOfWeek.includes(index) ? preview.candidate.daysOfWeek.filter((value) => value !== index) : [...preview.candidate.daysOfWeek, index])} />{day}</label>)}</fieldset><label>Schedule starts<input type="date" value={preview.candidate.date || ""} onChange={(e) => edit("date", e.target.value)} /></label></>}
              <label>Start time<input type="time" value={preview.candidate.startTime || ""} onChange={(e) => edit("startTime", e.target.value)} /></label>
              <label>End time<input type="time" value={preview.candidate.endTime || ""} onChange={(e) => edit("endTime", e.target.value)} /></label>
              <label>Location<input value={preview.candidate.location || ""} onChange={(e) => edit("location", e.target.value)} /></label>
              <label>Instructor / host<input value={preview.candidate.instructor || ""} onChange={(e) => edit("instructor", e.target.value)} /></label>
              <label>Price<input value={preview.candidate.price || ""} onChange={(e) => edit("price", e.target.value)} /></label>
              <label>Marketing date<input type="date" value={marketingDate} onChange={(e) => setMarketingDate(e.target.value)} /></label>
              <label>Call to action<input value={(preview.candidate as Candidate & { cta?: string }).cta || (preview.candidate.recordType === "event" ? "RSVP at the front desk" : "Reserve in the Sun Oaks app")} onChange={(e) => setPreview(current => current ? { ...current, candidate: { ...current.candidate, cta: e.target.value } as Candidate } : current)} /></label>
              <label>Approved image<select value={(preview.candidate as Candidate & { assetId?: string }).assetId || ""} onChange={(e) => setPreview(current => current ? { ...current, candidate: { ...current.candidate, assetId: e.target.value || null } as Candidate } : current)}><option value="">No photo — brand fallback</option>{data.assets.filter((asset) => asset.active && asset.rightsStatus === "approved").map((asset) => <option key={asset.id} value={asset.id}>{asset.title}</option>)}</select></label>
            </div>
            {preview.duplicate?.record && <fieldset className="merge-choice"><legend>Duplicate decision</legend><label><input type="radio" checked={duplicateDecision === "create"} onChange={() => setDuplicateDecision("create")} />Create a separate trusted record</label><label><input type="radio" checked={duplicateDecision === "update"} onChange={() => setDuplicateDecision("update")} />Update “{preview.duplicate.record.name}” as version {preview.duplicate.record.version + 1}</label></fieldset>}
            <div className="verify-bar"><div><FileCheck2 size={20} /><span><strong>Human verification</strong><small>Publishing confirms these operational facts.</small></span></div>
              <button className="button primary" onClick={async () => {
                const extra = preview.candidate as Candidate & { cta?: string; assetId?: string | null };
                const published = await mutate({
                  action: "publishCandidate", sourceId: preview.source.id,
                  candidate: { ...preview.candidate, cta: extra.cta || (preview.candidate.recordType === "event" ? "RSVP at the front desk" : "Reserve in the Sun Oaks app"), assetId: extra.assetId || null },
                  duplicateDecision, duplicateRecordId: preview.duplicate?.record?.id, marketingDate,
                });
                try { window.localStorage.removeItem("sunoaks-ingester-draft"); } catch {}
                onPublished(String(published.recordId), String(published.calendarItemId));
              }} data-testid="button-verify-publish"><Check size={17} />Confirm details & continue</button>
            </div>
          </div>
          <aside className="review-evidence"><h2>Source evidence</h2>{Object.entries(preview.candidate.sourceExcerpts).map(([key, excerpt]) => <div key={key}><span>{key}</span><blockquote>{excerpt || "No supporting excerpt found"}</blockquote></div>)}
            <h3>Attention</h3>{preview.candidate.warnings.length ? <ul>{preview.candidate.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : <p className="all-clear"><CheckCircle2 size={17} />Required facts were found. Confirm before publishing.</p>}</aside>
        </section>
      )}
    </>
  );
}

function RecordEditDrawer({ record, onClose, mutate, refresh }: {
  record: ContentRecord;
  onClose: () => void;
  mutate: (value: Record<string, unknown>) => Promise<Record<string, unknown>>;
  refresh: () => Promise<void>;
}) {
  const [fields, setFields] = useState({
    name: record.name, summary: record.summary, description: record.description, date: record.date || "",
    startTime: record.startTime || "", endTime: record.endTime || "", location: record.location || "",
    instructor: record.instructor || "", price: record.price || "", cta: record.cta,
  });
  const [uploading, setUploading] = useState(false);
  const patch = (key: keyof typeof fields, value: string) => setFields((current) => ({ ...current, [key]: value }));
  const save = async () => {
    const changes = Object.fromEntries(Object.entries(fields).filter(([key, value]) =>
      value !== String(record[key as keyof ContentRecord] || ""),
    ));
    if (Object.keys(changes).length) await mutate({ action: "updateRecord", recordId: record.id, changes });
    onClose();
  };
  const upload = async (file: File) => {
    setUploading(true);
    try {
      const asset = await uploadAsset(file);
      await mutate({ action: "setRecordAsset", recordId: record.id, assetId: asset.id });
      await refresh();
    } finally {
      setUploading(false);
    }
  };
  return <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className="drawer edit-record-drawer" role="dialog" aria-modal="true" aria-labelledby="edit-record-title">
      <header><div><p className="eyebrow">TRUSTED RECORD · VERSION {record.version}</p><h2 id="edit-record-title">Edit campaign information</h2></div><button className="icon-button" onClick={onClose} aria-label="Close editor"><X /></button></header>
      <div className="drawer-image-upload"><ImageIcon size={20} /><span><strong>Campaign image</strong><small>Replacing it creates a new trusted version.</small></span><label className="button secondary compact"><Upload size={15} />{uploading ? "Uploading…" : "Add / replace"}<input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ""; }} /></label></div>
      <div className="form-grid edit-record-form">
        <label className="span-2">Name<input value={fields.name} onChange={(event) => patch("name", event.target.value)} /></label>
        <label className="span-2">Summary<textarea rows={3} value={fields.summary} onChange={(event) => patch("summary", event.target.value)} /></label>
        <label className="span-2">Description<textarea rows={4} value={fields.description} onChange={(event) => patch("description", event.target.value)} /></label>
        {record.recordType === "event" && <label>Date<input type="date" value={fields.date} onChange={(event) => patch("date", event.target.value)} /></label>}
        <label>Start time<input type="time" value={fields.startTime} onChange={(event) => patch("startTime", event.target.value)} /></label>
        <label>End time<input type="time" value={fields.endTime} onChange={(event) => patch("endTime", event.target.value)} /></label>
        <label>Location<input value={fields.location} onChange={(event) => patch("location", event.target.value)} /></label>
        <label>Instructor / host<input value={fields.instructor} onChange={(event) => patch("instructor", event.target.value)} /></label>
        <label>Price<input value={fields.price} onChange={(event) => patch("price", event.target.value)} /></label>
        <label className="span-2">Call to action<input value={fields.cta} onChange={(event) => patch("cta", event.target.value)} /></label>
      </div>
      <div className="drawer-save"><p><ShieldCheck size={16} />Existing campaign snapshots remain unchanged.</p><button className="button primary" onClick={save} data-testid="button-save-record"><Check size={16} />Save new version</button></div>
    </aside>
  </div>;
}

function LibraryView({ data, mutate, refresh, openEditor }: {
  data: StudioData;
  mutate: (value: Record<string, unknown>) => Promise<Record<string, unknown>>;
  refresh: () => Promise<void>;
  openEditor: (view: "promo" | "motion", recordId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<ContentRecord | null>(null);
  const records = data.records.filter((record) => record.active && record.name.toLowerCase().includes(query.toLowerCase()));
  return (
    <>
      <PageHeading eyebrow="CLUB INFORMATION" title="Classes & events" description="Keep the details and photos your promotions use up to date." />
      <div className="library-toolbar"><label className="search-field"><Search size={17} /><span className="sr-only">Search records</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search classes and events" data-testid="input-library-search" /></label><span>{records.length} active records</span></div>
      <section className="table-wrap"><table><thead><tr><th>Record</th><th>Type</th><th>Schedule</th><th>Source trust</th><th>State</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{records.map((record) => <tr key={record.id}>
        <td><div className="record-cell"><span className="asset-thumb">{record.assetId ? <ImageIcon size={18} /> : <span>SO</span>}</span><span><strong>{record.name}</strong><small>{record.summary}</small></span></div></td>
        <td>{record.recordType === "event" ? "Event" : "Recurring class"}</td>
        <td>{record.date || `${record.startTime || "Time pending"} · ${record.location || "Location pending"}`}</td>
        <td><span className="verified-line"><ShieldCheck size={16} />Verified · v{record.version}</span><small>{new Date(record.lastConfirmedAt).toLocaleDateString()}</small></td>
        <td><StatusBadge status={record.status} /></td>
        <td><div className="row-actions"><button className="button secondary compact" onClick={() => setEditing(record)} data-testid={`button-edit-record-${record.id}`}><Pencil size={14} />Edit</button><button className="button primary compact" onClick={() => openEditor("promo", record.id)}><WandSparkles size={14} />More formats</button><button className="button secondary compact" onClick={() => openEditor("motion", record.id)}><Clapperboard size={14} />Animation</button></div></td>
      </tr>)}</tbody></table></section>
      {editing && <RecordEditDrawer record={editing} onClose={() => setEditing(null)} mutate={mutate} refresh={refresh} />}
    </>
  );
}

function CampaignsView({ data, campaignId, mutate, refresh, openEditor, openCampaign, goCreate, onDirtyChange }: {
  data: StudioData; campaignId?: string; mutate: (value: Record<string, unknown>) => Promise<Record<string, unknown>>;
  refresh: () => Promise<void>; openEditor: (view: "promo" | "motion", recordId: string) => void;
  openCampaign: (id: string) => void; goCreate: (recordId?: string) => void; onDirtyChange: (dirty: boolean) => void;
}) {
  const campaign = data.campaigns.find((item) => item.id === campaignId);
  if (campaignId && !campaign) return <section className="empty-state"><h2>Promotion not found</h2><p>It may have been removed or this link may be out of date.</p><button className="button primary" onClick={() => goCreate()}>Return home</button></section>;
  if (campaign) return <CampaignWorkspace key={campaign.id} campaign={campaign} data={data} mutate={mutate} refresh={refresh} onSelect={openCampaign} goCreate={goCreate} onDirtyChange={onDirtyChange} />;
  return <>
    <PageHeading eyebrow="YOUR WORK" title="Promotions" description="Your materials, messages, and review status in one place." action={<button className="button primary" onClick={() => goCreate()}><Plus size={17} />Create promotion</button>} />
    {data.campaigns.length ? <div className="promotion-grid">{[...data.campaigns].reverse().map((item) => <PromotionCard key={item.id} campaign={item} data={data} open={() => openCampaign(item.id)} />)}</div> : <section className="empty-state"><h2>No promotions yet</h2><p>Start with a class or event and choose the materials you need.</p><button className="button primary" onClick={() => goCreate()}>Create promotion</button></section>}
    {data.creativeProjects.length > 0 && <section className="promotion-section"><header><h2>Standalone designs</h2><span>Saved in the additional design tools</span></header><div className="upcoming-list">{data.creativeProjects.map((project) => <button key={project.id} onClick={() => openEditor(project.kind, project.recordId)}><strong>{project.title}</strong><span>Open {project.kind === "motion" ? "animation" : "design"}<ArrowRight size={16} /></span></button>)}</div></section>}
  </>;
}

function CampaignMessageEditor({ campaign, deliverables, mutate, onDirtyChange }: {
  campaign: Campaign; deliverables: Deliverable[]; mutate: (value: Record<string, unknown>) => Promise<Record<string, unknown>>;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const original = { headline: deliverables[0]?.creativeFields.headline || campaign.sourceSnapshot.facts.name, hook: deliverables[0]?.creativeFields.hook || "Join us at Sun Oaks." };
  const [fields, setFields] = useState(original);
  const [saved, setSaved] = useState(JSON.stringify(original));
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const dirty = JSON.stringify(fields) !== saved;
  useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false); }, [dirty, onDirtyChange]);
  return <section className="campaign-message-editor"><div><p className="eyebrow">YOUR MESSAGE</p><h2>Make it sound like Sun Oaks</h2><p>Save your wording across these materials. Dates, times, and registration details stay confirmed.</p></div><div className="message-fields">
    <label>Headline<input value={fields.headline} maxLength={200} disabled={pending} onChange={(event) => setFields((current) => ({ ...current, headline: event.target.value }))} /></label>
    <label>Short message<textarea rows={2} value={fields.hook} maxLength={400} disabled={pending} onChange={(event) => setFields((current) => ({ ...current, hook: event.target.value }))} /></label>
    <div className="message-save"><span role="status">{pending ? "Saving…" : dirty ? "Unsaved changes" : message || "Saved"}</span><button className="button secondary compact" disabled={!dirty || pending || !fields.headline.trim() || !fields.hook.trim()} onClick={async () => {
      setPending(true); setMessage("");
      try { await mutate({ action: "updateCampaignCopy", campaignId: campaign.id, expectedVersions: Object.fromEntries(deliverables.map((item) => [item.id, item.version])), ...fields }); setSaved(JSON.stringify(fields)); setMessage("Message saved · materials ready to review"); }
      catch (caught) { setMessage(caught instanceof Error ? caught.message : "Could not save. Try again."); }
      finally { setPending(false); }
    }}>Save message</button></div>{message && dirty && <p className="inline-error" role="alert">{message}</p>}
  </div></section>;
}

function CampaignWorkspace({ campaign, data, mutate, refresh, onSelect, goCreate, onDirtyChange }: {
  campaign: Campaign;
  data: StudioData;
  mutate: (value: Record<string, unknown>) => Promise<Record<string, unknown>>;
  refresh: () => Promise<void>;
  onSelect: (id: string) => void;
  goCreate: (recordId?: string) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const deliverables = data.deliverables.filter((item) => item.campaignId === campaign.id);
  const [activeId, setActiveId] = useState(deliverables[0]?.id);
  const [editing, setEditing] = useState(false);
  const [copyDirty, setCopyDirty] = useState(false);
  const [packageBusy, setPackageBusy] = useState(false);
  const [packageMessage, setPackageMessage] = useState("");
  const markCopyDirty = useCallback((dirty: boolean) => { setCopyDirty(dirty); onDirtyChange(dirty); }, [onDirtyChange]);
  const active = deliverables.find((item) => item.id === activeId) || deliverables[0];
  const record = data.records.find((item) => item.id === campaign.sourceSnapshot.contentRecordId);
  const asset = campaign.sourceSnapshot.asset
    ? { ...campaign.sourceSnapshot.asset, usageTags: [], active: true } as Asset
    : undefined;
  const exportedIds = new Set(data.exportEvents.filter((event) => event.campaignId === campaign.id).map((event) => event.deliverableId));
  const kindLabel = (deliverable: Deliverable) => outputLabel(deliverable.format);
  const approve = async (deliverable: Deliverable, status: Deliverable["approvalStatus"]) => {
    try { await mutate({ action: "setApproval", deliverableId: deliverable.id, expectedVersion: deliverable.version, status }); }
    catch (caught) { setPackageMessage(caught instanceof Error ? caught.message : "Could not save the review. Try again."); }
  };
  const copied = async (text: string) => { await navigator.clipboard.writeText(text); };
  const authorizeExport = async (deliverableId: string) => {
    try {
      await mutate({ action: "authorizeExport", calendarItemId: campaign.calendarItemId, deliverableId, expectedVersion: deliverables.find((item) => item.id === deliverableId)?.version });
      return true;
    } catch {
      return false;
    }
  };
  const recordExport = async (deliverableId: string) => {
    await mutate({ action: "markExported", calendarItemId: campaign.calendarItemId, deliverableId, expectedVersion: deliverables.find((item) => item.id === deliverableId)?.version });
  };
  const downloadPackage = async () => {
    setPackageBusy(true); setPackageMessage("Preparing your files…");
    try {
      const files = [];
      for (const output of deliverables) {
        if (!await authorizeExport(output.id)) throw new Error("A material has changed or still needs approval. Reload and review it.");
        setPackageMessage(`Preparing ${outputLabel(output.format).toLowerCase()}…`);
        files.push(await renderPromotionFile(output, campaign.sourceSnapshot, asset));
      }
      const zip = await createZip(files);
      for (const output of deliverables) if (!await authorizeExport(output.id)) throw new Error("The promotion changed during download preparation. Reload and try again.");
      const url = URL.createObjectURL(zip); const anchor = document.createElement("a"); anchor.href = url;
      anchor.download = `sun-oaks-${campaign.sourceSnapshot.facts.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.zip`; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setPackageMessage("Download started. Recording your download…");
      for (const output of deliverables) await recordExport(output.id);
      setPackageMessage("Download started · your materials are together in one ZIP file.");
    } catch (caught) { setPackageMessage(caught instanceof Error ? caught.message : "Could not prepare the download. Try again."); }
    finally { setPackageBusy(false); }
  };
  return (
    <>
      <PageHeading eyebrow="PROMOTION" title={campaign.sourceSnapshot.facts.name} description={`${deliverables.length} selected materials · created ${new Date(campaign.createdAt).toLocaleDateString()}`}
        action={<div className="campaign-heading-actions">{record && <button className="button secondary compact" onClick={() => setEditing(true)}><Pencil size={15} />Edit event details</button>}<div className={`rollup rollup-${campaign.rollupStatus}`}>{campaign.rollupStatus === "ready" ? "Ready to download" : campaign.rollupStatus === "in_review" ? "Ready for review" : campaign.rollupStatus.replaceAll("_", " ")}</div></div>} />
      {record && record.version !== campaign.sourceSnapshot.recordVersion && <div className="promotion-update-note"><div><strong>The class or event details have changed.</strong><p>These materials use the earlier confirmed details. Create an updated promotion to use the latest information and photo.</p></div><button className="button secondary compact" onClick={() => goCreate(record.id)}>Create updated promotion</button></div>}
      <div className="campaign-switcher"><label>Promotion<select value={campaign.id} onChange={(event) => onSelect(event.target.value)}>{data.campaigns.map((item) => <option key={item.id} value={item.id}>{item.sourceSnapshot.facts.name} · {new Date(item.createdAt).toLocaleDateString()}</option>)}</select></label><span className="verified-line"><ShieldCheck size={16} />Details confirmed</span></div>
      <CampaignMessageEditor campaign={campaign} deliverables={deliverables} mutate={mutate} onDirtyChange={markCopyDirty} />
      {copyDirty && <p className="promotion-save-notice">Save your message before reviewing or downloading the updated materials.</p>}
      <section className="promotion-package"><div><strong>Review your selected materials</strong><p>Check each preview below, then approve and download the set.</p>{packageMessage && <p role="status">{packageMessage}</p>}</div><div className="package-actions"><button className="button secondary compact" disabled={copyDirty || packageBusy || campaign.rollupStatus === "ready" || campaign.rollupStatus === "blocked"} onClick={async () => {
        setPackageBusy(true); setPackageMessage("");
        try { await mutate({ action: "approveCampaign", campaignId: campaign.id, expectedVersions: Object.fromEntries(deliverables.map((item) => [item.id, item.version])) }); setPackageMessage("Materials approved"); }
        catch (caught) { setPackageMessage(caught instanceof Error ? caught.message : "Could not approve. Try again."); }
        finally { setPackageBusy(false); }
      }}>Approve this set</button><button className="button primary compact" disabled={copyDirty || packageBusy || campaign.rollupStatus !== "ready"} onClick={downloadPackage}><Download size={16} />{packageBusy ? "Please wait…" : "Download all"}</button></div></section>
      <section className="workspace">
        <aside className="deliverable-list"><p className="eyebrow">YOUR MATERIALS</p>{deliverables.map((deliverable) => <button key={deliverable.id} className={deliverable.id === active.id ? "active" : ""} onClick={() => setActiveId(deliverable.id)} data-testid={`deliverable-${deliverable.id}`}>
          {deliverable.deliverableType === "still" ? <ImageIcon size={18} /> : deliverable.deliverableType === "motion" ? <Video size={18} /> : <FileText size={18} />}
          <span><strong>{kindLabel(deliverable)}</strong><small>{exportedIds.has(deliverable.id) ? "Exported" : deliverable.format.replaceAll("-", " ")}</small></span><i className={`approval-dot ${exportedIds.has(deliverable.id) ? "exported" : deliverable.approvalStatus}`} />
        </button>)}</aside>
        <div className="deliverable-stage">
          <header><div><p className="eyebrow">{active.format.replaceAll("-", " ")}</p><h2>{kindLabel(active)}</h2></div><StatusBadge status={record?.status || "campaign_generated"} /></header>
          {active.deliverableType === "still" && <StillCanvas deliverable={active} snapshot={campaign.sourceSnapshot} asset={asset} canExport={!copyDirty && active.approvalStatus === "approved" && !active.validationResults.some((result) => result.severity === "error")} authorizeExport={() => authorizeExport(active.id)} onExported={() => recordExport(active.id)} />}
          {active.deliverableType === "motion" && <MotionCanvas deliverable={active} snapshot={campaign.sourceSnapshot} asset={asset} canExport={!copyDirty && active.approvalStatus === "approved" && !active.validationResults.some((result) => result.severity === "error")} authorizeExport={() => authorizeExport(active.id)} onExported={() => recordExport(active.id)} />}
          {active.deliverableType === "caption" && <div className="copy-deliverable"><div className="copy-meta"><span>Instagram caption</span><span>{active.creativeFields.caption.length} characters</span></div><pre>{active.creativeFields.caption}</pre><button className="button dark" disabled={copyDirty || active.approvalStatus !== "approved"} title={active.approvalStatus === "approved" ? "Copy approved caption" : "Approve this deliverable before export"} onClick={async () => { if (!await authorizeExport(active.id)) return; try { await copied(active.creativeFields.caption); await recordExport(active.id); } catch {} }}><Clipboard size={17} />Copy caption</button></div>}
          {active.deliverableType === "emailCopy" && <div className="email-deliverable"><dl><div><dt>Subject</dt><dd>{active.creativeFields.subject}</dd></div><div><dt>Preview text</dt><dd>{active.creativeFields.preview}</dd></div></dl><div className="email-body"><span>Body</span>{active.creativeFields.body.split("\n").map((line, index) => <p key={index}>{line || "\u00a0"}</p>)}</div><div className="email-actions"><button className="button secondary" disabled={copyDirty || active.approvalStatus !== "approved"} onClick={async () => { if (!await authorizeExport(active.id)) return; try { await copied(`${active.creativeFields.subject}\n${active.creativeFields.preview}\n\n${active.creativeFields.body}`); await recordExport(active.id); } catch {} }}><Clipboard size={17} />Copy all</button><button className="button dark" disabled={copyDirty || active.approvalStatus !== "approved"} onClick={async () => {
            if (!await authorizeExport(active.id)) return;
            const blob = new Blob([`Subject: ${active.creativeFields.subject}\nPreview: ${active.creativeFields.preview}\n\n${active.creativeFields.body}`], { type: "text/plain" });
            const anchor = document.createElement("a"); anchor.href = URL.createObjectURL(blob); anchor.download = "sun-oaks-email-copy.txt"; anchor.click(); URL.revokeObjectURL(anchor.href);
            await recordExport(active.id);
          }}><Download size={17} />Download .txt</button></div></div>}
        </div>
        <aside className="inspector">
          <section><p className="eyebrow">APPROVAL</p><div className="approval-state"><span className={`approval-icon ${active.approvalStatus}`}><Check size={18} /></span><div><strong>{active.approvalStatus === "approved" ? "Approved" : active.approvalStatus === "changes_requested" ? "Changes requested" : "Awaiting review"}</strong><p>Approve after checking the preview.</p></div></div>
            <button className="button primary full" disabled={copyDirty || active.approvalStatus === "approved" || active.validationResults.some((result) => result.severity === "error") } onClick={() => approve(active, "approved")} data-testid={`button-approve-${active.id}`}><Check size={17} />Approve material</button>
            <button className="button text full" onClick={() => approve(active, active.approvalStatus === "changes_requested" ? "draft" : "changes_requested")}>{active.approvalStatus === "changes_requested" ? "Return to review" : "Request changes"}</button>
          </section>
          <section><p className="eyebrow">VALIDATION</p>{active.validationResults.map((result) => <div className="validation" key={result.code}><CheckCircle2 size={17} /><span><strong>{result.code.replaceAll("-", " ")}</strong>{result.message}</span></div>)}</section>
          <section><details><summary>Confirmed details</summary><dl className="source-facts">{Object.entries(campaign.sourceSnapshot.facts).filter(([, value]) => value).map(([key, value]) => <div key={key}><dt>{key.replace(/([A-Z])/g, " $1")}</dt><dd>{value}</dd></div>)}
            {campaign.sourceSnapshot.target.type === "scheduleRule" && <div><dt>Target</dt><dd>{campaign.sourceSnapshot.target.daysOfWeek.map((day) => DAY_NAMES[day]).join(" & ")} · {campaign.sourceSnapshot.target.startTime} · {campaign.sourceSnapshot.target.timezone}</dd></div>}
            {campaign.sourceSnapshot.target.type === "occurrence" && <div><dt>Target</dt><dd>{new Date(campaign.sourceSnapshot.target.startsAt).toLocaleString()}</dd></div>}
          </dl></details></section>
          <section><p className="eyebrow">PHOTO</p><div className="snapshot-asset"><ImageIcon size={17} /><span><strong>{campaign.sourceSnapshot.asset?.title || "No-photo brand fallback"}</strong><small>Locked when this campaign was generated</small></span></div></section>
          {!copyDirty && <ReviewShare campaign={campaign} deliverables={deliverables} data={data} mutate={mutate} />}
        </aside>
      </section>
      {editing && record && <RecordEditDrawer record={record} onClose={() => setEditing(false)} mutate={mutate} refresh={refresh} />}
    </>
  );
}

function ReviewShare({ campaign, deliverables, data, mutate }: {
  campaign: Campaign; deliverables: Deliverable[]; data: StudioData;
  mutate: (value: Record<string, unknown>) => Promise<Record<string, unknown>>;
}) {
  const artwork = deliverables;
  const [selected, setSelected] = useState(() => artwork.map((item) => item.id));
  const [expiresInHours, setExpiresInHours] = useState(72);
  const [latestUrl, setLatestUrl] = useState("");
  const links = data.reviewLinks.filter((link) => link.campaignId === campaign.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const copy = async (url: string) => {
    await navigator.clipboard.writeText(url);
  };
  const create = async () => {
    const result = await mutate({ action: "createReviewLink", campaignId: campaign.id, selectedDeliverableIds: selected, expiresInHours });
    const url = String(result.reviewUrl || "");
    setLatestUrl(url);
    if (url) await copy(url);
  };
  return <section className="review-share">
    <p className="eyebrow">GM REVIEW LINK</p>
    <p className="review-share-copy">Choose the materials your manager should review.</p>
    <fieldset><legend>Materials</legend>{artwork.map((item) => <label key={item.id}><input type="checkbox" checked={selected.includes(item.id)} onChange={() => setSelected((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} />{outputLabel(item.format)}</label>)}</fieldset>
    <label className="review-expiry">Expires<select value={expiresInHours} onChange={(event) => setExpiresInHours(Number(event.target.value))}><option value={24}>24 hours</option><option value={72}>3 days</option><option value={168}>7 days</option><option value={720}>30 days</option></select></label>
    <button className="button primary full" disabled={!selected.length} onClick={create} data-testid="button-create-review"><Link2 size={16} />Create & copy link</button>
    {latestUrl && <div className="review-url"><input readOnly value={latestUrl} aria-label="Latest review URL" /><button className="icon-button" onClick={() => copy(latestUrl)} aria-label="Copy review URL"><Clipboard size={15} /></button></div>}
    {links.length > 0 && <div className="review-link-list">{links.map((link) => <article key={link.id}>
      <div><strong>{link.approvalState.replaceAll("_", " ")}</strong><small>{link.revokedAt ? "Revoked" : new Date(link.expiresAt) <= new Date() ? "Expired" : `Expires ${new Date(link.expiresAt).toLocaleDateString()}`}</small></div>
      <button className="icon-button" title="Regenerate review link" aria-label="Regenerate review link" onClick={async () => { const result = await mutate({ action: "regenerateReviewLink", reviewLinkId: link.id }); const url = String(result.reviewUrl || ""); setLatestUrl(url); if (url) await copy(url); }}><RefreshCw size={15} /></button>
      <button className="icon-button" title="Revoke review link" aria-label="Revoke review link" disabled={Boolean(link.revokedAt)} onClick={() => mutate({ action: "revokeReviewLink", reviewLinkId: link.id })}><Ban size={15} /></button>
    </article>)}</div>}
  </section>;
}
