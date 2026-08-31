import { cache } from "react";
import { fetchListing } from "./listings";

/**
 * One request-scoped listing read shared by metadata and the page body.
 *
 * React clears this cache between server requests. Within one render it keeps
 * generateMetadata and the page from independently querying the public view
 * and image rows for the same listing.
 */
export const getListingPageData = cache(fetchListing);
