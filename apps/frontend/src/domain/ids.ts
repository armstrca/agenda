/**
 * Row ids are UUID v4 strings minted by the app, never by the database, so a row has its id
 * before it is written and ids stay unique across devices once sync exists. The `uuid` package is
 * used instead of `crypto.randomUUID()` because the latter is only available in secure contexts,
 * which the Vite dev server opened over a LAN address is not.
 */

import { v4 as uuidv4 } from 'uuid';

export type Id = string;

export function newId(): Id {
  return uuidv4();
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** True for any RFC 4122 UUID string (any version), which is what every id column holds. */
export function isId(value: unknown): value is Id {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function assertId(value: unknown, what = 'id'): Id {
  if (!isId(value)) throw new Error(`invalid ${what} (expected UUID)`);
  return value;
}
