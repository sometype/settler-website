export const GOOGLE_ADS_ID = "AW-16798915501" as const;

export const GOOGLE_CONSENT_DEFAULT = {
  ad_storage: "denied",
  analytics_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
} as const;

export const ENGLISH_GOOGLE_ADS_BOOTSTRAP = `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('consent', 'default', ${JSON.stringify(GOOGLE_CONSENT_DEFAULT)});
gtag('js', new Date());
gtag('config', '${GOOGLE_ADS_ID}');
`;
