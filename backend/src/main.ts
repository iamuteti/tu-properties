import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { CorsAllowlistService } from './security/cors.service';

dotenv.config();

// Global variable to store ngrok URL
declare global {
  var ngrokUrl: string | undefined;
}

async function bootstrap() {
  const port = process.env.PORT || 3003;

  // Ensure uploads directory exists
  const uploadsDir = path.join(process.cwd(), 'uploads');
  try {
    await fs.mkdir(uploadsDir, { recursive: true });
    console.log(`Uploads directory is ready at: ${uploadsDir}`);
  } catch (err) {
    console.error('Failed to create uploads directory:', err);
  }

  const app = await NestFactory.create(AppModule);

  // Restrict CORS to an explicit, environment-driven allowlist.
  // Never use a wildcard '*' outside of local development.
  const cors = app.get(CorsAllowlistService);
  app.enableCors({
    origin: cors.getAllowlist(),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Enable global validation pipes
  app.useGlobalPipes(new ValidationPipe());

  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
}
bootstrap();
