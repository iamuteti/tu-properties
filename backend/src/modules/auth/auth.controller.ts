import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Request,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { PublicGuard } from '@/common/guards/public.guard';
import { Public } from '@/common/decorators/public.decorator';
import { Response } from 'express';

@Controller('auth')
@UseGuards(PublicGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Public()
  async login(@Body() req, @Request() request) {
    const validUser = await this.authService.validateUser(
      req.email,
      req.password,
    );
    if (!validUser) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.authService.login(validUser, request.res as Response);
  }

  @Post('register')
  @Public()
  async register(@Body() userData: Prisma.UserCreateInput, @Request() request) {
    return this.authService.register(
      userData,
      request.res as Response,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  async getProfile(@Request() req) {
    return this.authService.getProfile(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout(@Request() request) {
    return this.authService.logout(request.res as Response);
  }

  @Post('forgot-password')
  @Public()
  async forgotPassword(@Body() body: { email: string }) {
    return this.authService.forgotPassword(body.email);
  }

  @Post('reset-password')
  @Public()
  async resetPassword(@Body() body: { token: string; newPassword: string }) {
    return this.authService.resetPassword(body.token, body.newPassword);
  }
}
