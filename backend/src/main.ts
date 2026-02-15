import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as dotenv from 'dotenv';

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

  // Enable CORS
  app.enableCors();

  // Enable global validation pipes
  app.useGlobalPipes(new ValidationPipe());

  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
}
bootstrap();
