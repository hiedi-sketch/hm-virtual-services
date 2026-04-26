const SQUARE_BASE = process.env.SQUARE_ENVIRONMENT === "production"
  ? "https://connect.squareup.com"
  : "https://connect.squareupsandbox.com";

export function isSquareConfigured(): boolean {
  return !!process.env.SQUARE_ACCESS_TOKEN;
}

let cachedLocationId: string | null = null;

async function getLocationId(): Promise<string> {
  if (cachedLocationId) return cachedLocationId;
  const token = process.env.SQUARE_ACCESS_TOKEN!;
  const res = await fetch(`${SQUARE_BASE}/v2/locations`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Square-Version": "2025-04-16",
      "Content-Type": "application/json",
    },
  });
  const data = (await res.json()) as any;
  const loc = data.locations?.[0];
  if (!loc) throw new Error("No Square locations found. Check your SQUARE_ACCESS_TOKEN.");
  cachedLocationId = loc.id as string;
  return cachedLocationId!;
}

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
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) throw new Error("SQUARE_ACCESS_TOKEN is not configured");

  const locationId = await getLocationId();

  const res = await fetch(`${SQUARE_BASE}/v2/online-checkout/payment-links`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Square-Version": "2025-04-16",
    },
    body: JSON.stringify({
      idempotency_key: `inv-${invoiceId}-${Date.now()}`,
      quick_pay: {
        name,
        price_money: {
          amount: Math.round(amountDollars * 100),
          currency: "USD",
        },
        location_id: locationId,
      },
      checkout_options: {
        redirect_url: successUrl,
      },
    }),
  });

  const data = (await res.json()) as any;
  if (!res.ok) {
    const detail = data.errors?.[0]?.detail ?? "Square API error";
    throw new Error(detail);
  }
  return data.payment_link.url as string;
}
