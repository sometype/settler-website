# English page live audit — 2026-09-21
Read-only browser regression audit of https://mepatrone.com/en/rent after gallery deployment 50db52b.

Working in sampled checks: combined Saburtalo/2-room/$400–700 filtering, pagination preserving filters, listing/back navigation preserving page and filters, gallery thumbnail and keyboard selection, 390px mobile layout without horizontal overflow, empty-result messaging, and agent phone/WhatsApp targets carrying the correct listing. All 24 sampled first-page image endpoints returned HTTP 200 image content; details in english-page-audit-images-20260921.json. Listing 28115's six photos loaded and selection worked. No console errors captured in sampled tab.

Confirmed defects:
1. Clear resets URL/results but leaves district and rooms dropdowns displaying previous choices. Reproduced from /en/rent?district=saburtalo&rooms=2&min=400&max=700: Clear navigated to /en/rent showing 2,653 rentals including 3-room Didi Dighomi, while controls still read saburtalo and 2. Reload reset both dropdowns to empty, confirming stale client form state.
2. Price bounds below $50 are silently discarded. Search with min=0/max=1 settled with max field empty and returned prices above $1 without validation. page.tsx boundedInt accepts only 50–50,000 and otherwise returns undefined.

Catalog page source is unchanged between original gallery baseline 3b0d4ae and deployed candidate 50db52b; these are pre-existing filter defects, not changes introduced by gallery patch. This is sampled coverage, not proof that every listing/page is error-free. No code or production data changed during audit; temporary browser tabs closed.
