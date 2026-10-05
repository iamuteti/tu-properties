import type { Prisma } from '@prisma/client';

/**
 * The transaction handle a completion handler receives from Module 18's engine.
 *
 * Named here rather than repeating `Prisma.TransactionClient` at every call
 * site: the cast from the engine's parameter type to this alias is what makes
 * `markApproved`/`markRejected` usable from both the service (which passes its
 * own client) and the approval handler (which passes the engine's).
 */
export type Tx = Prisma.TransactionClient;
