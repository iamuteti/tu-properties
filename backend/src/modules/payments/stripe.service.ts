import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

/**
 * Thin wrapper around the Stripe SDK.
 *
 * Initialized lazily on module init so the secret key is read from env at
 * runtime rather than at import time.
 */
@Injectable()
export class StripeService implements OnModuleInit {
  private readonly logger = new Logger(StripeService.name);
  private stripe: Stripe | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (!secretKey || secretKey.startsWith('sk_test_YOUR_STRIPE_SECRET_KEY')) {
      this.logger.warn(
        'STRIPE_SECRET_KEY is not configured. Payment endpoints will fail until a real key is set.',
      );
      return;
    }
    this.stripe = new Stripe(secretKey, {
      apiVersion: '2026-10-28.endive',
    });
    this.logger.log('Stripe client initialized');
  }

  /** Throws if the Stripe client has not been initialized. */
  private assertInitialized(): Stripe {
    if (!this.stripe) {
      throw new Error(
        'Stripe client is not initialized. Set STRIPE_SECRET_KEY.',
      );
    }
    return this.stripe;
  }

  /** Create or retrieve a Stripe Customer for the organization. */
  async createOrRetrieveCustomer({
    organizationId,
    name,
    email,
  }: {
    organizationId: string;
    name: string;
    email?: string | null;
  }) {
    const stripe = this.assertInitialized();

    // First, try to find an existing customer by organizationId metadata.
    const existing = await stripe.customers.list({
      limit: 1,
    });
    const match = existing.data.find(
      (c) => c.metadata?.organizationId === organizationId,
    );

    if (match) {
      return match;
    }

    return stripe.customers.create({
      metadata: { organizationId },
      name,
      email: email || undefined,
    });
  }

  /** Create a Checkout Session in `subscription` mode. */
  async createCheckoutSession({
    customerId,
    priceId,
    currency,
    successUrl,
    cancelUrl,
    metadata,
    clientReferenceId,
  }: {
    customerId: string;
    priceId: string;
    currency: string;
    successUrl?: string;
    cancelUrl?: string;
    metadata?: Record<string, string>;
    clientReferenceId?: string;
  }) {
    const stripe = this.assertInitialized();

    return stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      currency,
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: clientReferenceId,
      metadata: metadata ?? {},
    });
  }

  /** Create a customer portal session for managing subscription. */
  async createPortalSession({
    customerId,
    returnUrl,
  }: {
    customerId: string;
    returnUrl: string;
  }) {
    const stripe = this.assertInitialized();

    return stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
  }

  /** Construct a Stripe event from a raw body + signature header, verifying it. */
  constructEvent(payload: Buffer | string, signature: string) {
    const stripe = this.assertInitialized();
    const webhookSecret = this.configService.get<string>(
      'STRIPE_WEBHOOK_SECRET',
    );
    if (
      !webhookSecret ||
      webhookSecret.startsWith('whsec_YOUR_STRIPE_WEBHOOK_SECRET')
    ) {
      throw new Error('STRIPE_WEBHOOK_SECRET is not configured.');
    }
    return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  }

  get client(): Stripe {
    return this.assertInitialized();
  }
}
