import {
  GOOGLE_ADS_ID,
  ENGLISH_GOOGLE_ADS_BOOTSTRAP,
} from "@/lib/google-ads-measurement-core";

export function EnglishGoogleAdsMeasurement() {
  return (
    <>
      <script>{ENGLISH_GOOGLE_ADS_BOOTSTRAP}</script>
      <script
        async
        src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`}
      ></script>
    </>
  );
}
