import { Controller, Post, Body, UseGuards, Get, Request, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { PublicGuard } from '@/common/guards/public.guard';
import { Public } from '@/common/decorators/public.decorator';

@Controller('auth')
@UseGuards(PublicGuard)
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Post('login')
    @Public()
    async login(@Body() req) {
        const validUser = await this.authService.validateUser(req.email, req.password);
        if (!validUser) {
            throw new UnauthorizedException('Invalid credentials');
        }
        return this.authService.login(validUser);
    }

    @Post('register')
    @Public()
    async register(@Body() userData: Prisma.UserCreateInput) {
        return this.authService.register(userData);
    }

    @UseGuards(JwtAuthGuard)
    @Get('profile')
    getProfile(@Request() req) {
        return req.user;
    }
}
