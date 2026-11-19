// Agent events: the one place that decides what the office is told.
//
// Every source below speaks the same small set of JSON events, exactly what a websocket would send.
// The scene (game.js) only listens to these, so a source can be swapped without touching the scene.
//
//   { type: 'task_assigned',     taskId, agentId, title, origin? }      origin: 'user' when you typed it
//   { type: 'working',           taskId, agentId }
//   { type: 'output',            taskId, agentId, text }                 text streams onto the monitor
//   { type: 'tool_call',         taskId, agentId, tool, detail? }        tool: 'web' | 'github' | 'email' | 'file'; detail: the search query or page
//   { type: 'log',               agentId, text, kind: 'work'|'life', bad? }   a line for the activity log only
//   { type: 'collaborating',     taskId, agentIds, title, steps }        steps go on the whiteboard
//   { type: 'awaiting_approval', taskId, agentId, title, summary }
//   { type: 'approval',          taskId, approved }
//   { type: 'error',             taskId, agentId, message }
//   { type: 'done',              taskId, agentId, output?, reward?, rejected? }
//   { type: 'idle',              agentId }
//   { type: 'message',           from, text, bad? }                      a line in the chat
//   { type: 'memory_read',       agentId, count, ids }                   the agent was given these memories (beam from the Brain)
//   { type: 'memory_write',      agentId, id, category, text, sensitivity } a memory was saved (pulse into the Brain)
//   { type: 'model_call',        agentId }                               a model was asked something (the Brain core pulses)
//   { type: 'state',             city }                                  save-file update (coins and so on)
//
// A source is anything with:  submit(text, agentId?)  and  decide(taskId, approved).

/** A tiny event bus. */
export function createBus() {
  const fns = new Set();
  return { on: fn => (fns.add(fn), () => fns.delete(fn)), emit: ev => { for (const fn of fns) fn(ev); } };
}

// ---------------------------------------------------------------- mock: realistic pretend work, for when no AI is connected
const MOCK_TASKS = {
  iris: ['Compare three competitor prices', 'Find five reliable suppliers', 'Summarise this month\'s reviews'],
  kai: ['Fix the checkout bug', 'Script the weekly stock report', 'Review the open pull request'],
  mia: ['Write the launch email', 'Draft a LinkedIn post', 'Tidy the project README'],
  nova: ['Find five junior data roles in Darwin', 'Score new listings against the resume', 'Update the job tracker'],
  leo: ['Summarise last month\'s sales', 'Chart the weekly orders', 'Find the best-selling product'],
  sage: ['Plan next week around shifts', 'Fit the assignment deadlines in', 'Draft tomorrow\'s checklist'],
  ava: ['Follow up two clients', 'Draft this month\'s invoices', 'Reply to supplier emails'],
  rex: ['Check the cover letter', 'Proofread the launch email', 'Review the pricing sheet'],
  social: ['Plan this week\'s posts', 'Write five captions', 'Draft a reel script'],
  sales: ['Draft outreach to three gift shops', 'Follow up last week\'s leads', 'Write the wholesale pitch'],
  keeper: ['Tidy the to-do list', 'File this week\'s reports', 'List what is still open'],
};
const MOCK_TOOLS = { social: ['web'], sales: ['email'], iris: ['web'], kai: ['github', 'file'], mia: ['file', 'email'], nova: ['web'], leo: ['file'], sage: ['file'], ava: ['email'], rex: ['file'], keeper: ['file'] };
const MOCK_LINES = ['reading the brief', 'checking what we already know', 'collecting sources', 'outlining', 'drafting section 1', 'drafting section 2', 'cross-checking numbers', 'tightening the wording', 'adding examples', 'formatting', 'final read-through'];
const pick = a => a[Math.floor(Math.random() * a.length)];
const pretendMemory = () => pick(['Prefers short cover letters under 120 words', 'The cafe client wants two Instagram posts a week', 'Applications go out on Tuesday mornings', 'Weekly plans should leave Sunday free', 'Invoices are sent on the first of the month']);

export class MockSource {
  /** @param emit bus.emit  @param getAgents () => [{ id, name, title, free }] of the people currently hired */
  constructor(emit, getAgents, getMemoryIds = () => []) { Object.assign(this, { emit, getAgents, getMemoryIds, timers: new Set(), n: 0, waiting: new Map(), running: false }); }
  later(ms, fn) { const t = setTimeout(() => { this.timers.delete(t); fn(); }, ms); this.timers.add(t); }
  start(everyMs = 20000) {
    if (this.running) return; this.running = true;
    const tick = () => { if (!this.running) return; const free = this.getAgents().filter(a => a.free); if (free.length) { const a = pick(free); this.run(a, pick(MOCK_TASKS[a.id] || ['Tidy the shared drive']), 'auto'); } this.later(everyMs, tick); };
    this.later(3500, tick);
  }
  stop() { this.running = false; for (const t of this.timers) clearTimeout(t); this.timers.clear(); }
  /** A task you typed: goes to the named person, or to whoever's skills match best. */
  submit(text, agentId) {
    const team = this.getAgents(); if (!team.length) return;
    const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 3);
    const score = a => words.filter(w => (a.title + ' ' + a.skill).toLowerCase().includes(w)).length + (a.free ? 0.5 : 0);
    const who = team.find(a => a.id === agentId) || [...team].sort((a, b) => score(b) - score(a))[0];
    this.emit({ type: 'message', from: 'hq', text: `${who.name}, this one is yours.` });
    this.run(who, text.length > 44 ? text.slice(0, 42) + '…' : text, 'user');
  }
  decide(taskId, approved) { const go = this.waiting.get(taskId); if (!go) return; this.waiting.delete(taskId); this.emit({ type: 'approval', taskId, approved }); go(approved); }

  /** One task, start to finish: assigned -> working -> tool call -> (collaborating) -> (error) -> awaiting approval -> done. */
  run(agent, title, origin) {
    const taskId = `mock-${++this.n}`, agentId = agent.id, e = (type, more = {}) => this.emit({ type, taskId, agentId, ...more });
    const user = origin === 'user', lines = [...MOCK_LINES];
    let typing = null;
    const type = on => { clearInterval(typing); this.timers.delete(typing); if (on) { typing = setInterval(() => e('output', { text: `${lines.length ? lines.shift() : pick(MOCK_LINES)}…\n` }), 900); this.timers.add(typing); } };
    const work = () => { e('working'); e('output', { text: `> ${title}\n` }); type(true); const ids = this.getMemoryIds(); if (ids.length) this.later(700, () => this.emit({ type: 'memory_read', agentId, count: Math.min(2, ids.length), ids: ids.slice().sort(() => Math.random() - 0.5).slice(0, 2) })); this.emit({ type: 'model_call', agentId }); };
    const finish = (rejected = false) => { type(false); if (!rejected && Math.random() < 0.45) this.later(1500, () => this.emit({ type: 'memory_write', agentId: 'hq', id: `mock-${++this.n}`, category: pick(['you', 'business', 'projects', 'lessons']), text: pretendMemory(), sensitivity: 'normal' })); e('done', { output: `## ${title}\n\nThis is pretend work from demo mode. Connect an AI provider through OmniRoute and the real result appears here.`, rejected }); if (Math.random() < 0.4) this.later(2500, () => this.emit({ type: 'idle', agentId })); };
    const approval = () => {
      type(false);
      e('awaiting_approval', { title, summary: `**${agent.name}** has finished “${title}” and wants your sign-off before it goes out.\n\n(Demo mode: this is pretend work.)` });
      this.waiting.set(taskId, ok => ok ? finish() : (work(), this.later(6000, () => finish())));
      if (!user) this.later(30000, () => this.waiting.has(taskId) && this.decide(taskId, true));
    };
    const end = () => (user || Math.random() < 0.3 ? approval() : finish());

    e('task_assigned', { title, origin });
    this.later(2600, work);
    this.later(6000, () => e('tool_call', { tool: pick(MOCK_TOOLS[agentId] || ['file']) }));
    let t = 11000;
    const partner = this.getAgents().find(a => a.free && a.id !== agentId);
    if (partner && Math.random() < (user ? 0.5 : 0.25)) {
      this.later(t, () => { type(false); this.emit({ type: 'collaborating', taskId, agentIds: [agentId, partner.id], title, steps: [`${agent.name}: first draft`, `${partner.name}: check and improve`, 'Agree what "done" looks like', 'Send for approval'] }); });
      this.later(t + 15000, work); t += 20000;
    }
    if (Math.random() < 0.14) {
      this.later(t, () => { type(false); e('error', { message: 'A source could not be reached.' }); });
      this.later(t + 11000, work); t += 16000;
    }
    this.later(t + 1500, () => e('tool_call', { tool: pick(MOCK_TOOLS[agentId] || ['file']) }));
    this.later(t + 6000, end);
  }
}

// ---------------------------------------------------------------- real: this project's own server (the manager plans, the team works)
export class ServerSource {
  constructor(emit, names = {}) { Object.assign(this, { emit, names, n: 0, reports: new Map(), steps: new Map() }); }
  async submit(text, agentId) {
    const mid = `m${++this.n}`, id = j => `${mid}-${j}`, emit = this.emit, bad = t => emit({ type: 'message', from: 'system', text: t, bad: true });
    let res;
    try { res = await fetch('/api/mission', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, agent: agentId || null }) }); }
    catch { return bad('Could not reach the server. Is it still running?'); }
    if (!res.ok || !res.body) return bad((await res.json().catch(() => ({}))).error || 'The server refused that request.');
    const agentOf = {}, titleOf = {}; let direct = false, serverMission = mid;
    const handle = ev => {
      const taskId = ev.id ? id(ev.id) : mid, agent = agentOf[ev.id];
      switch (ev.type) {
        case 'plan':
          direct = ev.direct; serverMission = ev.mission || mid;
          if (ev.reply) emit({ type: 'message', from: 'hq', text: ev.reply });
          for (const j of ev.jobs) { agentOf[j.id] = j.agent; titleOf[j.id] = j.title; emit({ type: 'task_assigned', taskId: id(j.id), agentId: j.agent, title: j.title, origin: 'user' }); }
          if (!direct && ev.jobs.length >= 2) emit({ type: 'collaborating', taskId: mid, agentIds: [...new Set(ev.jobs.map(j => j.agent))], title: text, steps: ev.jobs.map(j => `${this.names[j.agent] || j.agent}: ${j.title}`) });
          break;
        case 'job_start': emit({ type: 'working', taskId, agentId: agent }); break;
        case 'job_delta': emit({ type: 'output', taskId, agentId: agent, text: ev.text }); break;
        case 'job_tool': emit({ type: 'tool_call', taskId, agentId: agent, tool: ev.tool === 'web_fetch' ? 'file' : 'web', detail: ev.detail, kind: ev.tool }); break;
        case 'job_done': emit({ type: 'state', city: ev.city }); emit({ type: 'done', taskId, agentId: agent, output: ev.output, reward: ev.reward, direct, rejected: ev.rejected }); break;
        case 'job_error': emit({ type: 'error', taskId, agentId: agent, message: ev.message }); break;
        case 'memory_read': emit({ type: 'memory_read', agentId: ev.agent, count: ev.count, ids: ev.ids }); break;
        case 'memory_write': emit({ type: 'memory_write', agentId: ev.agent, id: ev.id, category: ev.category, text: ev.text, sensitivity: ev.sensitivity }); break;
        case 'model_call': emit({ type: 'model_call', agentId: ev.agent }); break;
        case 'model_fallback': emit({ type: 'log', agentId: ev.agent, kind: 'work', bad: true, text: `switched model: ${ev.from} did not answer, using ${ev.to}` }); emit({ type: 'message', from: ev.agent, text: `${ev.from} did not answer (${ev.reason}), so ${this.names[ev.agent] || 'this step'} used ${ev.to} instead.`, bad: true }); break;
        case 'memory_ask': {                            // Rex was not sure about a memory: the player decides, at reception like any approval
          const tid = `${serverMission}-${ev.key}`;
          this.steps.set(tid, { mission: serverMission, job: ev.key });
          emit({ type: 'awaiting_approval', taskId: tid, agentId: 'hq', title: 'Remember this?', summary: `**${ev.category}:** ${ev.text}\n\n_${ev.reason || 'QA was not sure.'}_` });
          break;
        }
        case 'job_review': {                            // Rex checks the work: a short task at his own desk
          const rid = `${taskId}-rex${ev.attempt}`;
          if (ev.phase === 'start') { emit({ type: 'task_assigned', taskId: rid, agentId: 'rex', title: `Review: ${titleOf[ev.id] || 'work'}`, origin: 'user' }); emit({ type: 'working', taskId: rid, agentId: 'rex' }); emit({ type: 'output', taskId: rid, agentId: 'rex', text: `checking ${this.names[agent] || agent}'s work…\n` }); }
          else {
            emit({ type: 'log', agentId: 'rex', kind: 'work', bad: !ev.pass, text: ev.pass ? `passed ${this.names[agent] || agent}'s "${titleOf[ev.id] || 'work'}"` : `sent back ${this.names[agent] || agent}'s "${titleOf[ev.id] || 'work'}": ${ev.notes.replace(/^[-•\s]+/, '').split('\n')[0].slice(0, 140)}` });
            emit({ type: 'output', taskId: rid, agentId: 'rex', text: `${ev.pass ? 'PASS' : 'FAIL'}\n${ev.notes}\n` });
            emit({ type: 'done', taskId: rid, agentId: 'rex', output: `${ev.pass ? 'PASS' : 'NEEDS CHANGES'}\n\n${ev.notes}` });
            if (!ev.pass) emit({ type: 'message', from: 'rex', text: `${this.names[agent] || agent}'s draft needs changes: ${ev.notes.replace(/\s+/g, ' ').slice(0, 220)}` });
          }
          break;
        }
        case 'job_retry': emit({ type: 'log', agentId: agent, kind: 'work', text: `is rewriting "${titleOf[ev.id] || 'the job'}" after review` }); emit({ type: 'output', taskId, agentId: agent, reset: true, text: '' }); emit({ type: 'working', taskId, agentId: agent }); break;
        case 'job_approval':                            // an email, application or post waits at reception for the player
          this.steps.set(taskId, { mission: serverMission, job: ev.id });
          emit({ type: 'awaiting_approval', taskId, agentId: agent, title: titleOf[ev.id] || 'Approval', summary: ev.output });
          break;
        case 'final':
          if (ev.city) emit({ type: 'state', city: ev.city });
          if (ev.text != null && !direct) {              // the combined report waits at reception for your sign-off
            const title = `Report: ${text.length > 34 ? text.slice(0, 32) + '…' : text}`;
            this.reports.set(mid, { output: ev.text, reward: ev.reward });
            emit({ type: 'task_assigned', taskId: mid, agentId: 'hq', title, origin: 'user', quiet: true });
            emit({ type: 'awaiting_approval', taskId: mid, agentId: 'hq', title, summary: ev.text });
          }
          break;
        case 'error': bad(ev.message); break;
      }
    };
    const reader = res.body.getReader(), dec = new TextDecoder(); let buf = '';
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let i; while ((i = buf.indexOf('\n\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 2); if (line.startsWith('data: ')) handle(JSON.parse(line.slice(6))); }
    }
  }
  decide(taskId, approved) {
    const step = this.steps.get(taskId);
    if (step) {                                         // a step inside a running task: tell the server, which carries on
      this.steps.delete(taskId); this.emit({ type: 'approval', taskId, approved });
      fetch('/api/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...step, approved }) }).catch(() => this.emit({ type: 'message', from: 'system', text: 'Could not reach the server to record your decision.', bad: true }));
      return;
    }
    const r = this.reports.get(taskId); if (!r) return; this.reports.delete(taskId);
    this.emit({ type: 'approval', taskId, approved });
    this.emit({ type: 'done', taskId, agentId: 'hq', output: r.output, reward: approved ? r.reward : 0, rejected: !approved });
    if (!approved) this.emit({ type: 'message', from: 'hq', text: 'Understood. Tell me what to change and I will put the team back on it.' });
  }
}

// ---------------------------------------------------------------- real: any backend that sends the events above over a websocket
// Open the game with ?ws=ws://localhost:8000/events to use it. Tasks and approvals are sent back as
// { type: 'task', text, agentId } and { type: 'approval', taskId, approved }.
export class WebSocketSource {
  constructor(emit, url) {
    this.emit = emit; this.ws = new WebSocket(url);
    this.ws.onmessage = m => { try { emit(JSON.parse(m.data)); } catch { /* ignore anything that is not an event */ } };
    this.ws.onclose = () => emit({ type: 'message', from: 'system', text: `Lost the connection to ${url}.`, bad: true });
  }
  submit(text, agentId) { this.ws.send(JSON.stringify({ type: 'task', text, agentId: agentId || null })); }
  decide(taskId, approved) { this.ws.send(JSON.stringify({ type: 'approval', taskId, approved })); }
}
