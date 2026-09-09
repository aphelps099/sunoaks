import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { repository } from "../lib/store";
import { applyAction } from "../lib/action-service";
import { createReviewLink } from "../lib/review-service";
import { fixtureDatabase } from "./fixtures";
import { GET } from "../app/api/review/[token]/asset/route";
vi.mock("node:fs/promises", () => ({ readFile: vi.fn(), mkdir: vi.fn(), writeFile: vi.fn(), rename: vi.fn() }));
vi.mock("../lib/store", () => ({ repository: { read: vi.fn() } }));
const assetId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
beforeEach(() => vi.clearAllMocks());
function review(formats: ("portrait" | "instagram-caption")[] = ["portrait"]) {
  const db = fixtureDatabase();
  db.assets[0].id = assetId; db.assets[0].fileReference = `/studio/api/assets/${assetId}`; db.records[0].assetId = assetId;
  applyAction({ action: "createPromotion", recordId: "record-event", marketingDate: "2026-09-12", formats }, db);
  const created = createReviewLink(db, { campaignId: db.campaigns[0].id, selectedDeliverableIds: db.deliverables.map((item) => item.id) });
  vi.mocked(repository.read).mockResolvedValue(db);
  vi.mocked(readFile).mockResolvedValue(Buffer.from("selected image"));
  return { db, ...created };
}
it("serves only the campaign photo authorized by a valid visual review", async () => {
  const { token } = review();
  const response = await GET(new Request("http://localhost/review/asset"), { params: Promise.resolve({ token }) });
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.text()).toBe("selected image");
  expect(String(vi.mocked(readFile).mock.calls[0][0])).toContain(`${assetId}.jpg`);
});
describe("review image boundaries", () => {
  it("rejects revoked and unknown tokens before reading any image bytes", async () => {
    const { token, link } = review(); link.revokedAt = new Date().toISOString();
    for (const value of [token, "unknown-token"]) expect((await GET(new Request("http://localhost/review/asset"), { params: Promise.resolve({ token: value }) })).status).toBe(404);
    expect(readFile).not.toHaveBeenCalled();
  });
  it("does not grant photo access through a caption-only review", async () => {
    const { token } = review(["instagram-caption"]);
    expect((await GET(new Request("http://localhost/review/asset"), { params: Promise.resolve({ token }) })).status).toBe(404);
    expect(readFile).not.toHaveBeenCalled();
  });
});
