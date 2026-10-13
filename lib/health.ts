import { readAddresses } from "../config/addresses.mjs";
import { db, getAddressByStreetBuilding } from "./db";
import { readAddressState } from "./state";

export async function readHealth() {
  // No schema creation or synthetic ingest: production verification only reads.
  await db().execute("SELECT id FROM addresses LIMIT 0");
  const addresses = await Promise.all(readAddresses().map(async (configured) => {
    const address = await getAddressByStreetBuilding(configured.street, configured.building);
    const state = address ? await readAddressState(address) : null;
    return {
      slug: configured.slug,
      checkedAt: state?.checkedAt ?? null,
      collectionProblem: state?.collectionProblem ?? true,
    };
  }));
  return {
    ready: true,
    buildSha: process.env.DTEKTOR_BUILD_SHA || "unknown",
    collection: { ok: addresses.every(address => !address.collectionProblem), addresses },
  };
}
