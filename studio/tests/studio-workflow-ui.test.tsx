// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import StudioApp from "../components/StudioApp";
import { actionRequestSchema, applyAction } from "../lib/action-service";
import { deriveCampaignRollup } from "../lib/domain";
import { fixtureDatabase } from "./fixtures";

// These tests exercise workflow/navigation; pixel and codec rendering is a separate browser gate.
vi.mock("../components/CreativeCanvas", () => ({ StillCanvas: () => <div>Image preview</div>, MotionCanvas: () => <div>Animation preview</div>, renderPromotionFile: vi.fn() }));
let db: ReturnType<typeof fixtureDatabase>;
const data = () => ({ ...structuredClone(db), campaigns: db.campaigns.map((campaign) => ({ ...campaign, rollupStatus: deriveCampaignRollup(db.deliverables.filter((item) => item.campaignId === campaign.id)) })) });

beforeEach(() => {
  db = fixtureDatabase();
  window.history.replaceState(null, "", "/studio");
  vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) => {
    if (url.endsWith("/auth/me")) return { ok: true, json: async () => ({ authenticated: true }) };
    if (url.endsWith("/data")) return { ok: true, json: async () => data() };
    if (url.endsWith("/actions")) {
      const input = actionRequestSchema.parse(JSON.parse(String(options?.body)));
      try { const result = applyAction(input, db); return { ok: true, json: async () => result }; }
      catch (error) { return { ok: false, json: async () => ({ error: (error as Error).message }) }; }
    }
    throw new Error(`Unexpected request: ${url}`);
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function create(recordId: string) {
  return String(applyAction({ action: "createPromotion", recordId, marketingDate: "2026-09-12", formats: ["portrait", "instagram-caption"] }, db).campaignId);
}

describe("staff promotion workflow", () => {
  it("opens the requested older promotion directly instead of the latest one", async () => {
    const older = create("record-event"); create("record-class");
    window.history.replaceState(null, "", `/studio?view=campaigns&campaign=${older}`);
    render(<StudioApp />);
    await screen.findByRole("heading", { name: "Poolside Family Night" });
    expect(screen.queryByRole("heading", { name: "Sunrise Strength" })).toBeNull();
    expect((screen.getByLabelText("Promotion") as HTMLSelectElement).value).toBe(older);
  });

  it("creates only the selected outputs and lands in that promotion", async () => {
    render(<StudioApp />);
    await screen.findByRole("heading", { name: "What are we promoting?" });
    fireEvent.change(screen.getByLabelText("Class or event"), { target: { value: "record-class" } });
    fireEvent.click(screen.getByRole("button", { name: "Create promotion" }));
    await screen.findByRole("dialog", { name: "Sunrise Strength" });
    fireEvent.click(screen.getByRole("button", { name: "Create 2 materials" }));
    await screen.findByRole("heading", { name: "Sunrise Strength" });
    expect(db.deliverables.map((item) => item.format)).toEqual(["portrait", "instagram-caption"]);
    expect(window.location.search).toContain(`campaign=${db.campaigns[0].id}`);
  });

  it("protects an unsaved message, then saves it across materials", async () => {
    const id = create("record-event");
    window.history.replaceState(null, "", `/studio?view=campaigns&campaign=${id}`);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<StudioApp />);
    await screen.findByLabelText("Headline");
    fireEvent.change(screen.getByLabelText("Headline"), { target: { value: "Meet us by the pool" } });
    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    expect(confirm).toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Poolside Family Night" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save message" }));
    await waitFor(() => expect(db.deliverables[0].creativeFields.headline).toBe("Meet us by the pool"));
    await screen.findByText("Message saved · materials ready to review");
    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    await screen.findByRole("heading", { name: "What are we promoting?" });
    expect(confirm).toHaveBeenCalledTimes(1);
  });
});
