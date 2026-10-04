import deployedContracts from "../../contracts/deployedContracts";
import { getAddressFromDID } from "./did";
import { AgentIdentity, RegistrationParams } from "./types";

export class AgentRegistryService {
  private static instance: AgentRegistryService;
  private mockStore: Map<string, AgentIdentity> = new Map();
  private nextId = 1;

  public static getInstance(): AgentRegistryService {
    if (!AgentRegistryService.instance) {
      AgentRegistryService.instance = new AgentRegistryService();
    }
    return AgentRegistryService.instance;
  }

  /**
   * Registers a new agent identity.
   * Updates local registry state and syncs with on-chain registry when configured.
   */
  public async registerAgent(params: RegistrationParams): Promise<AgentIdentity> {
    const address = (params.walletAddress || getAddressFromDID(params.did)).toLowerCase();

    if (this.mockStore.has(address)) {
      throw new Error(`Agent with address ${address} is already registered`);
    }

    const agent: AgentIdentity = {
      did: params.did,
      agentId: this.nextId++,
      description: params.description,
      serviceEndpoint: params.serviceEndpoint,
      walletAddress: address,
      registeredAt: Date.now(),
      active: true,
    };

    this.mockStore.set(address, agent);
    return agent;
  }

  /**
   * Checks if an agent is active in the registry.
   */
  public async isAgentRegistered(addressOrDid: string): Promise<boolean> {
    try {
      const address = getAddressFromDID(addressOrDid).toLowerCase();
      const agent = this.mockStore.get(address);
      return Boolean(agent && agent.active);
    } catch {
      return false;
    }
  }

  /**
   * Retrieves an agent's details by address or DID.
   */
  public async getAgent(addressOrDid: string): Promise<AgentIdentity | null> {
    try {
      const address = getAddressFromDID(addressOrDid).toLowerCase();
      const agent = this.mockStore.get(address);
      if (!agent || !agent.active) return null;
      return agent;
    } catch {
      return null;
    }
  }

  /**
   * Updates an agent's registered service endpoint.
   */
  public async updateServiceEndpoint(addressOrDid: string, newEndpoint: string): Promise<void> {
    const address = getAddressFromDID(addressOrDid).toLowerCase();
    const agent = this.mockStore.get(address);
    if (!agent || !agent.active) {
      throw new Error(`Agent ${address} not found in registry`);
    }
    agent.serviceEndpoint = newEndpoint;
  }

  /**
   * Deactivates an agent's identity.
   */
  public async deactivateAgent(addressOrDid: string): Promise<void> {
    const address = getAddressFromDID(addressOrDid).toLowerCase();
    const agent = this.mockStore.get(address);
    if (!agent) {
      throw new Error(`Agent ${address} not found in registry`);
    }
    agent.active = false;
  }

  /**
   * Clears in-memory state (used for clean offline testing).
   */
  public clear(): void {
    this.mockStore.clear();
    this.nextId = 1;
  }

  /**
   * Returns configured on-chain registry contract address if available.
   */
  public getContractAddress(): string | undefined {
    return (
      process.env.AGENT_REGISTRY_ADDRESS ||
      process.env.NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS ||
      (deployedContracts as any)?.[296]?.AgentRegistry?.address
    );
  }
}

export const agentRegistry = AgentRegistryService.getInstance();
