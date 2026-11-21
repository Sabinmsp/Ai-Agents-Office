// Shared by the server and the browser: game rules. The team itself is in config/agents.yaml.
export const MAX_LEVEL = 3;
export const BUILD_COST = [100, 250, 500];         // cost to go from level 0->1, 1->2, 2->3
export const REWARD = { job: 40, mission: 60 };
export const EFFORT_BY_LEVEL = { 1: 'medium', 2: 'high', 3: 'xhigh' };  // upgrades make an agent think harder
export const START = { coins: 300, lots: { hq: 1, iris: 1, kai: 1 }, skills: { iris: ['search'] } };

// Skills are real abilities a resident uses while working, not badges. Teach them with coins.
export const SKILLS = [
  { id: 'search', name: 'Web search', cost: 80, about: 'Searches the live web while working, so facts and prices are current.' },
  { id: 'reader', name: 'Page reader', cost: 80, about: 'Opens and reads web pages: ones it finds, or links you paste into a job.' },
];
export const ANIM = { idle: 'Idle_Loop', talk: 'Idle_Talking_Loop', walk: 'Walk_Loop', run: 'Jog_Fwd_Loop', sit: 'Sitting_Idle_Loop', sitTalk: 'Sitting_Talking_Loop', cheer: 'Interact', shoot: 'Spell_Simple_Shoot', dance: 'Dance_Loop' };
