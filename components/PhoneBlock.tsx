/**
 * Buyer → seller contact. Shows real number when the public view provides it.
 */
function digitsOnly(phone: string): string {
  return phone.replace(/\D/g, "");
}

function telHref(phone: string): string {
  const d = digitsOnly(phone);
  // Georgia mobile often stored as +9955xxxxxxxx
  if (d.startsWith("995") && d.length >= 12) return `tel:+${d}`;
  if (d.length === 9) return `tel:+995${d}`;
  if (phone.trim().startsWith("+")) return `tel:${phone.trim()}`;
  return `tel:+${d}`;
}

function displayPhone(phone: string): string {
  const d = digitsOnly(phone);
  if (d.startsWith("995") && d.length === 12) {
    // +995 5XX XXX XXX
    return `+995 ${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9)}`;
  }
  if (d.length === 9) {
    return `+995 ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  }
  return phone.trim();
}

export function PhoneBlock({
  hasPhone,
  phone,
}: {
  hasPhone: boolean;
  phone?: string | null;
}) {
  const number = phone?.trim() || null;
  const show = Boolean(hasPhone && number);

  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
      <h2 className="text-sm font-semibold text-stone-900">Contact seller</h2>
      {show && number ? (
        <div className="mt-3 space-y-3">
          <p className="text-lg font-semibold tracking-wide text-stone-900">
            {displayPhone(number)}
          </p>
          <a
            href={telHref(number)}
            className="flex w-full items-center justify-center rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            Call
          </a>
          <a
            href={`https://wa.me/${digitsOnly(number).startsWith("995") ? digitsOnly(number) : `995${digitsOnly(number)}`}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center rounded-lg bg-stone-100 px-4 py-2.5 text-sm font-semibold text-stone-800 transition hover:bg-stone-200"
          >
            WhatsApp
          </a>
        </div>
      ) : (
        <p className="mt-2 text-sm text-stone-500">
          <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-stone-300 align-middle" />
          Number pending — check back soon, or open the original listing.
        </p>
      )}
    </div>
  );
}
