// The team, as the server read it from config/agents.yaml.
const team = await (await fetch('/api/team')).json();
export const BOSS = team.manager;
export const AGENTS = team.team;
