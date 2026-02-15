import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
    constructor() {
        const adapter = new PrismaPg(new Pool({
            connectionString: process.env.DATABASE_URL || 'postgresql://username:password@localhost:5432/tuhame',
        }));

        super({
            adapter,
        });
    }

    async onModuleInit() {
        await this.$connect();
    }

    async onModuleDestroy() {
        await this.$disconnect();
    }

    async enableShutdownHooks(app: any) {
        // Handle graceful shutdown
        process.on('beforeExit', async () => {
            await app.close();
        });
    }
}
