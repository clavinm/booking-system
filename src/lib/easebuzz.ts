import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { ReservationError } from "@/services/reservation-error";

export const easebuzzProvider = "EASEBUZZ_TEST";
const payOrigin = "https://testpay.easebuzz.in";
const initiateUrl = `${payOrigin}/payment/initiateLink`;
const verifyUrl = "https://testdashboard.easebuzz.in/transaction/v2/retrieve";
const checkoutKeySchema = z.string().regex(/^[a-f0-9]{64}$/);
const customFields = Array.from({ length: 10 }, (_, index) => `udf${index + 1}`);

export function easebuzzCredentials() {
  const key = process.env.EB_MERCHANT_KEY?.trim();
  const salt = process.env.EB_SALT?.trim();
  const env = process.env.EB_ENV?.trim() || "test";
  const mode = process.env.APP_EB_MODE?.trim() || "test";
  const endpoint = process.env.EB_LINK?.trim() || initiateUrl;
  if (!key || !salt || env !== "test" || mode !== "test" || endpoint !== initiateUrl) {
    throw new ReservationError("PAYMENT_UNAVAILABLE");
  }
  return { key, salt, endpoint };
}

function sha512(parts: string[]) {
  return createHash("sha512").update(parts.join("|"), "utf8").digest("hex");
}

function amountInPaise(amount: string) {
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(amount);
  return match ? Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0")) : null;
}

async function easebuzzRequest(endpoint: string, fields: Record<string, string>): Promise<unknown> {
  try {
    const result = await fetch(endpoint, {
      method: "POST", body: new URLSearchParams(fields), cache: "no-store",
      headers: { Accept: "application/json" }, signal: AbortSignal.timeout(7_000), redirect: "error",
    });
    if (!result.ok) throw new ReservationError("PAYMENT_UNAVAILABLE");
    return await result.json();
  } catch {
    throw new ReservationError("PAYMENT_UNAVAILABLE");
  }
}

export async function initiateEasebuzzPayment(attemptRef: string, amountPaise: number, origin: string) {
  const { key, salt, endpoint } = easebuzzCredentials();
  const amount = `${Math.floor(amountPaise / 100)}.${String(amountPaise % 100).padStart(2, "0")}`;
  const callback = new URL("/api/payments/easebuzz/return", origin).href;
  const firstName = "SeatSync";
  const email = "checkout@example.com";
  const product = "SeatSync workspace reservation";
  const hash = sha512([key, attemptRef, amount, product, firstName, email, ...customFields.map(() => ""), salt]);
  const raw = await easebuzzRequest(endpoint, {
    key, txnid: attemptRef, amount, productinfo: product, firstname: firstName, email,
    phone: "9999999999", surl: callback, furl: callback, hash,
  });
  const result = z.object({ status: z.union([z.literal(1), z.literal("1")]), data: checkoutKeySchema }).safeParse(raw);
  if (!result.success) throw new ReservationError("PAYMENT_UNAVAILABLE");
  return result.data.data;
}

export function easebuzzCheckoutUrl(accessKey: string) {
  return `${payOrigin}/pay/${checkoutKeySchema.parse(accessKey)}`;
}

export function authenticateEasebuzzNotification(form: URLSearchParams) {
  const { key, salt } = easebuzzCredentials();
  const read = (field: string) => form.get(field) ?? "";
  const hash = read("hash");
  const attemptRef = read("txnid");
  const amountPaise = amountInPaise(read("amount"));
  const status = read("status");
  if (read("key") !== key || !/^[a-f0-9]{20}$/.test(attemptRef) || amountPaise === null ||
      !status || !/^[a-f0-9]{128}$/i.test(hash)) {
    throw new ReservationError("INVALID_PAYMENT_NOTIFICATION");
  }

  const expected = sha512([
    salt, status, ...customFields.toReversed().map(read), read("email"), read("firstname"),
    read("productinfo"), read("amount"), attemptRef, key,
  ]);
  if (!timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(expected, "hex"))) {
    throw new ReservationError("INVALID_PAYMENT_NOTIFICATION");
  }
  return { attemptRef, amountPaise };
}

const transactionSchema = z.object({
  txnid: z.string(),
  amount: z.union([z.string(), z.number()]),
  easepayid: z.string().regex(/^[a-z0-9_-]{1,80}$/i).optional(),
  status: z.string().transform((status) => status.toLowerCase()),
});

export async function verifyEasebuzzPayment(attemptRef: string, amountPaise: number) {
  const { key, salt } = easebuzzCredentials();
  const raw = await easebuzzRequest(verifyUrl, { key, txnid: attemptRef, hash: sha512([key, attemptRef, salt]) });
  const payload = z.object({
    status: z.union([z.literal(true), z.literal(1)]),
    msg: z.union([transactionSchema, z.array(transactionSchema)]),
  }).safeParse(raw);
  if (!payload.success) throw new ReservationError("PAYMENT_UNAVAILABLE");
  const rows = Array.isArray(payload.data.msg) ? payload.data.msg : [payload.data.msg];
  if (rows.some((row) => row.txnid !== attemptRef || amountInPaise(String(row.amount)) !== amountPaise)) {
    throw new ReservationError("PAYMENT_MISMATCH");
  }
  const capture = rows.find((row) => row.status === "success");
  if (capture) {
    if (!capture.easepayid) throw new ReservationError("PAYMENT_MISMATCH");
    return { status: "SUCCESS", providerPaymentId: capture.easepayid } as const;
  }
  // A single hosted checkout can include several attempts, including a failure followed by success.
  return { status: "PENDING" } as const;
}
