export interface AgentIdentity {
  did: string;
  agentId: number;
  description: string;
  serviceEndpoint: string;
  walletAddress: string;
  registeredAt: number;
  active: boolean;
}

export interface RegistrationParams {
  did: string;
  description: string;
  serviceEndpoint: string;
  walletAddress?: string;
  privateKey?: string;
}

export interface TrustProofHeaders {
  did: string;
  signature: string;
  timestamp: number;
}

export interface TrustVerificationResult {
  valid: boolean;
  reason?: string;
  agent?: AgentIdentity;
}

export interface TrustAuditRecord {
  id: string;
  timestamp: string; // ISO 8601
  type: "REGISTER" | "CHALLENGE" | "AUTH_SUCCESS" | "AUTH_FAILED";
  did: string;
  agentAddress: string;
  serviceEndpoint?: string;
  reason?: string;
  txHash?: string;
}

export interface AgentTrustMiddlewareOptions {
  requireRegistered?: boolean;
  maxTimestampDriftMs?: number; // default: 300,000 (5 minutes)
  auditTopicId?: string;
}
