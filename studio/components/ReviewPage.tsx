"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Check, MessageSquareText, ShieldCheck } from "lucide-react";

type ReviewData = {
  title: string;
  version: number;
  approvalState: "pending" | "approved" | "changes_requested";
  reviewerComment: string | null;
  expiresAt: string;
  artwork: {
    key: string;
    kind: "still" | "motion";
    format: string;
    width: number | null;
    height: number | null;
    creativeFields: Record<string, string>;
    dataUrl?: string;
  }[];
  presentation: {
    projectKind?: "promo" | "motion";
    facts?: { recordType: "event" | "recurring_class"; name: string; date?: string; startTime?: string; location?: string; cta: string };
    asset: { fileReference: string; altText: string; focalPoint: { x: number; y: number } } | null;
  };
};

function BrandMark() {
  return <div className="public-brand"><span className="public-sun" />SUN OAKS <small>GM REVIEW</small></div>;
}

function Preview({ data, artwork }: { data: ReviewData; artwork: ReviewData["artwork"][number] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (artwork.dataUrl) return;
    let active = true;
    const render = async () => {
      const canvas = ref.current;
      if (!canvas) return;
      const width = artwork.width || 1080;
      const height = artwork.height || 1080;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#FAF9F7";
      ctx.fillRect(0, 0, width, height);
      const photoHeight = height * .56;
      if (data.presentation.asset) {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.src = data.presentation.asset.fileReference;
        await image.decode().catch(() => undefined);
        if (!active || !image.naturalWidth) return;
        const scale = Math.max(width / image.naturalWidth, photoHeight / image.naturalHeight);
        const sw = width / scale;
        const sh = photoHeight / scale;
        const sx = Math.max(0, Math.min(image.naturalWidth - sw, image.naturalWidth * data.presentation.asset.focalPoint.x - sw / 2));
        const sy = Math.max(0, Math.min(image.naturalHeight - sh, image.naturalHeight * data.presentation.asset.focalPoint.y - sh / 2));
        ctx.drawImage(image, sx, sy, sw, sh, 0, 0, width, photoHeight);
        const gradient = ctx.createLinearGradient(0, 0, 0, photoHeight);
        gradient.addColorStop(.45, "transparent");
        gradient.addColorStop(1, "rgba(13,13,12,.6)");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, photoHeight);
      } else {
        ctx.fillStyle = "#0D0D0C";
        ctx.fillRect(0, 0, width, photoHeight);
        ctx.fillStyle = "#F7B500";
        ctx.beginPath();
        ctx.arc(width * .78, photoHeight * .26, width * .11, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#F7B500";
      ctx.fillRect(0, photoHeight, width, Math.max(12, height * .012));
      const pad = width * .075;
      ctx.fillStyle = "#0891A8";
      ctx.font = `600 ${Math.max(20, width * .024)}px Jost, sans-serif`;
      const facts = data.presentation.facts;
      if (!facts) return;
      ctx.fillText(facts.recordType === "event" ? "SUN OAKS EVENT" : "CLASS SPOTLIGHT", pad, photoHeight + height * .085);
      ctx.fillStyle = "#0D0D0C";
      ctx.font = `600 ${Math.max(42, width * .067)}px Jost, sans-serif`;
      const title = artwork.creativeFields.headline || facts.name;
      ctx.fillText(title.slice(0, 36), pad, photoHeight + height * .17, width - pad * 2);
      ctx.font = `500 ${Math.max(24, width * .031)}px Newsreader, serif`;
      ctx.fillText((artwork.creativeFields.schedule || facts.date || facts.startTime || "").slice(0, 60), pad, photoHeight + height * .245, width - pad * 2);
      ctx.font = `500 ${Math.max(20, width * .025)}px Jost, sans-serif`;
      ctx.fillText((artwork.creativeFields.location || facts.location || "").slice(0, 65), pad, photoHeight + height * .3, width - pad * 2);
      ctx.font = `600 ${Math.max(18, width * .022)}px Jost, sans-serif`;
      ctx.fillText(facts.cta.slice(0, 65), pad, photoHeight + height * .36, width - pad * 2);
      ctx.textAlign = "right";
      ctx.fillText("SUN OAKS", width - pad, height - pad * .55);
    };
    void render();
    return () => { active = false; };
  }, [artwork, data]);
  return <figure className="public-artwork">
    {artwork.dataUrl
      // Data URLs are immutable, server-saved review snapshots and cannot use Next's optimizer.
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={artwork.dataUrl} alt={`${artwork.format} saved review artwork`} />
      : <canvas ref={ref} aria-label={`${artwork.format} review artwork`} />}
    <figcaption>{artwork.format.replaceAll("-", " ")} · {artwork.kind}</figcaption>
  </figure>;
}

export default function ReviewPage({ token }: { token: string }) {
  const [data, setData] = useState<ReviewData | null>(null);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
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
        <p className="eyebrow">SELECTED ARTWORK ONLY</p>
        <h1>{data.title}</h1>
        <p>Version {data.version} · Link expires {new Date(data.expiresAt).toLocaleString()}</p>
      </section>
      <section className="public-gallery">{data.artwork.map((artwork) => <Preview key={artwork.key} data={data} artwork={artwork} />)}</section>
      <section className="public-decision">
        <div><p className="eyebrow">GM REVIEW</p><h2>{data.approvalState === "pending" ? "Ready for your decision?" : `Review marked ${data.approvalState.replaceAll("_", " ")}`}</h2><p>Your response applies only to the artwork shown above.</p></div>
        {data.approvalState === "pending" ? <div className="public-actions">
            <button className="button primary" disabled={pending} onClick={() => decide("approve")}><Check size={17} />Approve selected artwork</button>
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
