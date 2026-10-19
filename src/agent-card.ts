/**
 * A2A agent card (https://a2a-protocol.org, AgentCard v0.3) at /.well-known/agent.json and
 * /.well-known/agent-card.json. Crawlers of the agent ecosystem ask for these two files on every
 * host they find; we answer honestly: the endpoint speaks MCP (JSON-RPC over Streamable HTTP),
 * not A2A message/send, so an A2A client gets a well-formed "method not found". The skills are the
 * MCP tools; test/http.test.ts checks that this list matches tools/list, so it cannot drift.
 */
export const AGENT_SKILLS = [
  {
    id: "vehicle_check",
    name: "Check a vehicle by plate",
    description: "Free facts about one used car from the official register (NL, GB, IL, IS, DK): vehicle data, inspection due date, odometer verdict, insurance, inspection findings and recalls, each with source and as-of date.",
    tags: ["vehicle", "number-plate", "register", "read-only"],
    examples: ["Check Dutch plate 12-ABC-3", "Is UK plate AB12 CDE insured and when is its MOT due?"],
  },
  {
    id: "model_inspection_stats",
    name: "Inspection statistics for a car model",
    description: "Model-wide periodic inspection statistics per source and age band, with the citation line. Not about one specific car.",
    tags: ["vehicle", "model", "statistics", "read-only"],
    examples: ["How often does a Volkswagen Golf fail inspection in the Netherlands?"],
  },
] as const;

export function agentCard(base: string) {
  return {
    protocolVersion: "0.3.0",
    name: "Plateop vehicle check",
    description:
      "Free used-car facts from the official register (NL, GB, IL, IS, DK) with source and date, plus model inspection statistics. The url is an MCP server (Streamable HTTP, JSON-RPC: initialize, tools/list, tools/call), not an A2A message/send endpoint.",
    url: `${base}/mcp`,
    preferredTransport: "JSONRPC",
    provider: { organization: "Plateop", url: "https://plateop.com" },
    iconUrl: `${base}/icon.svg`,
    version: "0.1.0",
    documentationUrl: `${base}/llms.txt`,
    capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: false },
    securitySchemes: {},
    security: [],
    defaultInputModes: ["application/json"],
    defaultOutputModes: ["text/plain", "application/json"],
    skills: AGENT_SKILLS.map((s) => ({ ...s, tags: [...s.tags], examples: [...s.examples] })),
    supportsAuthenticatedExtendedCard: false,
  };
}
