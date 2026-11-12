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

    // Look up the Stripe Price by unit_amount + currency.
    const priceList = await this.stripeService.client.prices.list({
      currency: dto.currency,
      active: true,
      limit: 100,
    });
    const stripePrice = priceList.data.find(
      (p) => p.unit_amount === unitAmount && p.currency === dto.currency,
    );
    if (!stripePrice) {
      throw new BadRequestException(
        `No Stripe price found for currency "${dto.currency}" at amount ${unitAmount}. ` +
          'Create the price in Stripe Dashboard first.',
      );
    }

    // Create the Stripe Checkout Session.
    const session = await this.stripeService.createCheckoutSession({
      customerId: customer.id,
      priceId: stripePrice.id,
      currency: dto.currency,
      successUrl: dto.successUrl,
      cancelUrl: dto.cancelUrl,
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

        if (!customerId) {
          this.logger.warn('checkout.session.completed without customerId');
          return;
        }

        // Find the org by stripeCustomerId.
        const org = await this.prisma.organization.findUnique({
          where: { stripeCustomerId: customerId },
        });
        if (!org) {
          this.logger.warn(`No org found for stripe customer ${customerId}`);
          return;
        }

        // Mark the org's subscription ACTIVE and store stripe ids.
        await this.prisma.$transaction([
          this.prisma.subscription.updateMany({
            where: { organizationId: org.id },
            data: {
              status: SubscriptionStatus.ACTIVE,
              statusReason: null,
              ...(subscriptionId
                ? { stripeSubscriptionId: subscriptionId }
                : {}),
            },
          }),
          this.prisma.organization.update({
            where: { id: org.id },
            data: {
              stripeSubscriptionId: subscriptionId ?? org.stripeSubscriptionId,
            },
          }),
        ]);

        this.logger.log(
          `Organization ${org.id} activated subscription (stripe subscription ${subscriptionId})`,
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
