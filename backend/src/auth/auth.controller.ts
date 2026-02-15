import { Controller, Post, Body, UseGuards, Get, Request } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Prisma } from '@/prisma/generated/prisma';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Post('login')
    async login(@Body() req) {
        const validUser = await this.authService.validateUser(req.email, req.password);
        if (!validUser) {
            return { message: 'Invalid credentials' };
        }
        return this.authService.login(validUser);
    }

    @Post('register')
    async register(@Body() userData: Prisma.UserCreateInput) {
        return this.authService.register(userData);
    }

    @UseGuards(JwtAuthGuard)
    @Get('profile')
    getProfile(@Request() req) {
        return req.user;
    }
}
