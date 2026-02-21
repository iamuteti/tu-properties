import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    private readonly logger = new Logger(JwtStrategy.name);
    private readonly secretKey: string;

    constructor(
        private configService: ConfigService,
        private usersService: UsersService,
    ) {
        const secret = configService.get<string>('JWT_SECRET') || 'superSecretKey';
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: secret,
        });
        this.secretKey = secret;
    }

    async validate(payload: any) {
        if (!payload.sub) {
            this.logger.error('Invalid token payload: missing sub');
            throw new UnauthorizedException('Invalid token payload');
        }
        
        try {
            const user = await this.usersService.findOne(payload.sub);
            if (!user) {
                this.logger.error('User not found for id: ' + payload.sub);
                throw new UnauthorizedException();
            }
            return { 
                userId: payload.sub, 
                email: payload.email, 
                role: payload.role,
                organizationId: payload.organizationId || user.organizationId
            };
        } catch (error: any) {
            this.logger.error('Error validating user: ' + (error?.message || 'Unknown error'));
            throw new UnauthorizedException('User validation failed');
        }
    }
}
