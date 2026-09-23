import { auth } from "@/auth";
import { getAppBaseUrl } from "@/lib/auth-url";
import { getUserBillingState } from "@/lib/db";
import { getStripe, sanitizeReturnPath } from "@/lib/stripe";

export const dynamic = "force-dynamic";

// Opens the Stripe Billing Portal (cancel / update card) for the signed-in user.
export async function POST(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));

  try {
    const user = await getUserBillingState(session.user.id);
    if (!user?.stripeCustomerId) {
      return Response.json({ error: "No subscription to manage." }, { status: 404 });
    }

    const portal = await getStripe().billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${getAppBaseUrl(request)}${sanitizeReturnPath(body?.returnPath)}`,
    });

    return Response.json({ url: portal.url });
  } catch (error) {
    console.error("Billing portal error:", error);
    return Response.json({ error: "Could not open billing portal." }, { status: 500 });
  }
}
