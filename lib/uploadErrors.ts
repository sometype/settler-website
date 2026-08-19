export type UploadStep = "email" | "code" | "phone" | "facts" | "photos" | "describe";

export type IntakeDetail =
  | string
  | { code?: unknown; field?: unknown; reason?: unknown };

export type UploadError = {
  code: string;
  ka: string;
  field?: string;
  step?: UploadStep;
  controlId?: string;
  detailsId?: string;
  retry_after_s?: number;
};

const FIELDS: Record<string, Omit<UploadError, "code">> = {
  request: { ka: "ფორმის მონაცემები ვერ მივიღეთ. განაახლე გვერდი და თავიდან სცადე." },
  phone: { ka: "ტელეფონი არასწორია — ჩაწერე ქართული მობილურის 9 ციფრი.", field: "phone", step: "phone", controlId: "mp-phone" },
  deal_type: { ka: "აირჩიე იყიდება თუ ქირავდება.", field: "deal_type", step: "facts", controlId: "mp-deal-sale" },
  district_code: { ka: "აირჩიე უბანი.", field: "district_code", step: "facts", controlId: "mp-district" },
  street_display: { ka: "ჩაწერე მხოლოდ ქუჩის ან უბნის სახელი, სახლის ნომრის გარეშე.", field: "street_display", step: "facts", controlId: "mp-street" },
  rooms: { ka: "აირჩიე ოთახების რაოდენობა.", field: "rooms", step: "facts", controlId: "mp-rooms" },
  area: { ka: "ფართი უნდა იყოს 5-დან 2000 მ²-მდე.", field: "area", step: "facts", controlId: "mp-area" },
  floor: { ka: "სართული და შენობის სართულები ორივე ჩაწერე (0-99).", field: "floor", step: "facts", controlId: "mp-unit-floor" },
  price_usd: { ka: "ფასი უნდა იყოს მთელი რიცხვი 10-დან 10 000 000 დოლარამდე.", field: "price_usd", step: "facts", controlId: "mp-price" },
  condition: { ka: "აირჩიე ბინის მდგომარეობა.", field: "condition", step: "facts", controlId: "mp-condition" },
  portal_url: { ka: "ბმული უნდა იწყებოდეს http:// ან https://-ით.", field: "portal_url", step: "facts", controlId: "mp-portal" },
  build_period: { ka: "აშენების წელი უნდა იყოს 1800-დან 2099-მდე.", field: "build_period", step: "facts", controlId: "mp-build-year", detailsId: "mp-building-details" },
  bathrooms: { ka: "აირჩიე სველი წერტილების რაოდენობა.", field: "bathrooms", step: "facts", controlId: "mp-bathrooms", detailsId: "mp-building-details" },
  building_status: { ka: "შენობის სტატუსი თავიდან აირჩიე.", field: "building_status", step: "facts", controlId: "mp-building-status", detailsId: "mp-building-details" },
  project_type: { ka: "პროექტის ტიპი თავიდან აირჩიე.", field: "project_type", step: "facts", controlId: "mp-project-type", detailsId: "mp-building-details" },
  balcony: { ka: "აივნის მნიშვნელობა თავიდან აირჩიე.", field: "balcony", step: "facts", controlId: "mp-balcony", detailsId: "mp-building-details" },
  amenities: { ka: "კეთილმოწყობის მონიშვნები გადაამოწმე.", field: "amenities", step: "facts", controlId: "mp-amenity-elevator", detailsId: "mp-amenities-details" },
  deposit_required: { ka: "დეპოზიტის პირობა თავიდან აირჩიე.", field: "deposit_required", step: "facts", controlId: "mp-deposit", detailsId: "mp-rent-details" },
  utilities_included: { ka: "კომუნალურების პირობა გადაამოწმე.", field: "utilities_included", step: "facts", controlId: "mp-utilities", detailsId: "mp-rent-details" },
  pets_allowed: { ka: "შინაური ცხოველების პირობა თავიდან აირჩიე.", field: "pets_allowed", step: "facts", controlId: "mp-pets", detailsId: "mp-rent-details" },
  min_months: { ka: "მინიმალური ვადა უნდა იყოს 1-დან 60 თვემდე.", field: "min_months", step: "facts", controlId: "mp-min-months", detailsId: "mp-rent-details" },
  description: { ka: "აღწერა აუცილებელია და მაქსიმუმ 4000 სიმბოლო უნდა იყოს.", field: "description", step: "describe", controlId: "mp-description" },
  owner_declared: { ka: "გასაგრძელებლად დაადასტურე განცხადების განთავსების უფლება.", field: "owner_declared", step: "describe", controlId: "mp-declared" },
};

export function mapIntakeError(status: number, detail: IntakeDetail, action: string): UploadError {
  if (detail && typeof detail === "object" && detail.code === "validation" && typeof detail.field === "string") {
    const known = FIELDS[detail.field];
    if (known) return { code: `invalid_${detail.field}`, field: detail.field, ...known };
    return { code: "invalid_request", ka: "მონაცემები ვერ მივიღეთ. გადაამოწმე ფორმა და თავიდან სცადე." };
  }
  const text = typeof detail === "string" ? detail : "";
  if (text.includes("verification temporarily unavailable")) return { code: "send_failed", ka: "კოდი ვერ გაიგზავნა. სცადე თავიდან, ან სხვა ელფოსტა." };
  if (status === 429) {
    const seconds = Number(text.match(/retry in (\d+)s/)?.[1] ?? 0);
    return { code: "too_fast", ka: "ცოტა დაიცადე და თავიდან დააჭირე.", ...(seconds ? { retry_after_s: seconds } : {}) };
  }
  if (text.includes("invalid email")) return { code: "bad_email", ka: "ელფოსტა არასწორია — შეამოწმე.", field: "email", step: "email", controlId: "mp-email" };
  if (text.includes("wrong or expired code")) return { code: "bad_code", ka: "კოდი არასწორია ან ვადა გაუვიდა. მოითხოვე ახალი კოდი.", field: "code", step: "code", controlId: "mp-code" };
  if (text.includes("session expired")) return { code: "session_expired", ka: "სესიის ვადა გავიდა — ელფოსტა თავიდან დაადასტურე.", step: "email" };
  if (text.includes("Georgian mobile")) return { code: "bad_phone", ...FIELDS.phone };
  if (text.includes("street_name_only")) return { code: "street_name_only", ...FIELDS.street_display };
  if (text.includes("submission exists for this email")) return { code: "draft_exists_email", ka: "ამ ელფოსტაზე უკვე გაქვს დაუსრულებელი განცხადება. შეგიძლია გააგრძელო ან წაშალო." };
  if (text.includes("submission exists for this phone")) return { code: "draft_exists_phone", ka: "ამ ტელეფონზე უკვე არის დაუსრულებელი განცხადება." };
  if (text.includes("submission cannot be abandoned")) return { code: "draft_protected", ka: "ეს განცხადება უკვე გადაგზავნილია და აქედან აღარ იშლება." };
  if (["ticket", "status", "gallery-reset"].includes(action)) return { code: "gallery", ka: "ფოტოების შემოწმება ვერ დასრულდა. ფოტოები შენახულია — თავიდან სცადე." };
  if (action === "recover") return { code: "draft_recovery", ka: "დაუსრულებელი განცხადება ვერ შევამოწმეთ. დააჭირე „თავიდან შემოწმებას“." };
  if (action === "abandon") return { code: "draft_abandon", ka: "ძველი განცხადება ვერ წაიშალა. თავიდან სცადე." };
  if (status >= 500 || status === 401 || status === 409 || text.startsWith("intake ") || text.startsWith("http ")) {
    return { code: "service", ka: "სერვერთან კავშირი ვერ დასრულდა. შენი მონაცემები შენახულია — თავიდან სცადე." };
  }
  return { code: "request", ka: "მოთხოვნა ვერ მივიღეთ. მონაცემები შენახულია — თავიდან სცადე." };
}

export function localFieldError(field: string): UploadError {
  const known = FIELDS[field] ?? { ka: "ეს ველი გადაამოწმე." };
  return { code: `invalid_${field}`, ...known };
}
