import { syncUserSubscription } from "@/lib/db";
import { getStripe, getSubscriptionPeriodEnd } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUBSCRIPTION_EVENTS = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

function idOf(value) {
  return typeof value === "string" ? value : value?.id ?? null;
}

/**
 * Re-reads the subscription from Stripe and writes its current state. Using
 * live state (not the event payload) makes duplicate and out-of-order
 * deliveries harmless: every replay converges on the same row values.
 */
async function syncSubscription(stripe, subscriptionId, { userId = null, deleted = false } = {}) {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await syncUserSubscription({
    customerId: idOf(subscription.customer),
    userId: userId ?? subscription.metadata?.userId ?? null,
    subscriptionId: subscription.id,
    status: deleted ? "canceled" : subscription.status,
    currentPeriodEnd: getSubscriptionPeriodEnd(subscription),
  });
}

// Stripe calls this directly — no session auth; the signature is the auth.
export async function POST(request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !signature) {
    return Response.json({ error: "Missing signature." }, { status: 400 });
  }

  // Raw body: the signature is computed over the exact bytes Stripe sent.
  const payload = await request.text();

  let stripe;
  let event;
  try {
    stripe = getStripe();
    event = stripe.webhooks.constructEvent(payload, signature, secret);
  } catch (error) {
    console.error("Stripe webhook signature verification failed:", error.message);
    return Response.json({ error: "Invalid signature." }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const checkout = event.data.object;
      const subscriptionId = idOf(checkout.subscription);
      if (checkout.mode === "subscription" && subscriptionId) {
        await syncSubscription(stripe, subscriptionId, {
          userId: checkout.client_reference_id ?? null,
        });
      }
    } else if (SUBSCRIPTION_EVENTS.has(event.type)) {
      await syncSubscription(stripe, event.data.object.id, {
        deleted: event.type === "customer.subscription.deleted",
      });
    }
    return Response.json({ received: true });
  } catch (error) {
    // 500 so Stripe retries later; the sync is idempotent.
    console.error(`Stripe webhook ${event.type} (${event.id}) failed:`, error);
    return Response.json({ error: "Webhook handler failed." }, { status: 500 });
  }
}
