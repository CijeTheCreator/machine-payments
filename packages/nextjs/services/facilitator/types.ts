export interface FacilitatorSupportedKind {
  network: string;
  scheme: "exact";
  feePayer: string;
}

export interface FacilitatorSupportedResponse {
  kinds: FacilitatorSupportedKind[];
  status?: string;
}

export interface PaymentDemand {
  payTo: string;
  amount: string | number; // in tinybars
  asset?: string; // "0.0.0"
  network?: string; // "hedera:testnet"
}

export interface FacilitatorVerifyRequest {
  transactionBytes: string;
  paymentDemand?: PaymentDemand;
}

export interface FacilitatorVerifyResponse {
  valid: boolean;
  error?: string;
  payerAccountId?: string;
  transfers?: Array<{ accountId: string; amountTinybar: number }>;
}

export interface FacilitatorSettleRequest {
  transactionBytes: string;
  paymentDemand?: PaymentDemand;
}

export interface FacilitatorSettleResponse {
  success: boolean;
  transactionId?: string;
  consensusTimestamp?: string;
  feePayer?: string;
  error?: string;
}

export interface X402PaymentRequirement {
  scheme: "exact";
  network: string;
  asset: "0.0.0";
  payTo: string;
  amount: string; // tinybar string
  facilitatorUrl: string;
  memo?: string;
}
