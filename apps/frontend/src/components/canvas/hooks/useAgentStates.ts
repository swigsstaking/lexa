import { useEffect, useState } from 'react';

export type AgentState = 'idle' | 'thinking' | 'ready' | 'error';

export interface AgentStateMap {
  [agentId: string]: AgentState;
}

// États agents depuis le store global (mis à jour lors des appels chat canvas)
let globalAgentStates: AgentStateMap = {};
const subscribers = new Set<(states: AgentStateMap) => void>();

export function setAgentState(agentId: string, state: AgentState) {
  globalAgentStates = { ...globalAgentStates, [agentId]: state };
  subscribers.forEach((fn) => fn(globalAgentStates));
}

export function useAgentStates() {
  const [states, setStates] = useState<AgentStateMap>(globalAgentStates);

  useEffect(() => {
    const handler = (s: AgentStateMap) => setStates({ ...s });
    subscribers.add(handler);
    return () => { subscribers.delete(handler); };
  }, []);

  return states;
}
