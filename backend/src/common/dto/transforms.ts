import { Transform, type TransformFnParams } from 'class-transformer';

/**
 * Trim strings and turn blank form values into `undefined`.
 *
 * The React forms submit `""` for every field the user never touched, so a
 * plain `@IsOptional() @IsNumber()` would reject an empty optional input.
 * Applying this before validation lets "left blank" mean "not provided"
 * without every DTO needing a bespoke transform.
 */
export const CleanOptional = () =>
  Transform(({ value }: TransformFnParams): unknown => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed === '' ? undefined : trimmed;
    }
    return value;
  });

/**
 * Coerce the many shapes a boolean arrives in (real boolean, `"true"`,
 * `"on"` from a checkbox post, `1`) into a real boolean.
 */
export const ToBoolean = () =>
  Transform(({ value }: TransformFnParams): unknown => {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value !== 'string') return value;
    const normalized = value.toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
    return value;
  });

/**
 * Accept a monetary/decimal value as a number or a numeric string and return
 * it as a `number`, or `undefined` when blank.
 */
export const ToNumber = () =>
  Transform(({ value }: TransformFnParams): unknown => {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : value;
    }
    if (typeof value !== 'string') return value;
    const parsed = Number(value.replace(/,/g, '').trim());
    return Number.isNaN(parsed) ? value : parsed;
  });
