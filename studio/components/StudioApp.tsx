"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  Archive, ArrowLeft, ArrowRight, CalendarDays, Check, CheckCircle2, ChevronRight, Clipboard,
  Download, FileCheck2, FileText, Grid3X3, Image as ImageIcon, ScanLine, Library, List, LogOut,
  Menu, Moon, Plus, Search, ShieldCheck, Sparkles, Sun, Video, X, WandSparkles, Clapperboard, Link2, RefreshCw, Ban,
  PanelLeftClose, PanelLeftOpen, Pencil, Upload,
} from "lucide-react";
import { MotionCanvas, StillCanvas } from "./CreativeCanvas";
import type { Asset, CalendarItem, Campaign, Candidate, ContentRecord, Deliverable, StudioData } from "@/lib/client-types";
import { isDateInMonth } from "@/lib/calendar";
import PromoKit from "./PromoKit";
import MotionStudio from "./MotionStudio";

const API = "/studio/api";
type View = "create" | "calendar" | "promo" | "motion" | "ingester" | "library" | "campaigns";
const STATUS: Record<string, { label: string; tone: string }> = {
  needs_information: { label: "Needs information", tone: "neutral" },
  verified: { label: "Verified", tone: "teal" },
  campaign_generated: { label: "Campaign generated", tone: "yellow" },
  done: { label: "Exported or done", tone: "dark" },
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

async function uploadAsset(file: File) {
  const bitmap = await createImageBitmap(file);
  const form = new FormData();
  form.set("file", file);
  form.set("width", String(bitmap.width));
  form.set("height", String(bitmap.height));
  form.set("title", file.name.replace(/\.[^.]+$/, ""));
  form.set("altText", `Sun Oaks campaign image: ${file.name.replace(/\.[^.]+$/, "")}`);
  bitmap.close();
  const response = await fetch(`${API}/assets/upload`, { method: "POST", body: form });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "The image could not be uploaded.");
  return body.asset as Asset;
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
  const [view, setView] = useState<View>("create");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [mobileNav, setMobileNav] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [editorRecordId, setEditorRecordId] = useState("");
  const [editorOrigin, setEditorOrigin] = useState<"create" | "campaigns" | "library">("create");
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
    { id: "create" as const, label: "Create", icon: Plus },
    { id: "campaigns" as const, label: "Campaigns", icon: Sparkles },
    { id: "library" as const, label: "Trusted Library", icon: Library },
    { id: "calendar" as const, label: "Calendar", icon: CalendarDays },
  ];
  const go = (next: View) => { setView(next); setMobileNav(false); };
  const openEditor = (next: "promo" | "motion", recordId: string, origin: typeof editorOrigin) => {
    setEditorRecordId(recordId);
    setEditorOrigin(origin);
    go(next);
  };
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
          <div className="topbar-context"><span className="sync-dot" />Durable pilot storage · synced now</div>
          <button className="icon-button" onClick={() => setTheme(theme === "light" ? "dark" : "light")} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`} data-testid="button-theme">
            {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
          </button>
        </header>
        {error && <div className="global-error" role="alert">{error}<button onClick={() => setError("")} aria-label="Dismiss error"><X size={16} /></button></div>}
        <main id="main-content" className="content">
          {view === "create" && <CreateView data={data} mutate={mutate} refresh={load} openEditor={(next, id) => openEditor(next, id, "create")} openImport={() => { setEditorOrigin("create"); go("ingester"); }} goCampaigns={() => go("campaigns")} />}
          {view === "calendar" && <CalendarView data={data} mutate={mutate} goCampaigns={() => go("campaigns")} goCreate={() => go("create")} />}
          {view === "promo" && <PromoKit key={`promo-${editorRecordId}`} data={data} mutate={mutate} initialRecordId={editorRecordId} onBack={() => go(editorOrigin)} />}
          {view === "motion" && <MotionStudio key={`motion-${editorRecordId}`} data={data} mutate={mutate} initialRecordId={editorRecordId} onBack={() => go(editorOrigin)} />}
          {view === "ingester" && <IngesterView data={data} mutate={mutate} onPublished={() => go("create")} />}
          {view === "library" && <LibraryView data={data} mutate={mutate} refresh={load} openEditor={(next, id) => openEditor(next, id, "library")} />}
          {view === "campaigns" && <CampaignsView data={data} mutate={mutate} refresh={load} openEditor={(next, id) => openEditor(next, id, "campaigns")} goCreate={() => go("create")} />}
        </main>
        {loading && <div className="saving-indicator" role="status">Saving to Studio…</div>}
      </div>
      <div className="small-screen-gate">
        <BrandMark />
        <h1>Review on this screen. Create on desktop.</h1>
        <p>The Studio’s creation canvas is designed for a window at least 900px wide. Campaign downloads remain available on a larger tablet or computer.</p>
      </div>
    </div>
  );
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <header className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>{action}</header>;
}

function CreateView({ data, mutate, refresh, openEditor, openImport, goCampaigns }: {
  data: StudioData;
  mutate: (value: Record<string, unknown>) => Promise<Record<string, unknown>>;
  refresh: () => Promise<void>;
  openEditor: (view: "promo" | "motion", recordId: string) => void;
  openImport: () => void;
  goCampaigns: () => void;
}) {
  const records = data.records.filter((record) => record.active && record.verificationStatus === "verified");
  const [recordId, setRecordId] = useState(records[0]?.id || "");
  const [uploading, setUploading] = useState(false);
  const record = records.find((item) => item.id === recordId) || records[0];
  const asset = data.assets.find((item) => item.id === record?.assetId);
  const pendingItem = data.calendarItems.find((item) => item.contentRecordId === record?.id && !item.campaignId);
  const currentCampaign = data.campaigns.find((campaign) => campaign.sourceSnapshot.contentRecordId === record?.id);
  const attachImage = async (file: File) => {
    if (!record) return;
    setUploading(true);
    try {
      const uploaded = await uploadAsset(file);
      await mutate({ action: "setRecordAsset", recordId: record.id, assetId: uploaded.id });
      await refresh();
    } finally {
      setUploading(false);
    }
  };
  const startCampaign = async () => {
    if (currentCampaign) return goCampaigns();
    if (!pendingItem || !record) return;
    await mutate({
      action: "generateCampaign",
      calendarItemId: pendingItem.id,
      packId: record.recordType === "event" ? "event-promo" : "class-spotlight",
    });
    goCampaigns();
  };
  if (!record) return <section className="empty-state"><Sparkles size={40} /><h2>Add your first campaign source</h2><p>Import an announcement, verify the facts, then create social and motion output.</p><button className="button primary" onClick={openImport}>Add information</button></section>;
  return <>
    <PageHeading eyebrow="CREATE" title="Make something useful now" description="Choose a trusted record, add its campaign image, then open a ready-made social card or motion story."
      action={<button className="button secondary" onClick={openImport}><ScanLine size={17} />Import new information</button>} />
    <section className="create-source">
      <div>
        <label>Campaign source<select value={record.id} onChange={(event) => setRecordId(event.target.value)} data-testid="select-create-record">{records.map((item) => <option key={item.id} value={item.id}>{item.name} · v{item.version}</option>)}</select></label>
        <span className="verified-line"><ShieldCheck size={16} />Verified source record</span>
      </div>
      <div className="create-source-image">
        <span className="asset-thumb">{asset ? <ImageIcon size={18} /> : <span>SO</span>}</span>
        <span><strong>{asset?.title || "Add a campaign image"}</strong><small>{asset ? "Approved for campaign use" : "JPEG, PNG, or WebP · up to 10 MB"}</small></span>
        <label className="button secondary compact"><Upload size={15} />{uploading ? "Uploading…" : asset ? "Replace image" : "Add image"}<input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void attachImage(file); event.target.value = ""; }} /></label>
      </div>
    </section>
    <section className="social-starters">
      <header><div><p className="eyebrow">SOCIAL SHARE CARDS</p><h2>Two useful starting points</h2></div><p>Both open as editable Promo Kit artboards and download as production-size PNGs.</p></header>
      <div className="social-card-grid">
        <article className="social-starter square">
          <div className="social-card-preview" style={asset ? { backgroundImage: `linear-gradient(180deg, transparent 24%, rgba(13,13,12,.9) 84%), url("${asset.fileReference}")` } : undefined}>
            <span>{record.recordType === "event" ? "SUN OAKS EVENT" : "CLASS SPOTLIGHT"}</span><strong>{record.name}</strong><small>{record.date || record.startTime} · {record.location}</small>
          </div>
          <div><span><strong>Square announcement</strong><small>Instagram and Facebook · 1080 × 1080</small></span><button className="button primary compact" onClick={() => openEditor("promo", record.id)} data-testid="button-social-square">Edit card<ArrowRight size={15} /></button></div>
        </article>
        <article className="social-starter portrait">
          <div className="social-card-preview portrait-preview" style={asset ? { backgroundImage: `linear-gradient(180deg, rgba(13,13,12,.04), rgba(13,13,12,.92)), url("${asset.fileReference}")` } : undefined}>
            <span>THIS WEEK AT SUN OAKS</span><strong>{record.name}</strong><small>{record.summary}</small>
          </div>
          <div><span><strong>Portrait spotlight</strong><small>Feed-first storytelling · 1080 × 1350</small></span><button className="button primary compact" onClick={() => openEditor("promo", record.id)} data-testid="button-social-portrait">Edit card<ArrowRight size={15} /></button></div>
        </article>
      </div>
    </section>
    <section className="create-next-actions">
      <button className="create-action-card" onClick={() => openEditor("motion", record.id)}><Clapperboard size={22} /><span><strong>Build a motion story</strong><small>Start with a ready-made three-scene sequence.</small></span><ChevronRight size={18} /></button>
      <button className="create-action-card" disabled={!pendingItem && !currentCampaign} onClick={startCampaign}><Sparkles size={22} /><span><strong>{currentCampaign ? "Open coordinated campaign" : "Generate full campaign"}</strong><small>Stills, motion, caption, email, and review.</small></span><ChevronRight size={18} /></button>
    </section>
  </>;
}

function CalendarView({ data, mutate, goCampaigns, goCreate }: { data: StudioData; mutate: (value: Record<string, unknown>) => Promise<Record<string, unknown>>; goCampaigns: () => void; goCreate: () => void }) {
  const [mode, setMode] = useState<"month" | "agenda">("month");
  const [selected, setSelected] = useState<CalendarItem | null>(null);
  const recordFor = (item: CalendarItem) => data.records.find((record) => record.id === item.contentRecordId)!;
  const calendarDays = Array.from({ length: 35 }, (_, index) => {
    const day = index - 1;
    return day > 0 && day <= 30 ? day : null;
  });
  return (
    <>
      <PageHeading eyebrow="OPERATING CENTER" title="September 2026" description="Plan what Sun Oaks promotes, then generate from verified facts."
        action={<button className="button primary" onClick={goCreate}><Plus size={17} />Create campaign</button>} />
      <section className="calendar-toolbar" aria-label="Calendar controls">
        <div className="segmented">
          <button className={mode === "month" ? "active" : ""} onClick={() => setMode("month")} data-testid="button-month"><Grid3X3 size={16} />Month</button>
          <button className={mode === "agenda" ? "active" : ""} onClick={() => setMode("agenda")} data-testid="button-agenda"><List size={16} />Agenda</button>
        </div>
        <div className="legend"><span><i className="dot operational" />Club occurrence</span><span><i className="dot marketing" />Marketing action</span></div>
      </section>
      {mode === "month" ? (
        <section className="month-grid" aria-label="September 2026 marketing calendar">
          {WEEKDAYS.map((day) => <div key={day} className="weekday">{day}</div>)}
          {calendarDays.map((day, index) => (
            <div key={index} className={`calendar-day ${day === 2 ? "today" : ""} ${day === null ? "outside" : ""}`}>
              {day && <span className="day-number">{day}</span>}
              {day && data.calendarItems.filter((item) => isDateInMonth(item.marketingDate, 2026, 9) && Number(item.marketingDate.slice(-2)) === day).map((item) => {
                const record = recordFor(item);
                return <button key={item.id} className={`calendar-card state-${item.status}`} onClick={() => item.campaignId ? goCampaigns() : setSelected(item)} data-testid={`calendar-item-${item.id}`}>
                  <span className="card-kind">MARKETING · {item.targetType === "scheduleRule" ? "SERIES" : "RECORD"}</span>
                  <strong>{record.name}</strong>
                  <span>{item.objective === "launch" ? "Event Promo" : "Class Spotlight"}</span>
                </button>;
              })}
              {day === 8 && <div className="occurrence-card"><span>6:00 AM</span><strong>Sunrise Strength</strong></div>}
            </div>
          ))}
        </section>
      ) : (
        <section className="agenda-list">
          {data.calendarItems.sort((a, b) => a.marketingDate.localeCompare(b.marketingDate)).map((item) => {
            const record = recordFor(item);
            return <article key={item.id} className="agenda-row"><time>{new Date(`${item.marketingDate}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</time>
              <div><span className="card-kind">MARKETING ACTION · {item.targetType.replace(/([A-Z])/g, " $1")}</span><h2>{record.name}</h2><p>{record.summary}</p></div>
              <StatusBadge status={item.status} /><button className="button secondary compact" onClick={() => item.campaignId ? goCampaigns() : setSelected(item)}>Open<ChevronRight size={16} /></button></article>;
          })}
        </section>
      )}
      {selected && <QuickCreate item={selected} record={recordFor(selected)} onClose={() => setSelected(null)} mutate={mutate} onGenerated={() => { setSelected(null); goCampaigns(); }} />}
    </>
  );
}

function QuickCreate({ item, record, onClose, mutate, onGenerated }: {
  item: CalendarItem; record: ContentRecord; onClose: () => void;
  mutate: (value: Record<string, unknown>) => Promise<Record<string, unknown>>; onGenerated: () => void;
}) {
  const pack = record.recordType === "event" ? "event-promo" : "class-spotlight";
  const packName = pack === "event-promo" ? "Event Promo" : "Class Spotlight";
  const [confirmed, setConfirmed] = useState(false);
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
        <header><div><p className="eyebrow">QUICK CREATE · 3 CLICKS</p><h2 id="quick-title">{record.name}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close Quick Create"><X /></button></header>
        <ol className="step-list">
          <li className="complete"><span>1</span><div><strong>Subject selected</strong><p>{item.targetType === "scheduleRule" ? "Recurring schedule rule" : "Trusted content record"} · version {record.version}</p></div><Check size={18} /></li>
          <li className={confirmed ? "complete" : "active"}><span>2</span><div><strong>Choose campaign pack</strong><p>Recommended deterministically for {record.recordType === "event" ? "events" : "recurring classes"}.</p></div></li>
        </ol>
        <button className={`pack-choice ${confirmed ? "selected" : ""}`} onClick={() => setConfirmed(true)} data-testid="button-select-pack">
          <span className="pack-art"><Sparkles size={26} /></span><span><small>RECOMMENDED</small><strong>{packName}</strong><span>3 stills · motion · caption · email</span></span><span className="radio">{confirmed && <Check size={15} />}</span>
        </button>
        <div className="fact-check">
          <span><ShieldCheck size={18} />Protected facts</span>
          <dl><div><dt>Schedule</dt><dd>{record.date || record.startTime || "Recurring schedule"}</dd></div><div><dt>Location</dt><dd>{record.location || "Needs confirmation"}</dd></div><div><dt>Source</dt><dd>Verified record v{record.version}</dd></div></dl>
        </div>
        <button className="button primary full generate" disabled={!confirmed} onClick={async () => { await mutate({ action: "generateCampaign", calendarItemId: item.id, packId: pack }); onGenerated(); }} data-testid="button-generate-campaign">
          <Sparkles size={18} />Generate campaign<span>Click 3</span>
        </button>
        <p className="drawer-footnote">Campaign outputs keep this source snapshot even if the trusted record changes later.</p>
      </aside>
    </div>
  );
}

function IngesterView({ data, mutate, onPublished }: { data: StudioData; mutate: (value: Record<string, unknown>) => Promise<Record<string, unknown>>; onPublished: () => void }) {
  const [mode, setMode] = useState<"plain_text" | "guided">("plain_text");
  const [rawText, setRawText] = useState("");
  const [guidedType, setGuidedType] = useState<"event" | "recurring_class">("event");
  const [guided, setGuided] = useState({ name: "", date: "", days: "", startTime: "", endTime: "", location: "", instructor: "", price: "" });
  const [preview, setPreview] = useState<{ source: { id: string }; candidate: Candidate; duplicate: { kind: string; record?: ContentRecord } | null } | null>(null);
  const [marketingDate, setMarketingDate] = useState("2026-09-15");
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
      <PageHeading eyebrow="INGESTER" title={preview ? "Review extracted facts" : "Add trusted information"} description={preview ? "Human verification is required before anything reaches the library." : "Paste an announcement or use a guided route. Nothing publishes automatically."} />
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
            <button className="button primary" disabled={sourceText.trim().length < 2} onClick={parse} data-testid="button-extract">Extract for review<ArrowRight size={17} /></button>
          </div>
          <aside className="process-note"><p className="eyebrow">CONTROLLED PIPELINE</p><ol><li><span>01</span>Source saved with fingerprint</li><li><span>02</span>Facts extracted locally</li><li><span>03</span>You verify every field</li><li><span>04</span>Record and calendar target publish</li></ol><p><ShieldCheck size={17} />Dates, prices, names, and locations are never invented.</p></aside>
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
                await mutate({
                  action: "publishCandidate", sourceId: preview.source.id,
                  candidate: { ...preview.candidate, cta: extra.cta || (preview.candidate.recordType === "event" ? "RSVP at the front desk" : "Reserve in the Sun Oaks app"), assetId: extra.assetId || null },
                  duplicateDecision, duplicateRecordId: preview.duplicate?.record?.id, marketingDate,
                });
                try { window.localStorage.removeItem("sunoaks-ingester-draft"); } catch {}
                onPublished();
              }} data-testid="button-verify-publish"><Check size={17} />Verify & publish</button>
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
      <PageHeading eyebrow="SOURCE OF TRUTH" title="Trusted Content Library" description="Verified operational records with source lineage and version history." />
      <div className="library-toolbar"><label className="search-field"><Search size={17} /><span className="sr-only">Search records</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search trusted records" data-testid="input-library-search" /></label><span>{records.length} active records</span></div>
      <section className="table-wrap"><table><thead><tr><th>Record</th><th>Type</th><th>Schedule</th><th>Source trust</th><th>State</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{records.map((record) => <tr key={record.id}>
        <td><div className="record-cell"><span className="asset-thumb">{record.assetId ? <ImageIcon size={18} /> : <span>SO</span>}</span><span><strong>{record.name}</strong><small>{record.summary}</small></span></div></td>
        <td>{record.recordType === "event" ? "Event" : "Recurring class"}</td>
        <td>{record.date || `${record.startTime || "Time pending"} · ${record.location || "Location pending"}`}</td>
        <td><span className="verified-line"><ShieldCheck size={16} />Verified · v{record.version}</span><small>{new Date(record.lastConfirmedAt).toLocaleDateString()}</small></td>
        <td><StatusBadge status={record.status} /></td>
        <td><div className="row-actions"><button className="button secondary compact" onClick={() => setEditing(record)} data-testid={`button-edit-record-${record.id}`}><Pencil size={14} />Edit</button><button className="button primary compact" onClick={() => openEditor("promo", record.id)}><WandSparkles size={14} />Create</button></div></td>
      </tr>)}</tbody></table></section>
      {editing && <RecordEditDrawer record={editing} onClose={() => setEditing(null)} mutate={mutate} refresh={refresh} />}
    </>
  );
}

function CampaignsView({ data, mutate, refresh, openEditor, goCreate }: {
  data: StudioData;
  mutate: (value: Record<string, unknown>) => Promise<Record<string, unknown>>;
  refresh: () => Promise<void>;
  openEditor: (view: "promo" | "motion", recordId: string) => void;
  goCreate: () => void;
}) {
  const [selectedId, setSelectedId] = useState(data.campaigns.at(-1)?.id || "");
  const campaign = data.campaigns.find((item) => item.id === selectedId) || data.campaigns.at(-1);
  if (!campaign) return (
    <>
      <PageHeading eyebrow="CAMPAIGNS" title="Coordinated output sets" description="Every still, motion, caption, and email shares one protected source snapshot." />
      <section className="empty-state"><Sparkles size={40} /><h2>No campaigns yet</h2><p>Choose a trusted record and make your first useful output.</p><button className="button primary" onClick={goCreate}>Create campaign</button></section>
    </>
  );
  return <CampaignWorkspace key={campaign.id} campaign={campaign} data={data} mutate={mutate} refresh={refresh} openEditor={openEditor} onSelect={setSelectedId} />;
}

function CampaignWorkspace({ campaign, data, mutate, refresh, openEditor, onSelect }: {
  campaign: Campaign;
  data: StudioData;
  mutate: (value: Record<string, unknown>) => Promise<Record<string, unknown>>;
  refresh: () => Promise<void>;
  openEditor: (view: "promo" | "motion", recordId: string) => void;
  onSelect: (id: string) => void;
}) {
  const deliverables = data.deliverables.filter((item) => item.campaignId === campaign.id);
  const [activeId, setActiveId] = useState(deliverables[0]?.id);
  const [editing, setEditing] = useState(false);
  const active = deliverables.find((item) => item.id === activeId) || deliverables[0];
  const record = data.records.find((item) => item.id === campaign.sourceSnapshot.contentRecordId);
  const asset = campaign.sourceSnapshot.asset
    ? { ...campaign.sourceSnapshot.asset, usageTags: [], active: true } as Asset
    : undefined;
  const exportedIds = new Set(data.exportEvents.filter((event) => event.campaignId === campaign.id).map((event) => event.deliverableId));
  const kindLabel = (deliverable: Deliverable) => deliverable.deliverableType === "emailCopy" ? "Email copy" : deliverable.deliverableType[0].toUpperCase() + deliverable.deliverableType.slice(1);
  const approve = (deliverable: Deliverable, status: Deliverable["approvalStatus"]) => mutate({ action: "setApproval", deliverableId: deliverable.id, status });
  const copied = async (text: string) => { await navigator.clipboard.writeText(text); };
  const authorizeExport = async (deliverableId: string) => {
    try {
      await mutate({ action: "authorizeExport", calendarItemId: campaign.calendarItemId, deliverableId });
      return true;
    } catch {
      return false;
    }
  };
  const recordExport = async (deliverableId: string) => {
    await mutate({ action: "markExported", calendarItemId: campaign.calendarItemId, deliverableId });
  };
  return (
    <>
      <PageHeading eyebrow="CAMPAIGN WORKSPACE" title={campaign.sourceSnapshot.facts.name} description={`${campaign.campaignPackId === "event-promo" ? "Event Promo" : "Class Spotlight"} · created ${new Date(campaign.createdAt).toLocaleDateString()}`}
        action={<div className="campaign-heading-actions">{record && <><button className="button secondary compact" onClick={() => setEditing(true)}><Pencil size={15} />Edit info / image</button><button className="button secondary compact" onClick={() => openEditor("promo", record.id)}><WandSparkles size={15} />Social cards</button><button className="button secondary compact" onClick={() => openEditor("motion", record.id)}><Clapperboard size={15} />Motion Studio</button></>}<div className={`rollup rollup-${campaign.rollupStatus}`}><span />{campaign.rollupStatus === "ready" ? "Ready to export" : campaign.rollupStatus.replaceAll("_", " ")}</div></div>} />
      <div className="campaign-switcher"><label>Campaign<select value={campaign.id} onChange={(event) => onSelect(event.target.value)}>{data.campaigns.map((item) => <option key={item.id} value={item.id}>{item.sourceSnapshot.facts.name} · {new Date(item.createdAt).toLocaleDateString()}</option>)}</select></label>
        <div className="snapshot-lock"><ShieldCheck size={17} /><span>Source snapshot locked<strong>Record v{campaign.sourceSnapshot.recordVersion}</strong></span></div></div>
      <section className="workspace">
        <aside className="deliverable-list"><p className="eyebrow">DELIVERABLES</p>{deliverables.map((deliverable) => <button key={deliverable.id} className={deliverable.id === active.id ? "active" : ""} onClick={() => setActiveId(deliverable.id)} data-testid={`deliverable-${deliverable.id}`}>
          {deliverable.deliverableType === "still" ? <ImageIcon size={18} /> : deliverable.deliverableType === "motion" ? <Video size={18} /> : <FileText size={18} />}
          <span><strong>{kindLabel(deliverable)}</strong><small>{exportedIds.has(deliverable.id) ? "Exported" : deliverable.format.replaceAll("-", " ")}</small></span><i className={`approval-dot ${exportedIds.has(deliverable.id) ? "exported" : deliverable.approvalStatus}`} />
        </button>)}</aside>
        <div className="deliverable-stage">
          <header><div><p className="eyebrow">{active.format.replaceAll("-", " ")}</p><h2>{kindLabel(active)}</h2></div><StatusBadge status={record?.status || "campaign_generated"} /></header>
          {active.deliverableType === "still" && <StillCanvas deliverable={active} snapshot={campaign.sourceSnapshot} asset={asset} canExport={active.approvalStatus === "approved" && !active.validationResults.some((result) => result.severity === "error")} authorizeExport={() => authorizeExport(active.id)} onExported={() => recordExport(active.id)} />}
          {active.deliverableType === "motion" && <MotionCanvas deliverable={active} snapshot={campaign.sourceSnapshot} asset={asset} canExport={active.approvalStatus === "approved" && !active.validationResults.some((result) => result.severity === "error")} authorizeExport={() => authorizeExport(active.id)} onExported={() => recordExport(active.id)} />}
          {active.deliverableType === "caption" && <div className="copy-deliverable"><div className="copy-meta"><span>Instagram caption</span><span>{active.creativeFields.caption.length} characters</span></div><pre>{active.creativeFields.caption}</pre><button className="button dark" disabled={active.approvalStatus !== "approved"} title={active.approvalStatus === "approved" ? "Copy approved caption" : "Approve this deliverable before export"} onClick={async () => { if (!await authorizeExport(active.id)) return; try { await copied(active.creativeFields.caption); await recordExport(active.id); } catch {} }}><Clipboard size={17} />Copy caption</button></div>}
          {active.deliverableType === "emailCopy" && <div className="email-deliverable"><dl><div><dt>Subject</dt><dd>{active.creativeFields.subject}</dd></div><div><dt>Preview text</dt><dd>{active.creativeFields.preview}</dd></div></dl><div className="email-body"><span>Body</span>{active.creativeFields.body.split("\n").map((line, index) => <p key={index}>{line || "\u00a0"}</p>)}</div><div className="email-actions"><button className="button secondary" disabled={active.approvalStatus !== "approved"} onClick={async () => { if (!await authorizeExport(active.id)) return; try { await copied(`${active.creativeFields.subject}\n${active.creativeFields.preview}\n\n${active.creativeFields.body}`); await recordExport(active.id); } catch {} }}><Clipboard size={17} />Copy all</button><button className="button dark" disabled={active.approvalStatus !== "approved"} onClick={async () => {
            if (!await authorizeExport(active.id)) return;
            const blob = new Blob([`Subject: ${active.creativeFields.subject}\nPreview: ${active.creativeFields.preview}\n\n${active.creativeFields.body}`], { type: "text/plain" });
            const anchor = document.createElement("a"); anchor.href = URL.createObjectURL(blob); anchor.download = "sun-oaks-email-copy.txt"; anchor.click(); URL.revokeObjectURL(anchor.href);
            await recordExport(active.id);
          }}><Download size={17} />Download .txt</button></div></div>}
        </div>
        <aside className="inspector">
          <section><p className="eyebrow">APPROVAL</p><div className="approval-state"><span className={`approval-icon ${active.approvalStatus}`}><Check size={18} /></span><div><strong>{active.approvalStatus === "approved" ? "Approved" : active.approvalStatus === "changes_requested" ? "Changes requested" : "Awaiting review"}</strong><p>Approval applies only to this deliverable.</p></div></div>
            <button className="button primary full" disabled={active.approvalStatus === "approved"} onClick={() => approve(active, "approved")} data-testid={`button-approve-${active.id}`}><Check size={17} />Approve deliverable</button>
            <button className="button text full" onClick={() => approve(active, active.approvalStatus === "changes_requested" ? "draft" : "changes_requested")}>{active.approvalStatus === "changes_requested" ? "Return to review" : "Request changes"}</button>
          </section>
          <section><p className="eyebrow">VALIDATION</p>{active.validationResults.map((result) => <div className="validation" key={result.code}><CheckCircle2 size={17} /><span><strong>{result.code.replaceAll("-", " ")}</strong>{result.message}</span></div>)}</section>
          <section><p className="eyebrow">SOURCE FACTS</p><dl className="source-facts">{Object.entries(campaign.sourceSnapshot.facts).filter(([, value]) => value).map(([key, value]) => <div key={key}><dt>{key.replace(/([A-Z])/g, " $1")}</dt><dd>{value}</dd></div>)}
            {campaign.sourceSnapshot.target.type === "scheduleRule" && <div><dt>Target</dt><dd>{campaign.sourceSnapshot.target.daysOfWeek.map((day) => DAY_NAMES[day]).join(" & ")} · {campaign.sourceSnapshot.target.startTime} · {campaign.sourceSnapshot.target.timezone}</dd></div>}
            {campaign.sourceSnapshot.target.type === "occurrence" && <div><dt>Target</dt><dd>{new Date(campaign.sourceSnapshot.target.startsAt).toLocaleString()}</dd></div>}
          </dl></section>
          <section><p className="eyebrow">CAMPAIGN IMAGE SNAPSHOT</p><div className="snapshot-asset"><ImageIcon size={17} /><span><strong>{campaign.sourceSnapshot.asset?.title || "No-photo brand fallback"}</strong><small>Locked when this campaign was generated</small></span></div></section>
          <ReviewShare campaign={campaign} deliverables={deliverables} data={data} mutate={mutate} />
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
  const artwork = deliverables.filter((item) => item.deliverableType === "still" || item.deliverableType === "motion");
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
    <p className="review-share-copy">Share only selected artwork through an expiring, revocable link.</p>
    <fieldset><legend>Artwork</legend>{artwork.map((item) => <label key={item.id}><input type="checkbox" checked={selected.includes(item.id)} onChange={() => setSelected((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} />{item.format.replaceAll("-", " ")}</label>)}</fieldset>
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
