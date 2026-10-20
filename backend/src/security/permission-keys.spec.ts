import * as fs from 'fs';
import * as path from 'path';
import { PERMISSION_MODULES } from '@/prisma/roles-seed';

/**
 * The permission vocabulary, checked against the code that uses it.
 *
 * `hasPermission` reads `perms.modules[module][action]`. A controller that asks
 * for a module the matrix does not contain is asking a question that can only
 * be answered "no" — and that is not a subtle failure, it is a whole feature
 * that only its super administrator can reach:
 *
 *   - `agreements.controller.ts` asked for `agreements.create` / `.update` /
 *     `.delete` while the matrix called the same subject `leases`, so every
 *     agreement write was refused for every customer in the product. Only
 *     `SUPER_ADMIN` got through, because `all: true` bypasses the check.
 *   - `notification-config.controller.ts` asked for `notifications.run` before
 *     `run` was a declared action, and the notification settings were
 *     unreachable for exactly the same reason.
 *
 * Both were live defects, and both were invisible in review, because the
 * decorator and the matrix look like two unrelated things. This spec makes the
 * two files meet: a controller that names a module the matrix has never heard
 * of fails the build instead of failing at runtime for every customer but one.
 */

/** Every action the matrix can express. */
const DECLARED_ACTIONS = [
  'view',
  'create',
  'update',
  'delete',
  'approve',
  'pay',
  'run',
  'self',
  'decide',
  'bill',
  'void',
  'renew',
  'compensation',
] as const;

const BACKEND_SRC = path.resolve(__dirname, '..');

function controllerFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      controllerFiles(full, out);
    } else if (entry.name.endsWith('.controller.ts')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Every `@Permissions('module.action')` in the backend, with where it was found.
 *
 * Comments are stripped first: a controller's doc comment is allowed to *name*
 * a permission (`@Permissions('inventory_items.*')` appears in one), and a
 * comment is not a request.
 */
function usedPermissions(): Array<{ file: string; line: number; raw: string }> {
  const found: Array<{ file: string; line: number; raw: string }> = [];
  for (const file of controllerFiles(BACKEND_SRC)) {
    const text = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (/^\s*(\*|\/\/)/.test(line)) return;
      const matches = line.matchAll(/@Permissions\(\s*(['"])([^'"]+)\1/g);
      for (const match of matches) {
        found.push({
          file: path.relative(BACKEND_SRC, file),
          line: index + 1,
          raw: match[2],
        });
      }
    });
  }
  return found;
}

describe('the permission vocabulary', () => {
  const matrix = new Set<string>(PERMISSION_MODULES);

  it('has no duplicate module keys', () => {
    const seen = new Set<string>();
    const duplicates = PERMISSION_MODULES.filter((module) => {
      if (seen.has(module)) return true;
      seen.add(module);
      return false;
    });
    expect(duplicates).toEqual([]);
  });

  it('never asks for a module the matrix does not declare', () => {
    const unknown = usedPermissions()
      .filter((permission) => !matrix.has(permission.raw.split('.')[0]))
      .map(
        (permission) =>
          `${permission.file}:${permission.line} → ${permission.raw} (module "${
            permission.raw.split('.')[0]
          }" is not in PERMISSION_MODULES)`,
      );
    expect(unknown).toEqual([]);
  });

  it('never asks for an action the matrix cannot express', () => {
    const actions = new Set<string>(DECLARED_ACTIONS);
    const unknown = usedPermissions()
      .filter((permission) => !actions.has(permission.raw.split('.')[1]))
      .map(
        (permission) =>
          `${permission.file}:${permission.line} → ${permission.raw} (action "${
            permission.raw.split('.')[1]
          }" is not a declared action)`,
      );
    expect(unknown).toEqual([]);
  });

  it('gives every declared module at least one endpoint that enforces it', () => {
    // The other half of the same defect: a module the matrix grants to roles
    // but that no endpoint checks is a grant that does nothing, and it reads
    // as though the subject were protected.
    const enforced = new Set(
      usedPermissions().map((permission) => permission.raw.split('.')[0]),
    );
    const unenforced = PERMISSION_MODULES.filter(
      (module) => !enforced.has(module),
    );
    expect(unenforced).toEqual([]);
  });
});
