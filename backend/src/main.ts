import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
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

  // `rawBody: true` asks Nest's own JSON/urlencoded parsers to keep the
  // untouched bytes on `req.rawBody`, which the Stripe webhook needs for
  // signature verification (`POST /payments/webhooks/stripe`).
  //
  // Do NOT replace this with `app.use(express.raw({ type: 'application/json' }))`:
  // `app.use` registers ahead of the parser middleware that `app.listen()`
  // installs, so a global raw parser reads the stream first and leaves
  // `req.body` as a Buffer for every JSON request — every `@Body()` DTO then
  // sees `undefined` fields (this is what broke `POST /auth/login`).
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // Parse request cookies so the JWT strategy can read the httpOnly auth cookie.
  app.use(cookieParser());

  // Restrict CORS to an explicit, environment-driven allowlist.
  // Never use a wildcard '*' outside of local development.
  // Note: the cors package treats a function `origin` as async and expects it
  // to call a callback. Passing the sync allowlist function directly would
  // hang every request, so wrap it in the callback form.
  const cors = app.get(CorsAllowlistService);
  app.enableCors({
    origin: (origin, callback) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      callback(null, cors.isAllowed(origin));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Validate every DTO-backed request at the controller boundary. `whitelist`
  // strips properties that have no validation decorator, which stops clients
  // from smuggling in columns (e.g. `organizationId`) that a DTO does not
  // declare. Bodies whose type is not a DTO class are left untouched.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
}
bootstrap();
