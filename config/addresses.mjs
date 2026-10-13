import { readFileSync } from 'node:fs';
import path from 'node:path';

export function readAddresses() {
  const file = process.env.ADDRESSES_FILE || path.join(process.cwd(), 'config/addresses.json');
  const addresses = JSON.parse(readFileSync(/* turbopackIgnore: true */ file, 'utf8'));
  if (!Array.isArray(addresses) || !addresses.length) throw new Error('Address configuration must be a nonempty array');
  const slugs = new Set();
  const keys = new Set();
  for (const a of addresses) {
    if (typeof a.street !== 'string' || !a.street.trim() || typeof a.building !== 'string' || !a.building.trim() || typeof a.slug !== 'string' || !/^[a-z0-9_-]+$/.test(a.slug)) {
      throw new Error('Each address needs street, building and a safe screenshot slug');
    }
    const key = JSON.stringify([a.street.trim(), a.building.trim()]);
    if (slugs.has(a.slug) || keys.has(key)) throw new Error('Duplicate address or screenshot slug');
    slugs.add(a.slug);
    keys.add(key);
  }
  return addresses.map(a => ({ street: a.street.trim(), building: a.building.trim(), slug: a.slug }));
}
