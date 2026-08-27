export type GoogleAdsContactAction = "wa_tap" | "call_tap";

const GOOGLE_ADS_CONVERSION_DESTINATIONS: Record<GoogleAdsContactAction, string> = {
  wa_tap: "AW-16798915501/gaeICL3T6OgcEK23rMo-",
  call_tap: "AW-16798915501/-vmrCLjU6OgcEK23rMo-",
};

export function googleAdsConversionDestination(action: string): string | null {
  return action === "wa_tap" || action === "call_tap"
    ? GOOGLE_ADS_CONVERSION_DESTINATIONS[action]
    : null;
}
