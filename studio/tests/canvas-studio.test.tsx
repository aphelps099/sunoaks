// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import CanvasStudio from "../components/CanvasStudio";
import { actionRequestSchema, applyAction } from "../lib/action-service";
import { databaseSchema, validateDatabaseIntegrity } from "../lib/domain";
import { newCanvasDocument, stillDocument } from "../lib/canvas-document";
import { fixtureDatabase } from "./fixtures";

vi.mock("../lib/photo-composition", async (original) => ({ ...await original<typeof import("../lib/photo-composition")>(), SUN_OAKS_LOGO: "/logo.png", loadCanvasBrand: async () => ({}) }));
vi.mock("../lib/motion-engine", async (original) => ({ ...await original<typeof import("../lib/motion-engine")>(), renderMotionFrame: vi.fn(), exportMotionMp4: vi.fn(async () => new Blob(["video"], { type: "video/mp4" })), downloadMotionBlob: vi.fn() }));
let db: ReturnType<typeof fixtureDatabase>;
const mutate = vi.fn(async (input: Record<string, unknown>) => applyAction(actionRequestSchema.parse(input), db));
const props = () => ({ data: { ...db, campaigns: [] }, mutate, onDirtyChange: vi.fn(), onProject: vi.fn(), onLegacy: vi.fn(), onImport: vi.fn(), onLogout: vi.fn() });
beforeEach(() => {
  db = fixtureDatabase(); mutate.mockClear();
  Object.defineProperty(document, "fonts", { configurable: true, value: { ready: Promise.resolve() } });
  vi.stubGlobal("Image", class { src = ""; width = 100; height = 100; async decode() {} });
  vi.stubGlobal("VideoFrame", class {});
  vi.stubGlobal("VideoEncoder", class { static async isConfigSupported() { return { supported: true }; } });
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn(), measureText: (text: string) => ({ width: text.length * 15 }) } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/jpeg;base64,preview");
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("canvas workspace", () => {
  it("edits and autosaves without a verified-record setup, then keeps the canvas mounted while planning", async () => {
    db.records = []; db.scheduleRules = []; db.calendarItems = []; db.occurrences = [];
    render(<CanvasStudio {...props()} />);
    const canvas = screen.getByLabelText("Sun Oaks live canvas");
    fireEvent.change(screen.getByLabelText("Headline"), { target: { value: "Find your sunny side." } });
    await waitFor(() => expect(db.creativeProjects).toHaveLength(1), { timeout: 2500 });
    expect(db.creativeProjects[0].recordId).toBeNull();
    expect((db.creativeProjects[0].payload.doc as ReturnType<typeof newCanvasDocument>).scenes[0].title).toBe("Find your sunny side.");
    fireEvent.click(screen.getByRole("button", { name: "Calendar" }));
    fireEvent.change(screen.getByLabelText("Planned date"), { target: { value: "2026-09-21" } });
    await waitFor(() => expect(db.creativeProjects[0].payload.plannedDate).toBe("2026-09-21"), { timeout: 2500 });
    fireEvent.click(screen.getByRole("button", { name: "Close panel" }));
    expect(screen.getByLabelText("Sun Oaks live canvas")).toBe(canvas);
    expect((screen.getByLabelText("Headline") as HTMLTextAreaElement).value).toBe("Find your sunny side.");
    expect(validateDatabaseIntegrity(databaseSchema.parse(db))).toBeTruthy();
  });

  it("imports an event directly beside the canvas and exposes MP4 export", async () => {
    render(<CanvasStudio {...props()} />);
    await waitFor(() => expect((screen.getByRole("button", { name: "Export MP4" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Use class / event" }));
    fireEvent.click(screen.getByRole("button", { name: /Poolside Family Night/ }));
    await waitFor(() => expect((screen.getByLabelText("Headline") as HTMLTextAreaElement).value).toBe("Poolside Family Night"));
    expect((screen.getByLabelText("Small line") as HTMLTextAreaElement).value).toContain("6:30 PM–8:30 PM");
    fireEvent.click(screen.getByRole("button", { name: "Export MP4" }));
    await screen.findByText("MP4 download started.");
    const { exportMotionMp4 } = await import("../lib/motion-engine");
    expect(exportMotionMp4).toHaveBeenCalledWith(expect.objectContaining({ designVersion: 2 }), expect.any(Object), expect.any(Function), expect.any(AbortSignal));
  });

  it("adds a finished scene in place and saves canvas text, colors, and logo choices through export", async () => {
    render(<CanvasStudio {...props()} />);
    const canvas = screen.getByLabelText("Sun Oaks live canvas");
    const headlineBefore = (screen.getByLabelText("Headline") as HTMLTextAreaElement).value;
    fireEvent.click(screen.getByRole("button", { name: "Add Take a breath scene" }));
    expect(screen.getByLabelText("Sun Oaks live canvas")).toBe(canvas);
    expect((screen.getByLabelText("Headline") as HTMLTextAreaElement).value).toBe("Breathe in.\nFind your pace.");
    fireEvent.click(await screen.findByRole("button", { name: "Edit headline on canvas" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Edit headline on canvas" }), { target: { value: "Make this moment yours." } });
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Edit headline on canvas" }), { key: "Escape" });
    expect((screen.getByLabelText("Headline") as HTMLTextAreaElement).value).toBe("Make this moment yours.");
    fireEvent.click(screen.getByRole("button", { name: "Color style: Pool blue" }));
    fireEvent.click(screen.getByRole("button", { name: /Small wordmark/ }));
    await waitFor(() => expect(db.creativeProjects).toHaveLength(1), { timeout: 2500 });
    const saved = db.creativeProjects[0].payload.doc as ReturnType<typeof newCanvasDocument>;
    expect(saved.scenes).toHaveLength(4);
    expect(saved.scenes[0].title).toBe(headlineBefore);
    expect(saved.scenes[1]).toMatchObject({ title: "Make this moment yours.", styleId: "pool", logoStyle: "wordmark", animation: "fade", duration: 4500, imageId: null });
    fireEvent.click(screen.getByRole("button", { name: "Export MP4" }));
    await screen.findByText("MP4 download started.");
    const { exportMotionMp4 } = await import("../lib/motion-engine");
    expect(exportMotionMp4).toHaveBeenLastCalledWith(expect.objectContaining({ scenes: expect.arrayContaining([expect.objectContaining({ title: "Make this moment yours.", styleId: "pool", logoStyle: "wordmark" })]) }), expect.any(Object), expect.any(Function), expect.any(AbortSignal));
  });

  it("applies a palette to the whole sequence and can undo that action", async () => {
    render(<CanvasStudio {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: "Color style: Terracotta" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply to all" }));
    await waitFor(() => expect(db.creativeProjects).toHaveLength(1), { timeout: 2500 });
    expect((db.creativeProjects[0].payload.doc as ReturnType<typeof newCanvasDocument>).scenes.every((scene) => scene.styleId === "clay")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect((db.creativeProjects[0].payload.doc as ReturnType<typeof newCanvasDocument>).scenes[1].styleId).toBe("sun"), { timeout: 2500 });
  });

  it("saves motion, photo movement, transition, and grain choices from the inspector", async () => {
    render(<CanvasStudio {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: "Letters" }));
    fireEvent.change(screen.getByLabelText("Between scenes"), { target: { value: "wipe" } });
    fireEvent.click(screen.getByLabelText("Film grain"));
    fireEvent.click(screen.getByRole("button", { name: "Add Poolside moment scene" }));
    fireEvent.change(screen.getByLabelText("Photo movement"), { target: { value: "pan-left" } });
    await waitFor(() => expect(db.creativeProjects).toHaveLength(1), { timeout: 2500 });
    await waitFor(() => expect((db.creativeProjects[0].payload.doc as ReturnType<typeof newCanvasDocument>).scenes[1].kenBurns).toBe("pan-left"), { timeout: 2500 });
    const saved = db.creativeProjects[0].payload.doc as ReturnType<typeof newCanvasDocument>;
    expect(saved.grain).toBe(false);
    expect(saved.scenes[0]).toMatchObject({ animation: "letters", transition: "wipe" });
    expect(saved.scenes[1]).toMatchObject({ kenBurns: "pan-left", zoom: true });
  });

  it("switches a scene to a number, a list, and a date from the inspector and saves their fields", async () => {
    render(<CanvasStudio {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: "Number" }));
    fireEvent.change(screen.getByLabelText("Big number"), { target: { value: "48" } });
    fireEvent.change(screen.getByLabelText("After"), { target: { value: "+" } });
    fireEvent.click(screen.getByRole("button", { name: "Add What’s included scene" }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit list lines on canvas" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Edit list lines on canvas" }), { target: { value: "Lap lanes\nPickleball" } });
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Edit list lines on canvas" }), { key: "Escape" });
    expect((screen.getByLabelText("List lines") as HTMLTextAreaElement).value).toBe("Lap lanes\nPickleball");
    fireEvent.click(screen.getByRole("button", { name: "Date" }));
    fireEvent.change(screen.getByLabelText("Event date"), { target: { value: "2026-10-31" } });
    await waitFor(() => expect(db.creativeProjects).toHaveLength(1), { timeout: 2500 });
    await waitFor(() => expect((db.creativeProjects[0].payload.doc as ReturnType<typeof newCanvasDocument>).scenes[1].eventDate).toBe("2026-10-31"), { timeout: 2500 });
    const saved = db.creativeProjects[0].payload.doc as ReturnType<typeof newCanvasDocument>;
    expect(saved.scenes[0]).toMatchObject({ template: "stat", statValue: 48, statSuffix: "+", imageId: "library-asset-approved" });
    expect(saved.scenes[1]).toMatchObject({ template: "calendar", body: "Lap lanes\nPickleball", eventDate: "2026-10-31" });
  });

  it("preserves the draft and surfaces a save conflict", async () => {
    const doc = newCanvasDocument(undefined, "library-asset-approved");
    applyAction(actionRequestSchema.parse({ action: "saveCreativeProject", kind: "motion", recordId: null, title: "My design", payload: { editor: "canvas-v2", mode: "video", plannedDate: null, doc, artworks: [{ key: "canvas-preview", dataUrl: "data:image/jpeg;base64,preview" }] } }), db);
    const p = props(); p.data = structuredClone(p.data);
    db.creativeProjects[0].version = 2;
    render(<CanvasStudio {...p} initialProjectId={db.creativeProjects[0].id} />);
    fireEvent.change(screen.getByLabelText("Headline"), { target: { value: "Keep my edit" } });
    await screen.findByText(/changed in another window/, {}, { timeout: 2500 });
    expect((screen.getByLabelText("Headline") as HTMLTextAreaElement).value).toBe("Keep my edit");
    expect(db.creativeProjects[0].version).toBe(2);
  });
});

// jsdom has neither PointerEvent nor layout, so pointer gestures are mouse events carrying a pointer id,
// and element boxes come from a stand-in: scene cards stack 130px apart, timeline clips sit 300px apart.
const pointer = (element: Element, type: string, clientX: number, clientY: number) => {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY, button: 0 });
  Object.defineProperty(event, "pointerId", { value: 1 }); Object.defineProperty(event, "pointerType", { value: "mouse" });
  fireEvent(element, event);
};
const box = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
const layout = () => vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
  const index = Array.from(this.parentElement?.querySelectorAll(":scope > [data-reorder-item]") ?? []).indexOf(this);
  if (this.classList.contains("cs-scene")) return box(0, index * 130, 140, 120);
  if (this.classList.contains("cs-clip")) return box(index * 300, 0, 290, 38);
  if (this.classList.contains("cs-track")) return box(0, 0, 1250, 38);
  return box(0, 0, 0, 0);
});
const savedScenes = () => (db.creativeProjects[0].payload.doc as ReturnType<typeof newCanvasDocument>).scenes;

describe("timeline editing", () => {
  it("changes a scene’s length by pulling its edge on the timeline, or with the keyboard", async () => {
    layout();
    render(<CanvasStudio {...props()} />);
    const edge = screen.getByRole("slider", { name: "Length of scene 1" });
    expect(edge).toHaveProperty("ariaValueNow", "5");
    pointer(edge, "pointerdown", 100, 10);
    pointer(edge, "pointermove", 160, 10);
    expect(edge.getAttribute("aria-valuenow")).toBe("5.6");
    expect(edge.getAttribute("aria-valuetext")).toBe("5.6s");
    pointer(edge, "pointermove", 20, 10);
    expect(edge.getAttribute("aria-valuenow")).toBe("4.2");
    pointer(edge, "pointerup", 20, 10);
    expect(screen.getByRole("button", { name: /^Scene 1:/ }).getAttribute("aria-current")).toBe("true");
    expect((screen.getByLabelText(/Scene length/) as HTMLInputElement).value).toBe("4200");
    fireEvent.keyDown(edge, { key: "ArrowRight" });
    fireEvent.keyDown(edge, { key: "ArrowRight", shiftKey: true });
    expect(edge.getAttribute("aria-valuenow")).toBe("5.7");
    fireEvent.keyDown(edge, { key: "End" });
    expect(edge.getAttribute("aria-valuenow")).toBe("12");
    fireEvent.keyDown(edge, { key: "Home" });
    expect(edge.getAttribute("aria-valuenow")).toBe("1.5");
    pointer(edge, "pointerdown", 100, 10);
    pointer(edge, "pointermove", 1600, 10);
    pointer(edge, "pointerup", 1600, 10);
    expect(edge.getAttribute("aria-valuenow")).toBe("12");
    await waitFor(() => expect(db.creativeProjects).toHaveLength(1), { timeout: 2500 });
    await waitFor(() => expect(savedScenes()[0].duration).toBe(12000), { timeout: 2500 });
    expect(savedScenes().map((scene) => scene.duration)).toEqual([12000, 4000, 3500]);
  });

  it("moves scenes by dragging them in the scene list or on the timeline, or with Alt + arrows", async () => {
    layout();
    render(<CanvasStudio {...props()} />);
    const titles = () => Array.from(document.querySelectorAll(".cs-clip-body i")).map((clip) => clip.textContent);
    const [opener, energy, ending] = titles();
    const card = () => document.querySelectorAll<HTMLButtonElement>(".cs-scene");
    pointer(card()[0], "pointerdown", 50, 60);
    pointer(card()[0], "pointermove", 50, 70);
    pointer(card()[0], "pointermove", 50, 330);
    expect(card()[0].className).toContain("is-dragging");
    pointer(card()[0], "pointerup", 50, 330);
    expect(titles()).toEqual([energy, ending, opener]);
    expect(card()[2].getAttribute("aria-current")).toBe("true");
    fireEvent.keyDown(card()[2], { key: "ArrowUp", altKey: true });
    expect(titles()).toEqual([energy, opener, ending]);
    const clip = () => document.querySelectorAll<HTMLButtonElement>(".cs-clip-body");
    pointer(clip()[2], "pointerdown", 750, 20);
    pointer(clip()[2], "pointermove", 740, 20);
    pointer(clip()[2], "pointermove", 100, 20);
    pointer(clip()[2], "pointerup", 100, 20);
    expect(titles()).toEqual([ending, energy, opener]);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(titles()).toEqual([energy, opener, ending]);
    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    await waitFor(() => expect(db.creativeProjects).toHaveLength(1), { timeout: 2500 });
    await waitFor(() => expect(savedScenes().map((scene) => scene.title)).toEqual([ending, energy, opener]), { timeout: 2500 });
  });
});

describe("canvas document persistence", () => {
  it("rejects unavailable media and malformed timing before writing a design", () => {
    const doc = newCanvasDocument(undefined, "library-asset-review");
    const input = { action: "saveCreativeProject", kind: "motion", recordId: null, title: "My design", payload: { editor: "canvas-v2", mode: "video", plannedDate: null, doc, artworks: [{ key: "canvas-preview", dataUrl: "data:image/jpeg;base64,preview" }] } };
    expect(() => applyAction(actionRequestSchema.parse(input), db)).toThrow(/Studio photo/);
    doc.scenes[0].imageId = "library-asset-approved"; doc.scenes[0].duration = -1;
    expect(() => applyAction(actionRequestSchema.parse(input), db)).toThrow();
    expect(db.creativeProjects).toHaveLength(0);
  });
  it("settles static artwork independently of video timing and preserves the source document", () => {
    const doc = newCanvasDocument(); doc.scenes[0].duration = 1500;
    const still = stillDocument(doc, doc.scenes[0].id);
    expect(still.scenes[0]).toMatchObject({ duration: 4000, animation: "fade", transition: "cut" });
    expect(doc.scenes[0]).toMatchObject({ duration: 1500, animation: "stagger" });
  });
});
