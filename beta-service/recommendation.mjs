import { recommend } from './policy.mjs';
import { attachNearbyTransactions } from './market.mjs';
import { adaptDiscoRows } from './disco-adapter.mjs';

// The source adapter supplies confirmed units and listing-specific distances.
// An absent payload stays unavailable; it never becomes an empty search result.
export function buildRecommendation(payload, conditions, options) {
  const result = recommend(payload?.listings, conditions, payload?.listingContext, options);
  if (result.status==='ready' && Object.hasOwn(payload,'discoRows')) {
    const records={};
    let context;
    for (const group of result.groups) for (const listing of group.listings) {
      const adapted=adaptDiscoRows(payload.discoRows,listing,payload.positionsByListingId?.[listing.id],payload.discoContract);
      context=adapted.context;
      records[listing.id]=adapted.records;
    }
    return attachNearbyTransactions(result,records,context,options);
  }
  return attachNearbyTransactions(result, payload?.transactionsByListingId, payload?.transactionContext, options);
}
