// ─────────────────────────────────────────────────────────────────────────────
// services/stripe.service.ts
// Stripe Integration with Mock Mode Fallback
// ─────────────────────────────────────────────────────────────────────────────

import Stripe from "stripe";
import { logger } from "@/lib/logger";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const MOCK_MODE = process.env.STRIPE_MOCK_MODE === "true" || !STRIPE_SECRET_KEY;

// Only initialize the real Stripe client if we have a key
const stripeClient = MOCK_MODE
  ? null
  : new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: "2023-10-16" as any,
    });

export interface CheckoutProduct {
  name: string;
  price: number;
  description?: string;
  id: string; // Internal product/candidate ID
}

export class StripeService {
  /**
   * Creates a Stripe Checkout Session or returns a Mock URL.
   */
  static async createCheckoutSession(
    product: CheckoutProduct,
    successUrl: string,
    cancelUrl: string
  ): Promise<{ url: string; sessionId: string }> {
    if (MOCK_MODE) {
      logger.info("StripeService", "Running in MOCK mode. Generating simulated checkout session.");
      const mockSessionId = `mock_sess_${Date.now()}_${product.id}`;
      // In mock mode, we just immediately redirect the user to the success URL
      return {
        url: `${successUrl}?session_id=${mockSessionId}&mock_success=true`,
        sessionId: mockSessionId,
      };
    }

    if (!stripeClient) {
      throw new Error("Stripe client is not initialized.");
    }

    logger.info("StripeService", "Creating real Stripe checkout session", { productId: product.id });

    const session = await stripeClient.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: product.name,
              description: product.description || "OTTO Recommended Purchase",
            },
            unit_amount: Math.round(product.price * 100), // Stripe expects cents
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
      metadata: {
        candidateId: product.id,
        source: "otto_decision_engine",
      },
    });

    if (!session.url) {
      throw new Error("Stripe did not return a checkout URL.");
    }

    return {
      url: session.url,
      sessionId: session.id,
    };
  }

  /**
   * Constructs the webhook event (Mock or Real).
   */
  static constructWebhookEvent(payload: string | Buffer, signature: string, webhookSecret: string): Stripe.Event {
    if (MOCK_MODE) {
      logger.info("StripeService", "Mock Mode: Parsing webhook payload directly without signature verification.");
      return JSON.parse(payload.toString()) as Stripe.Event;
    }

    if (!stripeClient) {
      throw new Error("Stripe client is not initialized.");
    }

    return stripeClient.webhooks.constructEvent(payload, signature, webhookSecret);
  }
}
