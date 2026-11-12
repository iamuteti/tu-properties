import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import Stripe from 'stripe';
import { PrismaService } from '@/prisma/prisma.service';
import { StripeService } from './stripe.service';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';
import { SubscriptionStatus } from '@prisma/client';

/**
 * Payments service — bridges Stripe Checkout with the platform's subscription
 * model.
 *
 * Flow:
 * 1. Organization selects a plan + currency → `createCheckoutSession()`
 * 2. Customer pays on Stripe → Stripe fires `checkout.session.completed`
 * 3. Webhook handler marks the organization's subscription `ACTIVE` and
 *    records the plan/stripe ids.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
  ) {}

  /** Create a Stripe Checkout Session for subscribing to a plan. */
  async createCheckoutSession(
    organizationId: string,
    dto: CreateCheckoutSessionDto,
  ) {
    // Look up the organization to get its name/email and any existing stripe customer id.
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        contactEmail: true,
        stripeCustomerId: true,
      },
    });
    if (!org) {
      throw new NotFoundException(`Organization ${organizationId} not found`);
    }

    // Look up the plan record to get its price for the selected currency.
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: dto.planId },
    });
    if (!plan) {
      throw new NotFoundException(`Plan ${dto.planId} not found`);
    }

    const prices = plan.prices as Record<string, number> | null;
    const unitAmount = prices?.[dto.currency];
    if (unitAmount === undefined || unitAmount === null) {
      throw new BadRequestException(
        `Plan "${plan.name}" has no price for currency "${dto.currency}".`,
      );
    }

    // Ensure we have a Stripe Customer for this org.
    const customer = await this.stripeService.createOrRetrieveCustomer({
      organizationId: org.id,
      name: org.name,
      email: org.contactEmail ?? null,
    });

    // If the org already has a stripeCustomerId recorded but it differs from
    // the Stripe customer we just found/created, update it.
    if (!org.stripeCustomerId || org.stripeCustomerId !== customer.id) {
      await this.prisma.organization.update({
        where: { id: org.id },
        data: { stripeCustomerId: customer.id },
      });
    }

    // Resolve the Stripe Price ID:
    // 1. Prefer the ID stored on the plan (option A) — keyed by currency code.
    // 2. Fall back to matching by amount + interval for plans not yet configured.
    const stripePrices = (plan.stripePrices ?? {}) as Record<string, string>;
    let priceId: string | undefined = stripePrices[dto.currency];

    if (!priceId) {
      // The plan stores prices in MAJOR units (e.g. 49 USD); Stripe's
      // `unit_amount` is in MINOR units (4900 cents). Convert before matching.
      const zeroDecimal = new Set([
        'BIF',
        'CLP',
        'DJF',
        'GNF',
        'JPY',
        'KMF',
        'KRW',
        'MGA',
        'PYG',
        'RWF',
        'UGX',
        'VND',
        'VUV',
        'XAF',
        'XOF',
        'XPF',
      ]);
      const factor = zeroDecimal.has(dto.currency.toUpperCase()) ? 1 : 100;
      const expectedMinor = Math.round(unitAmount * factor);

      const priceList = await this.stripeService.client.prices.list({
        currency: dto.currency.toLowerCase(),
        active: true,
        limit: 100,
      });
      const match = priceList.data.find(
        (p) =>
          p.unit_amount === expectedMinor &&
          p.currency === dto.currency.toLowerCase() &&
          (!plan.interval || p.recurring?.interval === plan.interval),
      );
      priceId = match?.id;
    }

    if (!priceId) {
      throw new BadRequestException(
        `No Stripe price configured for plan "${plan.name}" in ${dto.currency}. ` +
          'Set the Stripe Price ID on the plan (Plans → edit) or create a matching price in Stripe.',
      );
    }

    // Create the Stripe Checkout Session, tagging it with the org + plan so the
    // webhook can upgrade the right subscription to the right plan.
    const session = await this.stripeService.createCheckoutSession({
      customerId: customer.id,
      priceId,
      currency: dto.currency,
      successUrl: dto.successUrl,
      cancelUrl: dto.cancelUrl,
      clientReferenceId: org.id,
      metadata: {
        organizationId: org.id,
        planId: plan.id,
      },
    });

    return { url: session.url, sessionId: session.id };
  }

  /** Handle a Stripe webhook event. */
  async handleWebhookEvent(event: Stripe.Event) {
    switch (event.type) {
      case 'checkout.session.completed': {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId =
          typeof session.customer === 'string' ? session.customer : null;
        const subscriptionId =
          typeof session.subscription === 'string'
            ? session.subscription
            : null;
        const metaOrgId = session.metadata?.organizationId ?? null;
        const metaPlanId = session.metadata?.planId ?? null;
        const clientRefOrgId =
          typeof session.client_reference_id === 'string'
            ? session.client_reference_id
            : null;

        // Find the org by stripeCustomerId first, then by the metadata /
        // client_reference_id we attached when creating the session.
        let org = customerId
          ? await this.prisma.organization.findUnique({
              where: { stripeCustomerId: customerId },
            })
          : null;
        if (!org && metaOrgId) {
          org = await this.prisma.organization.findUnique({
            where: { id: metaOrgId },
          });
        }
        if (!org && clientRefOrgId) {
          org = await this.prisma.organization.findUnique({
            where: { id: clientRefOrgId },
          });
        }
        if (!org) {
          this.logger.warn(
            `checkout.session.completed: no org for customer ${customerId}, metaOrg ${metaOrgId}, clientRef ${clientRefOrgId}`,
          );
          return;
        }

        // Resolve the purchased plan (if the session carried one) so the org's
        // plan is upgraded, not just marked ACTIVE.
        let planName: string | null = null;
        if (metaPlanId) {
          const plan = await this.prisma.subscriptionPlan.findUnique({
            where: { id: metaPlanId },
            select: { name: true },
          });
          planName = plan?.name ?? null;
        }

        // Mark the org's subscription ACTIVE, store stripe ids, and apply the
        // purchased plan.
        await this.prisma.$transaction([
          this.prisma.subscription.updateMany({
            where: { organizationId: org.id },
            data: {
              status: SubscriptionStatus.ACTIVE,
              statusReason: null,
              ...(subscriptionId
                ? { stripeSubscriptionId: subscriptionId }
                : {}),
              ...(planName ? { plan: planName } : {}),
              ...(metaPlanId ? { planId: metaPlanId } : {}),
            },
          }),
          this.prisma.organization.update({
            where: { id: org.id },
            data: {
              stripeSubscriptionId: subscriptionId ?? org.stripeSubscriptionId,
              ...(planName ? { plan: planName } : {}),
            },
          }),
        ]);

        this.logger.log(
          `Organization ${org.id} activated subscription (stripe subscription ${subscriptionId}, plan ${planName ?? 'unchanged'})`,
        );
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice & {
          subscription?: string | null;
        };
        const subscriptionId = invoice.subscription ?? null;
        const customerId = invoice.customer as string;

        const org = await this.prisma.organization.findFirst({
          where: {
            OR: [
              { stripeCustomerId: customerId },
              { stripeSubscriptionId: subscriptionId },
            ],
          },
        });
        if (!org) {
          this.logger.warn(
            `No org found for invoice payment (customer ${customerId}, subscription ${subscriptionId})`,
          );
          return;
        }

        await this.prisma.subscription.updateMany({
          where: { organizationId: org.id },
          data: { status: SubscriptionStatus.ACTIVE, statusReason: null },
        });
        break;
      }

      case 'invoice.payment_failed': {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        const invoice = event.data.object as Stripe.Invoice;
        const customerId =
          typeof invoice.customer === 'string' ? invoice.customer : null;

        if (!customerId) {
          this.logger.warn('invoice.payment_failed without customerId');
          return;
        }

        const org = await this.prisma.organization.findUnique({
          where: { stripeCustomerId: customerId },
        });
        if (!org) {
          this.logger.warn(
            `No org found for failed invoice (customer ${customerId})`,
          );
          return;
        }

        await this.prisma.subscription.updateMany({
          where: { organizationId: org.id },
          data: {
            status: SubscriptionStatus.SUSPENDED,
            statusReason: 'Payment failed',
          },
        });
        break;
      }

      case 'customer.subscription.updated': {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        const subscription = event.data.object as Stripe.Subscription;
        const customerId =
          typeof subscription.customer === 'string'
            ? subscription.customer
            : null;

        if (!customerId) {
          this.logger.warn('customer.subscription.updated without customerId');
          return;
        }

        const org = await this.prisma.organization.findUnique({
          where: { stripeCustomerId: customerId },
        });
        if (!org) {
          this.logger.warn(
            `No org found for subscription update (customer ${customerId})`,
          );
          return;
        }

        const statusMap: Record<string, SubscriptionStatus> = {
          active: SubscriptionStatus.ACTIVE,
          past_due: SubscriptionStatus.SUSPENDED,
          canceled: SubscriptionStatus.CANCELLED,
          unpaid: SubscriptionStatus.SUSPENDED,
        };
        const newStatus =
          statusMap[subscription.status] || SubscriptionStatus.ACTIVE;

        await this.prisma.subscription.updateMany({
          where: { organizationId: org.id },
          data: { status: newStatus },
        });
        break;
      }

      default:
        // Ignore unhandled event types.
        break;
    }
  }
}
