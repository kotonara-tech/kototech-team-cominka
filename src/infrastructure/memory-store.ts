// メモリ上の Store。変更のたびに persist を呼ぶ（ブラウザでは IndexedDB へ書き戻す）。

import type { MediaType, Store } from "../application/ports.ts";
import type { Inquiry, Listing, Site } from "../domain/listing.ts";

export type StoreData = {
  sites: Site[];
  listings: Listing[];
  inquiries: Inquiry[];
  /** requestId → 作成した ID（冪等性） */
  requests: Record<string, string>;
};

export type Change =
  | { kind: "listing"; listing: Listing; requestKey: string }
  | { kind: "inquiry"; inquiry: Inquiry; requestKey: string };

export class MemoryStore implements Store {
  readonly #data: StoreData;
  readonly #persist: (change: Change) => void;

  constructor(data: StoreData, persist: (change: Change) => void = () => {}) {
    this.#data = data;
    this.#persist = persist;
  }

  listSites() {
    return this.#data.sites;
  }
  getSite(id: string) {
    return this.#data.sites.find((s) => s.id === id);
  }
  listListings() {
    return this.#data.listings;
  }
  getListing(id: string) {
    return this.#data.listings.find((l) => l.id === id);
  }
  findListingByRequest(requestId: string) {
    const id = this.#data.requests[`listing:${requestId}`];
    return id ? this.getListing(id) : undefined;
  }
  saveListing(listing: Listing, requestId: string) {
    const requestKey = `listing:${requestId}`;
    this.#data.listings.push(listing);
    this.#data.requests[requestKey] = listing.id;
    this.#persist({ kind: "listing", listing, requestKey });
  }
  saveImage(_id: string, imageBase64: string, mediaType: MediaType) {
    return `data:${mediaType};base64,${imageBase64}`;
  }
  findInquiryByRequest(requestId: string) {
    const id = this.#data.requests[`inquiry:${requestId}`];
    return id ? this.#data.inquiries.find((q) => q.id === id) : undefined;
  }
  saveInquiry(inquiry: Inquiry, requestId: string) {
    const requestKey = `inquiry:${requestId}`;
    this.#data.inquiries.push(inquiry);
    this.#data.requests[requestKey] = inquiry.id;
    this.#persist({ kind: "inquiry", inquiry, requestKey });
  }
  countInquiries(listingId: string) {
    return this.#data.inquiries.filter((q) => q.listingId === listingId).length;
  }
}
