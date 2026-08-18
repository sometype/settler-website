export const OWNER_UPLOAD_TURNSTILE_ACTION = "owner_upload";
export const DEFAULT_TURNSTILE_HOSTNAME = "mepatrone.com";

export type TurnstileVerification = {
  success?: boolean;
  hostname?: string;
  action?: string;
};

/** A successful token must belong to this site and this exact workflow. */
export function validOwnerUploadTurnstile(
  result: TurnstileVerification,
  expectedHostname = DEFAULT_TURNSTILE_HOSTNAME,
): boolean {
  return (
    result.success === true &&
    result.hostname === expectedHostname &&
    result.action === OWNER_UPLOAD_TURNSTILE_ACTION
  );
}
