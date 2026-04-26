import crypto from "crypto";

const SQUARE_BASE = process.env.SQUARE_ENVIRONMENT === "production"
  ? "https://connect.squareup.com"
  : "https://connect.squareupsandbox.com";

const SQUARE_JS =
  process.env.SQUARE_ENVIRONMENT === "production"
    ? "https://web.squarecdn.com/v1/square.js"
    : "https://sandbox.web.squarecdn.com/v1/square.js";

export function isSquareConfigured(): boolean {
  return !!process.env.SQUARE_ACCESS_TOKEN;
}

function squareHeaders() {
  return {
    Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN!}`,
    "Content-Type": "application/json",
    "Square-Version": "2025-04-16",
  };
}

let cachedLocationId: string | null = null;

async function getLocationId(): Promise<string> {
  if (cachedLocationId) return cachedLocationId;
  const res = await fetch(`${SQUARE_BASE}/v2/locations`, { headers: squareHeaders() });
  const data = (await res.json()) as any;
  const loc = data.locations?.[0];
  if (!loc) throw new Error("No Square locations found. Check your SQUARE_ACCESS_TOKEN.");
  cachedLocationId = loc.id as string;
  return cachedLocationId!;
}

// ── Public config for Web Payments SDK ───────────────────────────────────────
export async function getSquareAppConfig() {
  const locationId = await getLocationId();
  return {
    applicationId: process.env.SQUARE_APPLICATION_ID ?? "",
    locationId,
    scriptSrc: SQUARE_JS,
  };
}

// ── Payment Links (hosted checkout) ──────────────────────────────────────────
export async function createSquarePaymentLink({
  amountDollars,
  name,
  invoiceId,
  successUrl,
}: {
  amountDollars: number;
  name: string;
  invoiceId: number;
  successUrl: string;
}): Promise<string> {
  if (!process.env.SQUARE_ACCESS_TOKEN) throw new Error("SQUARE_ACCESS_TOKEN is not configured");
  const locationId = await getLocationId();

  const res = await fetch(`${SQUARE_BASE}/v2/online-checkout/payment-links`, {
    method: "POST",
    headers: squareHeaders(),
    body: JSON.stringify({
      idempotency_key: `inv-${invoiceId}-${Date.now()}`,
      quick_pay: {
        name,
        price_money: { amount: Math.round(amountDollars * 100), currency: "USD" },
        location_id: locationId,
      },
      checkout_options: {
        redirect_url: successUrl,
        accepted_payment_methods: {
          card: true,
          bank_account: true,
          cash_app_pay: false,
          buy_now_pay_later: false,
        },
      },
    }),
  });

  const data = (await res.json()) as any;
  if (!res.ok) throw new Error(data.errors?.[0]?.detail ?? "Square API error");
  return data.payment_link.url as string;
}

// ── Customers API ─────────────────────────────────────────────────────────────
export async function createOrGetSquareCustomer(
  clientId: number,
  name: string,
  email: string
): Promise<string> {
  // Search by email first
  const searchRes = await fetch(`${SQUARE_BASE}/v2/customers/search`, {
    method: "POST",
    headers: squareHeaders(),
    body: JSON.stringify({
      query: { filter: { email_address: { exact: email } } },
    }),
  });
  const searchData = (await searchRes.json()) as any;
  if (searchData.customers?.length > 0) {
    return searchData.customers[0].id as string;
  }

  // Create new customer
  const createRes = await fetch(`${SQUARE_BASE}/v2/customers`, {
    method: "POST",
    headers: squareHeaders(),
    body: JSON.stringify({
      idempotency_key: `client-${clientId}-${Date.now()}`,
      given_name: name.split(" ")[0] ?? name,
      family_name: name.split(" ").slice(1).join(" ") || undefined,
      email_address: email,
      reference_id: String(clientId),
    }),
  });
  const createData = (await createRes.json()) as any;
  if (!createRes.ok) throw new Error(createData.errors?.[0]?.detail ?? "Failed to create Square customer");
  return createData.customer.id as string;
}

// ── Cards API (card-on-file) ──────────────────────────────────────────────────
export async function saveCardOnFile(customerId: string, nonce: string): Promise<string> {
  const res = await fetch(`${SQUARE_BASE}/v2/cards`, {
    method: "POST",
    headers: squareHeaders(),
    body: JSON.stringify({
      idempotency_key: crypto.randomBytes(16).toString("hex"),
      source_id: nonce,
      card: { customer_id: customerId },
    }),
  });
  const data = (await res.json()) as any;
  if (!res.ok) throw new Error(data.errors?.[0]?.detail ?? "Failed to save card on file");
  return data.card.id as string;
}

// ── Payments API — charge a nonce (one-time) ──────────────────────────────────
export async function processNoncePayment({
  nonce,
  amountCents,
  note,
  idempotencyKey,
}: {
  nonce: string;
  amountCents: number;
  note: string;
  idempotencyKey: string;
}): Promise<{ paymentId: string; receiptUrl: string | null }> {
  const locationId = await getLocationId();
  const res = await fetch(`${SQUARE_BASE}/v2/payments`, {
    method: "POST",
    headers: squareHeaders(),
    body: JSON.stringify({
      idempotency_key: idempotencyKey,
      source_id: nonce,
      amount_money: { amount: amountCents, currency: "USD" },
      location_id: locationId,
      note,
    }),
  });
  const data = (await res.json()) as any;
  if (!res.ok) throw new Error(data.errors?.[0]?.detail ?? "Payment failed");
  return {
    paymentId: data.payment.id,
    receiptUrl: data.payment.receipt_url ?? null,
  };
}

// ── Payments API — charge card on file ───────────────────────────────────────
export async function chargeCardOnFile({
  customerId,
  cardId,
  amountCents,
  note,
  idempotencyKey,
}: {
  customerId: string;
  cardId: string;
  amountCents: number;
  note: string;
  idempotencyKey: string;
}): Promise<{ paymentId: string; receiptUrl: string | null }> {
  const locationId = await getLocationId();
  const res = await fetch(`${SQUARE_BASE}/v2/payments`, {
    method: "POST",
    headers: squareHeaders(),
    body: JSON.stringify({
      idempotency_key: idempotencyKey,
      source_id: cardId,
      customer_id: customerId,
      amount_money: { amount: amountCents, currency: "USD" },
      location_id: locationId,
      note,
    }),
  });
  const data = (await res.json()) as any;
  if (!res.ok) throw new Error(data.errors?.[0]?.detail ?? "Autopay charge failed");
  return {
    paymentId: data.payment.id,
    receiptUrl: data.payment.receipt_url ?? null,
  };
}
