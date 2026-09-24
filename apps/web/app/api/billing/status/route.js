import { auth } from "@/auth";
import { getUserBillingState } from "@/lib/db";
import { getStripe, getSubscriptionPeriodEnd } from "@/lib/stripe";
import { isPremiumActive } from "@/lib/subscription";

export const dynamic = "force-dynamic";

// Learn+ subscription summary for the Settings page. Renewal/cancellation
// details are read live from Stripe (not stored), falling back to the
// webhook-synced columns if Stripe is unreachable.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await getUserBillingState(session.user.id);
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    let status = user.subscriptionStatus ?? null;
    let currentPeriodEnd = user.subscriptionCurrentPeriodEnd ?? null;
    let cancelAt = null;

    if (user.stripeSubscriptionId) {
      try {
        const subscription = await getStripe().subscriptions.retrieve(user.stripeSubscriptionId);
        status = subscription.status;
        currentPeriodEnd = getSubscriptionPeriodEnd(subscription) ?? currentPeriodEnd;
        if (subscription.cancel_at) {
          cancelAt = new Date(subscription.cancel_at * 1000);
        } else if (subscription.cancel_at_period_end) {
          cancelAt = currentPeriodEnd;
        }
      } catch (error) {
        console.error("Billing status: Stripe lookup failed, using stored state:", error.message);
      }
    }

    return Response.json({
      isPremium: isPremiumActive({ subscriptionStatus: status, currentPeriodEnd }),
      status,
      currentPeriodEnd,
      cancelAt,
      hasBillingAccount: Boolean(user.stripeCustomerId),
    });
  } catch (error) {
    console.error("Billing status error:", error);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
