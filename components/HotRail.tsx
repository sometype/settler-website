import { HOT_MIN_CARDS, type JustAddedResult } from "@/lib/listings";
import { ChannelHeading, ChannelStrip, RailCard } from "./Channel";

/**
 * "Others are looking at this" — competition, not freshness.
 *
 * Sits below just-added because it answers a different question: that rail says
 * what is new, this one says where other callers are already going. Ranking is
 * a rolling 12h peak from view_samples, taken within source and age band, so it
 * cannot collapse into "the newest listings again" (see sql/010).
 *
 * The wording is deliberately about ATTENTION, not quality. We know how many
 * people opened a page; we do not know whether the flat is good, and a heading
 * that implied otherwise would be a claim we cannot support.
 */
export function HotRail({ data }: { data: JustAddedResult }) {
  const { listings, mainImages } = data;

  // Too few genuinely-hot cards → no rail at all. Padding with lukewarm stock
  // would put ordinary listings under a heading promising the opposite, which is
  // exactly how a rail turns into noise.
  if (listings.length < HOT_MIN_CARDS) return null;

  return (
    <section aria-labelledby="hot-heading">
      <ChannelHeading
        id="hot-heading"
        label="სხვები უყურებენ"
        dot="clay"
        count={listings.length}
      />
      <ChannelStrip>
        {listings.map((listing) => (
          <RailCard
            key={listing.id}
            listing={listing}
            image={mainImages.get(listing.id) ?? null}
            src="hot"
          />
        ))}
      </ChannelStrip>
    </section>
  );
}
