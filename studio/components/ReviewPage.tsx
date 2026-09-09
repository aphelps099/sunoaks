"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { drawCreative } from "./CreativeCanvas";
import type { SourceSnapshot } from "@/lib/client-types";
import { outputLabel } from "@/lib/promotion";
import { Check, MessageSquareText, ShieldCheck } from "lucide-react";

type ReviewData = {
  title: string;
  version: number;
  approvalState: "pending" | "approved" | "changes_requested";
  reviewerComment: string | null;
  expiresAt: string;
  artwork: {
    key: string;
    kind: "still" | "motion" | "caption" | "emailCopy";
    format: string;
    width: number | null;
    height: number | null;
    creativeFields: Record<string, string>;
    dataUrl?: string;
  }[];
  presentation: {
    projectKind?: "promo" | "motion";
    facts?: SourceSnapshot["facts"];
    asset: { fileReference: string; altText: string; focalPoint: { x: number; y: number } } | null;
  };
};

function BrandMark() {
  return <div className="public-brand"><span className="public-sun" />SUN OAKS <small>GM REVIEW</small></div>;
}

function Preview({ data, artwork, onReady }: { data: ReviewData; artwork: ReviewData["artwork"][number]; onReady: (key: string, ready: boolean) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const savedImageRef = useRef<HTMLImageElement>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const copy = artwork.kind === "caption" || artwork.kind === "emailCopy";
  useEffect(() => {
    onReady(artwork.key, false);
    if (copy) { onReady(artwork.key, true); return; }
    if (artwork.dataUrl) { if (savedImageRef.current?.complete && savedImageRef.current.naturalWidth > 0) onReady(artwork.key, true); return; }
    let live = true; let frame = 0;
    const render = async () => {
      const facts = data.presentation.facts;
      if (!facts) throw new Error("The preview details are unavailable.");
      await document.fonts.ready;
      let image: HTMLImageElement | null = null;
      if (data.presentation.asset) { image = new Image(); image.crossOrigin = "anonymous"; image.src = data.presentation.asset.fileReference; await image.decode(); }
      if (!live || !ref.current) return;
      const snapshot = { facts };
      const start = performance.now();
      const draw = (time: number) => {
        if (!live || !ref.current) return;
        const progress = playing && artwork.kind === "motion" ? Math.min(1, ((time - start) % 6000) / 1300) : 1;
        drawCreative(ref.current, artwork, snapshot, image, data.presentation.asset || undefined, progress);
        if (playing && artwork.kind === "motion") frame = requestAnimationFrame(draw);
      };
      draw(start); setError(""); onReady(artwork.key, true);
    };
    void render().catch(() => { if (live) { setError("This preview could not load. Reload the page before approving."); onReady(artwork.key, false); } });
    return () => { live = false; cancelAnimationFrame(frame); };
  }, [artwork, copy, data, onReady, playing]);
  return <figure className="public-artwork">
    {copy ? <div className="public-copy-preview">{artwork.kind === "caption" ? <pre>{artwork.creativeFields.caption}</pre> : <><strong>Subject</strong><p>{artwork.creativeFields.subject}</p><strong>Preview text</strong><p>{artwork.creativeFields.preview}</p><pre>{artwork.creativeFields.body}</pre></>}</div> : artwork.dataUrl
      // eslint-disable-next-line @next/next/no-img-element
      ? <img ref={savedImageRef} src={artwork.dataUrl} alt={`${artwork.format} saved review artwork`} onLoad={() => onReady(artwork.key, true)} onError={() => { setError("This saved preview could not load."); onReady(artwork.key, false); }} />
      : <canvas ref={ref} aria-label={`${artwork.format} review artwork`} />}
    {artwork.kind === "motion" && !artwork.dataUrl && <button className="button secondary compact" onClick={() => setPlaying((value) => !value)}>{playing ? "Pause animation" : "Play 6-second preview"}</button>}
    {error && <p className="inline-error" role="alert">{error}</p>}
    <figcaption>{outputLabel(artwork.format)}{artwork.kind === "motion" && artwork.dataUrl ? " · still-frame review only" : ""}</figcaption>
  </figure>;
}

export default function ReviewPage({ token }: { token: string }) {
  const [data, setData] = useState<ReviewData | null>(null);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState<Record<string, boolean>>({});
  const markReady = useCallback((key: string, value: boolean) => setReady((current) => current[key] === value ? current : { ...current, [key]: value }), []);
  useEffect(() => {
    fetch(`/studio/api/review/${encodeURIComponent(token)}`, { cache: "no-store", referrerPolicy: "no-referrer" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        setData(body);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Review is unavailable."));
  }, [token]);
  const decide = async (decision: "approve" | "request_changes", event?: FormEvent) => {
    event?.preventDefault();
    if (decision === "request_changes" && !comment.trim()) {
      setError("Add a comment describing the requested changes.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/studio/api/review/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, comment }),
        referrerPolicy: "no-referrer",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setData(body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Review could not be saved.");
    } finally {
      setPending(false);
    }
  };
  if (!data) return <main className="public-review"><header><BrandMark /></header><section className="public-message"><ShieldCheck /><h1>{error || "Loading secure review…"}</h1>{error && <p>Ask the campaign editor for a new review link.</p>}</section></main>;
  return (
    <main className="public-review">
      <header><BrandMark /><span className={`public-state state-${data.approvalState}`}>{data.approvalState.replaceAll("_", " ")}</span></header>
      <section className="public-review-head">
        <p className="eyebrow">PROMOTION REVIEW</p>
        <h1>{data.title}</h1>
        <p>Version {data.version} · Link expires {new Date(data.expiresAt).toLocaleString()}</p>
      </section>
      <section className="public-gallery">{data.artwork.map((artwork) => <Preview key={artwork.key} data={data} artwork={artwork} onReady={markReady} />)}</section>
      <section className="public-decision">
        <div><p className="eyebrow">GM REVIEW</p><h2>{data.approvalState === "pending" ? "Ready for your decision?" : `Review marked ${data.approvalState.replaceAll("_", " ")}`}</h2><p>Your response applies to the materials shown above.</p></div>
        {data.approvalState === "pending" ? <div className="public-actions">
            <button className="button primary" disabled={pending || !data.artwork.every((item) => ready[item.key])} onClick={() => decide("approve")}><Check size={17} />Approve these materials</button>
            <form onSubmit={(event) => decide("request_changes", event)}>
              <label htmlFor="review-comment">Changes needed <span>required</span></label>
              <textarea id="review-comment" value={comment} onChange={(event) => setComment(event.target.value)} rows={3} placeholder="Describe the exact change needed…" required />
              <button className="button secondary" disabled={pending}><MessageSquareText size={17} />Request changes</button>
            </form>
            {error && <p className="inline-error" role="alert">{error}</p>}
          </div>
          : <div className="public-actions"><p className="review-locked"><ShieldCheck size={18} />This decision is final. Ask the campaign editor for a new review link if another review is needed.</p>{data.reviewerComment && <blockquote>{data.reviewerComment}</blockquote>}</div>}
      </section>
    </main>
  );
}
