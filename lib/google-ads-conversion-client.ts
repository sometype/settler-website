import {
  googleAdsConversionDestination,
  type GoogleAdsContactAction,
} from "@/lib/google-ads-conversion-core";

type GoogleTag = (
  command: "event",
  eventName: "conversion",
  parameters: { send_to: string }
) => void;

export function sendGoogleAdsConversion(
  action: GoogleAdsContactAction | string,
  gtagOverride?: GoogleTag
): boolean {
  const destination = googleAdsConversionDestination(action);
  if (!destination) return false;

  const browserGtag =
    typeof window !== "undefined"
      ? (window as typeof window & { gtag?: GoogleTag }).gtag
      : undefined;
  const gtag = gtagOverride ?? browserGtag;
  if (typeof gtag !== "function") return false;

  try {
    gtag("event", "conversion", { send_to: destination });
    return true;
  } catch {
    return false;
  }
}
