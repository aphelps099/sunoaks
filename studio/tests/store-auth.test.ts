import { mkdtemp } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { describe, expect, it } from "vitest";
import { JsonFileStudioRepository } from "../lib/store";
import { SESSION_COOKIE_NAME, SESSION_COOKIE_PATH, SESSION_TTL_SECONDS } from "../lib/auth";

describe("serialized repository writes", () => {
  it("serializes concurrent cold-start reads and returns one initialized database", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "sunoaks-cold-start-"));
    const repository = new JsonFileStudioRepository(path.join(directory, "studio.json"));
    const results = await Promise.all([repository.read(), repository.read(), repository.read(), repository.read()]);
    const recordIds = results.map((database) => database.records.map((record) => record.id));
    expect(recordIds[1]).toEqual(recordIds[0]);
    expect(recordIds[2]).toEqual(recordIds[0]);
    expect(recordIds[3]).toEqual(recordIds[0]);
    await expect(repository.read()).resolves.toMatchObject({ schemaVersion: 1 });
  });

  it("recovers the queue after one failed update", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "sunoaks-store-"));
    const repository = new JsonFileStudioRepository(path.join(directory, "studio.json"));
    await expect(repository.update(() => { throw new Error("intentional failure"); })).rejects.toThrow("intentional failure");
    let ran = false;
    await expect(repository.update(() => { ran = true; })).resolves.toBeDefined();
    expect(ran).toBe(true);
  });
});

describe("pilot session cookie contract", () => {
  it("uses the same scoped cookie path for creation and deletion", () => {
    expect(SESSION_COOKIE_NAME).toBe("sunoaks_studio");
    expect(SESSION_COOKIE_PATH).toBe("/studio");
    expect(SESSION_TTL_SECONDS).toBe(43_200);
  });
});
