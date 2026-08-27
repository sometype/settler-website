export type EnglishAgentContact = {
  phoneE164: "+995555121150";
  displayPhone: "+995 555 12 11 50";
  callHref: "tel:+995555121150";
  whatsappHref: string;
};

const APPROVED_AGENT_PHONE = "+995555121150";
const LISTING_BASE_URL = "https://mepatrone.com/en/listing";

export function buildEnglishAgentContact(
  authority: string | null | undefined,
  listingId: number
): EnglishAgentContact | null {
  if (authority !== APPROVED_AGENT_PHONE) return null;
  if (!Number.isInteger(listingId) || listingId <= 0) return null;

  const listingUrl = `${LISTING_BASE_URL}/${listingId}`;
  const message = encodeURIComponent(
    `Hello, I am interested in listing ${listingId}: ${listingUrl}. Please contact the owner, confirm availability, and help me arrange a viewing.`
  );

  return {
    phoneE164: APPROVED_AGENT_PHONE,
    displayPhone: "+995 555 12 11 50",
    callHref: `tel:${APPROVED_AGENT_PHONE}`,
    whatsappHref: `https://wa.me/${APPROVED_AGENT_PHONE.slice(1)}?text=${message}`,
  };
}
