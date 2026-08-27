import "server-only";

import { buildEnglishAgentContact } from "@/lib/english-agent-contact-core";

export function getEnglishAgentContact(listingId: number) {
  return buildEnglishAgentContact(
    process.env.MEPATRONE_EN_AGENT_PHONE_E164,
    listingId
  );
}
