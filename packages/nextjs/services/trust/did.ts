import { isAddress, recoverMessageAddress, verifyMessage } from "viem";
import { privateKeyToAccount } from "viem/accounts";

/**
 * Generates a standard Hedera Agent DID from an EVM wallet address.
 * Format: did:hedera:<network>:<lowercase_address>
 */
export function generateAgentDID(address: string, network = "testnet"): string {
  if (!isAddress(address)) {
    throw new Error(`Invalid EVM address format: ${address}`);
  }
  return `did:hedera:${network}:${address.toLowerCase()}`;
}

/**
 * Extracts the 0x EVM address from a supported DID string.
 * Supports:
 * - did:hedera:<network>:<address>
 * - did:iden3:<chain>:<network>:<address>
 * - Raw 0x EVM address
 */
export function getAddressFromDID(did: string): string {
  const trimmed = did.trim();
  if (/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  const parts = trimmed.split(":");
  const lastPart = parts[parts.length - 1];

  if (lastPart && /^0x[0-9a-fA-F]{40}$/.test(lastPart)) {
    return lastPart.toLowerCase();
  }

  throw new Error(`Cannot extract EVM address from DID: ${did}`);
}

/**
 * Constructs a standardized, replay-resistant authentication challenge string.
 */
export function buildAuthChallenge(did: string, timestamp: number): string {
  return `AgentAuth:${did}:${timestamp}`;
}

/**
 * Signs an authentication challenge using an agent's private key.
 */
export async function signAuthChallenge(
  privateKey: `0x${string}` | string,
  did: string,
  timestamp: number,
): Promise<string> {
  const formattedKey = (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as `0x${string}`;
  const account = privateKeyToAccount(formattedKey);
  const challenge = buildAuthChallenge(did, timestamp);

  return account.signMessage({
    message: challenge,
  });
}

/**
 * Verifies an agent's authentication challenge proof.
 * Validates timestamp freshness against maxDriftMs (default 5 minutes) to protect against replay attacks.
 */
export async function verifyAuthChallenge(
  did: string,
  timestamp: number,
  signature: `0x${string}` | string,
  maxDriftMs = 300_000,
): Promise<{ valid: boolean; address?: string; error?: string }> {
  try {
    const now = Date.now();
    const drift = Math.abs(now - timestamp);

    if (drift > maxDriftMs) {
      return {
        valid: false,
        error: `Timestamp expired or too far in future (drift: ${drift}ms, max: ${maxDriftMs}ms)`,
      };
    }

    const expectedAddress = getAddressFromDID(did);
    const challenge = buildAuthChallenge(did, timestamp);
    const formattedSig = (signature.startsWith("0x") ? signature : `0x${signature}`) as `0x${string}`;

    const isValid = await verifyMessage({
      address: expectedAddress as `0x${string}`,
      message: challenge,
      signature: formattedSig,
    });

    if (!isValid) {
      const recovered = await recoverMessageAddress({
        message: challenge,
        signature: formattedSig,
      });
      return {
        valid: false,
        address: recovered,
        error: `Signature does not match expected agent address ${expectedAddress} (recovered: ${recovered})`,
      };
    }

    return {
      valid: true,
      address: expectedAddress,
    };
  } catch (err: any) {
    return {
      valid: false,
      error: `Verification error: ${err.message || String(err)}`,
    };
  }
}
