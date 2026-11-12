import * as fs from 'fs';
import * as path from 'path';

/**
 * The JSON body parser must stay in charge of request bodies.
 *
 * `main.ts` used to register `app.use(express.raw({ type: 'application/json' }))`
 * in front of Nest's parser. `app.use` runs before the parser middleware that
 * `app.listen()` installs, so the raw parser read the stream first and left
 * `req.body` as a Buffer for *every* JSON request: `@Body()` DTOs saw `undefined`
 * for every field, and `POST /auth/login` failed inside Prisma as
 * `where: { email: undefined }` (a 500 with a stack trace). The Stripe webhook
 * needs the untouched bytes, and Nest can expose them (`rawBody: true`) without
 * displacing its own parser.
 *
 * This spec is the guard for that invariant: putting a raw parser back in front
 * of Nest, or dropping the option the Stripe webhook depends on, fails the
 * build instead of silently breaking every JSON endpoint.
 */
describe('bootstrap body parsing', () => {
  const source = fs.readFileSync(path.resolve(__dirname, 'main.ts'), 'utf8');

  // Comments stripped, so the explanation above cannot satisfy an assertion.
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it('does not register a raw parser ahead of Nest', () => {
    expect(code).not.toMatch(/express\.raw\s*\(/);
    expect(code).not.toMatch(/bodyParser\s*\.\s*raw\s*\(/);
  });

  it('asks Nest to expose req.rawBody for the Stripe webhook', () => {
    expect(code).toMatch(
      /NestFactory\.create\(\s*AppModule\s*,\s*\{\s*rawBody:\s*true\s*,?\s*\}\s*\)/,
    );
  });
});
