import { auth } from "@/auth";
import { getAppBaseUrl } from "@/lib/auth-url";
import { claimStripeCustomerId, getUserBillingState } from "@/lib/db";
import { getStripe, sanitizeReturnPath } from "@/lib/stripe";
import { isPremiumActive } from "@/lib/subscription";

export const dynamic = "force-dynamic";

// Starts a Stripe Checkout for the single subscription price. The client
// redirects to the returned `url` — no Stripe.js needed.
export async function POST(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) {
    console.error("Checkout error: STRIPE_PRICE_ID is not configured.");
    return Response.json({ error: "Billing is not configured." }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));

  try {
    const userId = session.user.id;
    const user = await getUserBillingState(userId);
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (
      isPremiumActive({
        subscriptionStatus: user.subscriptionStatus,
        currentPeriodEnd: user.subscriptionCurrentPeriodEnd,
      })
    ) {
      return Response.json({ error: "You're already subscribed." }, { status: 409 });
    }

    const stripe = getStripe();
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create(
        { email: user.email, metadata: { userId } },
        // Double-clicks / concurrent requests reuse one Stripe customer.
        { idempotencyKey: `worldly-customer-${userId}` }
      );
      customerId = await claimStripeCustomerId(userId, customer.id);
    }

    const baseUrl = getAppBaseUrl(request);
    const returnPath = sanitizeReturnPath(body?.returnPath);
    const joiner = returnPath.includes("?") ? "&" : "?";

    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: userId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: { metadata: { userId } },
      success_url: `${baseUrl}${returnPath}${joiner}billing=success`,
      cancel_url: `${baseUrl}${returnPath}${joiner}billing=cancel`,
    });

    return Response.json({ url: checkout.url });
  } catch (error) {
    console.error("Checkout error:", error);
    return Response.json({ error: "Could not start checkout." }, { status: 500 });
  }
}
