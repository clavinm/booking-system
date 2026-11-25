import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authenticateEasebuzzNotification, easebuzzCheckoutUrl, initiateEasebuzzPayment, verifyEasebuzzPayment } from "@/lib/easebuzz";

vi.mock("server-only", () => ({}));

const key = "fixture-key";
const salt = "fixture-salt";
const attempt = "abc123abc123abc123ab";
const accessKey = "e".repeat(64);
const hash = (value: string) => createHash("sha512").update(value).digest("hex");
const transaction = { txnid: attempt, amount: "1.05", easepayid: "E9876TEST", status: "success" };

beforeEach(() => {
  vi.stubEnv("EB_MERCHANT_KEY", key);
  vi.stubEnv("EB_SALT", salt);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Easebuzz checkout and verification", () => {
  it("signs the exact amount and creates a hosted URL only for a valid access key", async () => {
    const gateway = vi.fn().mockResolvedValue(Response.json({ status: 1, data: accessKey }));
    vi.stubGlobal("fetch", gateway);

    expect(easebuzzCheckoutUrl(await initiateEasebuzzPayment(attempt, 105, "http://localhost:3000")))
      .toBe(`https://testpay.easebuzz.in/pay/${accessKey}`);
    const sent = gateway.mock.calls[0][1].body as URLSearchParams;
    expect(sent.get("amount")).toBe("1.05");
    expect(sent.get("surl")).toBe("http://localhost:3000/api/payments/easebuzz/return");
    expect(sent.get("hash")).toBe(hash(`${key}|${attempt}|1.05|SeatSync workspace reservation|SeatSync|checkout@example.com|||||||||||${salt}`));
    expect(sent.get("salt")).toBeNull();
    expect(() => easebuzzCheckoutUrl("https://example.com")).toThrow();
  });

  it("validates the reverse hash and rejects a tampered amount", () => {
    const form = new URLSearchParams({
      key, txnid: attempt, amount: "1.05", productinfo: "Seats", firstname: "Tester", email: "checkout@example.com",
      status: "success", udf1: "custom",
      hash: hash(`${salt}|success||||||||||custom|checkout@example.com|Tester|Seats|1.05|${attempt}|${key}`),
    });
    expect(authenticateEasebuzzNotification(form)).toEqual({ attemptRef: attempt, amountPaise: 105 });
    form.set("amount", "1.00");
    expect(() => authenticateEasebuzzNotification(form)).toThrow("Invalid payment notification.");
  });

  it("uses the signed lookup and accepts matching success as a record or a list", async () => {
    const gateway = vi.fn()
      .mockResolvedValueOnce(Response.json({ status: true, msg: transaction }))
      .mockResolvedValueOnce(Response.json({ status: true, msg: [{ ...transaction, status: "failure" }, transaction] }));
    vi.stubGlobal("fetch", gateway);
    const expected = { status: "SUCCESS", providerPaymentId: "E9876TEST" };
    await expect(verifyEasebuzzPayment(attempt, 105)).resolves.toEqual(expected);
    await expect(verifyEasebuzzPayment(attempt, 105)).resolves.toEqual(expected);
    const sent = gateway.mock.calls[0][1].body as URLSearchParams;
    expect(sent.get("hash")).toBe(hash(`${key}|${attempt}|${salt}`));
    expect(sent.get("salt")).toBeNull();
  });

  it("keeps unsuccessful checkout retryable and rejects a mismatched amount or transaction", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json({ status: true, msg: { ...transaction, status: "userCancelled" } }))
      .mockResolvedValueOnce(Response.json({ status: true, msg: transaction }))
      .mockResolvedValueOnce(Response.json({ status: true, msg: { ...transaction, txnid: "different" } })));
    await expect(verifyEasebuzzPayment(attempt, 105)).resolves.toEqual({ status: "PENDING" });
    await expect(verifyEasebuzzPayment(attempt, 205)).rejects.toMatchObject({ code: "PAYMENT_MISMATCH" });
    await expect(verifyEasebuzzPayment(attempt, 105)).rejects.toMatchObject({ code: "PAYMENT_MISMATCH" });
  });
});
