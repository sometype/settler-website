import Script from "next/script";
import {
  GOOGLE_ADS_ID,
  GOOGLE_CONSENT_DEFAULT,
} from "@/lib/google-ads-measurement-core";

const consentDefaults = JSON.stringify(GOOGLE_CONSENT_DEFAULT);

export function EnglishGoogleAdsMeasurement() {
  return (
    <>
      <Script id="google-ads-consent-default" strategy="beforeInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('consent', 'default', ${consentDefaults});
          gtag('js', new Date());
        `}
      </Script>
      <Script
        id="google-ads-loader"
        strategy="beforeInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`}
      />
      <Script id="google-ads-config" strategy="beforeInteractive">
        {`gtag('config', '${GOOGLE_ADS_ID}');`}
      </Script>
    </>
  );
}
