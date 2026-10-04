import { JsonAgentStore } from "./jsonStore";
import { AgentStore } from "./types";

let storeInstance: AgentStore | null = null;

/**
 * Returns the active AgentStore instance.
 * Defaults to the zero-dependency JsonAgentStore (`data/agents.json`).
 * Sellers can swap in an SQL or external database adapter by implementing
 * the AgentStore interface and setting it via `setAgentStore()`.
 */
export function getAgentStore(): AgentStore {
  if (!storeInstance) {
    storeInstance = new JsonAgentStore();
  }
  return storeInstance;
}

export function setAgentStore(customStore: AgentStore): void {
  storeInstance = customStore;
}

export * from "./types";
export * from "./jsonStore";
