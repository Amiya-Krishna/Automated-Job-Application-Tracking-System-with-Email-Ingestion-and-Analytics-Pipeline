import { describe, expect, it, vi } from "vitest";

vi.mock("../api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
const { default: api } = await import("../api");
const { waitForSession, jobFromKey, toApiError, ResumeApiError } = await import("../services/resumeApi");

const ok = (data) => Promise.resolve({ data });

describe("resumeApi", () => {
  it("jobFromKey parses tracked/engine keys and rejects junk", () => {
    expect(jobFromKey("tracked-12")).toEqual({ trackedJobId: 12 });
    expect(jobFromKey("engine-7")).toEqual({ engineJobId: 7 });
    for (const bad of [null, "", "jd-abc", "tracked-x", "engine-1; drop"]) expect(jobFromKey(bad)).toBeNull();
  });

  it("waitForSession reports every real stage, then resolves on success", async () => {
    api.get.mockReset();
    api.get
      .mockReturnValueOnce(ok({ status: "running", stage: "analyzing_jd" }))
      .mockReturnValueOnce(ok({ status: "running", stage: "generating" }))
      .mockReturnValueOnce(ok({ status: "succeeded", stage: "ready", versionId: 5 }));
    const seen = [];
    const done = await waitForSession("s1", { onUpdate: (s) => seen.push(s.stage), sleep: async () => {} });
    expect(seen).toEqual(["analyzing_jd", "generating", "ready"]);
    expect(done.versionId).toBe(5);
  });

  it("waitForSession surfaces the API's error message and code", async () => {
    api.get.mockReset();
    api.get.mockReturnValueOnce(ok({ status: "failed", error: "None of this job's requirements are supported by your resume.", errorCode: "no_matching_skills" }));
    await expect(waitForSession("s", { sleep: async () => {} })).rejects.toMatchObject({ code: "no_matching_skills", message: expect.stringMatching(/supported by your resume/) });
  });

  it("waitForSession times out and can be cancelled", async () => {
    api.get.mockReset();
    api.get.mockImplementation(() => ok({ status: "running", stage: "generating" }));
    await expect(waitForSession("s", { timeoutMs: -1, sleep: async () => {} })).rejects.toMatchObject({ code: "timeout" });
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(waitForSession("s", { signal: ctrl.signal })).rejects.toMatchObject({ code: "cancelled" });
  });

  it("toApiError maps API bodies, network failures and unknowns", () => {
    expect(toApiError({ response: { status: 422, data: { message: "Upload your resume before tailoring.", code: "no_resume" } } })).toMatchObject({ code: "no_resume", status: 422 });
    expect(toApiError({ code: "ERR_NETWORK" }).code).toBe("network");
    expect(toApiError(new Error("boom")).message).toMatch(/try again/i);
    expect(toApiError(new ResumeApiError("x", { code: "c" })).code).toBe("c");
  });
});
