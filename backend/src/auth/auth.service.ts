import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);

    constructor(
        private usersService: UsersService,
        private jwtService: JwtService,
    ) { }

    async validateUser(email: string, pass: string): Promise<any> {
        const user = await this.usersService.findOneByEmail(email);
        if (user && (await bcrypt.compare(pass, user.passwordHash))) {
            const { passwordHash, ...result } = user;
            return result;
        }
        return null;
    }

    async login(user: any) {
        const payload = { 
            email: user.email, 
            sub: user.id, 
            role: user.role,
            organizationId: user.organizationId 
        };
        this.logger.log('Login payload: ' + JSON.stringify(payload));
        const token = this.jwtService.sign(payload);
        this.logger.log('Generated token (first 50 chars): ' + token.substring(0, 50) + '...');
        return {
            access_token: token,
            user,
        };
    }

    async register(data: Prisma.UserCreateInput) {
        const salt = await bcrypt.genSalt();
        const hashedPassword = await bcrypt.hash(data.passwordHash, salt);

        // Create use with hashed password
        const newUser = await this.usersService.create({
            ...data,
            passwordHash: hashedPassword,
        });

        // Return token immediately after registration
        return this.login(newUser);
    }
}
