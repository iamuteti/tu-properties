import {
  Controller,
  Post,
  Body,
  Request,
  Headers,
  HttpCode,
  UnauthorizedException,
  Req,
} from '@nestjs/common';
import { Public } from '@/common/decorators/public.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { PlatformService } from '@/modules/platform/platform.service';
import { PaymentsService } from './payments.service';
import { StripeService } from './stripe.service';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';

/**
 * Payments controller — public checkout endpoints and Stripe webhook.
 *
 * - `POST /payments/checkout` — authenticated, SUPER_ADMIN only. Creates a
 *   Stripe Checkout Session for subscribing an organization to a plan.
 * - `POST /webhooks/stripe` — public, no auth. Stripe posts events here;
 *   signature is verified inside the service using the raw request body.
 */
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly stripe: StripeService,
    private readonly platformService: PlatformService,
  ) {}

  /**
   * Create a Stripe Checkout Session for subscribing an org to a plan.
   *
   * Body: { planId, currency, successUrl?, cancelUrl? }
   */
  @Post('checkout')
  @Roles(UserRole.SUPER_ADMIN)
  async createCheckout(
    @Body() dto: CreateCheckoutSessionDto,
    @Request() req: Express.Request,
  ) {
    const user = req.user as
      | { id?: string; organizationId?: string }
      | undefined;
    const orgId = user?.organizationId || user?.id;
    if (!orgId) {
      throw new UnauthorizedException('No organization context');
    }
    return this.paymentsService.createCheckoutSession(orgId, dto);
  }

  /**
   * Stripe webhook — no auth, signature verified inside the service.
   *
   * Uses the raw request body (available as req.rawBody via the global
   * express.raw() middleware in main.ts) for signature verification.
   */
  @Post('webhooks/stripe')
  @Public()
  @HttpCode(200)
  async handleWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: Request & { rawBody?: Buffer },
  ) {
    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new UnauthorizedException(
        'Missing raw body for signature verification',
      );
    }

    const event = this.stripe.constructEvent(rawBody, signature);
    await this.paymentsService.handleWebhookEvent(event);
    return { received: true };
  }
}
