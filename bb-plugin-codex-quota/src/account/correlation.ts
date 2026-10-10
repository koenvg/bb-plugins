import { createHmac } from "node:crypto";
import { accountClaim } from "./feasibility.js";

/** Private correlation only. A workspace ID alone can be shared by different users. */
export function accountProof(token: string, challenge: string): string | null {
  try {
    const account = accountClaim(token);
    const jwt = JSON.parse(
      Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    const claim = jwt["https://api.openai.com/auth"];
    if (!claim || typeof claim !== "object" || Array.isArray(claim)) return null;
    const user = (claim as Record<string, unknown>).chatgpt_user_id ?? jwt.sub;
    if (!account || typeof user !== "string" || user.length === 0 || user.length > 256) return null;
    // The host RPC validates a random 256-bit server challenge; no IDs cross that RPC.
    return createHmac("sha256", Buffer.from(challenge, "hex"))
      .update("codex-principal-v1:")
      .update(JSON.stringify([account, user]))
      .digest("hex");
  } catch {
    return null;
  }
}
