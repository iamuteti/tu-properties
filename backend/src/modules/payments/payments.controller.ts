import {
  Controller,
  Post,
  Body,
  Request,
  Headers,
  HttpCode,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import Stripe from 'stripe';
import { Public } from '@/common/decorators/public.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { PaymentsService } from './payments.service';
import { StripeService } from './stripe.service';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';

/**
 * Payments controller — checkout endpoints and the Stripe webhook.
 *
 * - `POST /payments/checkout` — authenticated (ADMIN or SUPER_ADMIN). Creates a
 *   Stripe Checkout Session for subscribing an organization to a plan. A tenant
 *   ADMIN subscribes their own org; a SUPER_ADMIN supplies `organizationId`.
 * - `POST /payments/webhooks/stripe` — public, no auth. Stripe posts events
 *   here; the signature is verified using the raw request body.
 */
@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly stripe: StripeService,
  ) {}

  /**
   * Create a Stripe Checkout Session for subscribing an org to a plan.
   *
   * Body: { planId, currency, organizationId?, successUrl?, cancelUrl? }
   */
  @Post('checkout')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async createCheckout(
    @Body() dto: CreateCheckoutSessionDto,
    @Request() req: Express.Request,
  ) {
    const user = req.user as
      | { id?: string; organizationId?: string; role?: string }
      | undefined;

    // A tenant admin subscribes their own org; a SUPER_ADMIN names the org.
    const orgId = user?.organizationId || dto.organizationId;
    if (!orgId) {
      throw new UnauthorizedException(
        'No organization context: sign in as a tenant admin, or supply organizationId as SUPER_ADMIN.',
      );
    }

    // A non-super-admin may only check out their own organization.
    if (
      user?.role !== UserRole.SUPER_ADMIN &&
      dto.organizationId &&
      dto.organizationId !== user?.organizationId
    ) {
      throw new ForbiddenException(
        'You can only start checkout for your own organization.',
      );
    }

    return this.paymentsService.createCheckoutSession(orgId, dto);
  }

  /**
   * Stripe webhook — no auth, signature verified inside the service.
   *
   * The raw bytes come from Nest's own parser (`rawBody: true` in `main.ts`):
   * `req.body` stays a parsed object and the untouched payload is copied to
   * `req.rawBody`. Signature verification fails on a re-serialized body, so
   * that buffer is the only trustworthy input here.
   */
  @Post('webhooks/stripe')
  @Public()
  @HttpCode(200)
  async handleWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: RawBodyRequest<Express.Request>,
  ) {
    if (!signature) {
      throw new BadRequestException('Missing Stripe-Signature header');
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
      // `rawBody: true` is set on NestFactory.create, so this means the parser
      // middleware is gone or was replaced by a raw parser. Server fault, and
      // the operator needs to know, hence 500 + log rather than a silent 401.
      this.logger.error(
        'Stripe webhook arrived without req.rawBody — check the rawBody option on NestFactory.create',
      );
      throw new InternalServerErrorException('Webhook body unavailable');
    }

    let event: Stripe.Event;
    try {
      event = this.stripe.constructEvent(rawBody, signature);
    } catch (err) {
      // A bad signature is a 4xx: Stripe retries 5xx deliveries, and a forged
      // or stale payload will never verify however many times it is resent.
      if (err instanceof Stripe.errors.StripeSignatureVerificationError) {
        this.logger.warn(`Rejected Stripe webhook: ${err.message}`);
        throw new BadRequestException('Webhook signature verification failed');
      }
      throw err;
    }

    await this.paymentsService.handleWebhookEvent(event);
    return { received: true };
  }
}
