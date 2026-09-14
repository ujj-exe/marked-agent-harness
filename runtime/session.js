import fs from 'node:fs';
import path from 'node:path';
import { CONVERSATION_PATH, MARKED_HOME, SESSIONS_DIR } from '../config/paths.js';

export function createSession(question, { agent = 'codex', asOf = new Date().toISOString() } = {}) {
  const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 8)}`;
  return { research_id: id, question, agent, requested_as_of: asOf, created_at: new Date().toISOString() };
}

export function saveSession(session) {
  const dir = path.join(SESSIONS_DIR, session.research_id);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(dir, 'session.json'), JSON.stringify(session, null, 2) + '\n', { mode: 0o600 });
  return dir;
}

export function createConversation() {
  return {
    conversation_id: `${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 8)}`,
    created_at: new Date().toISOString(),
    turns: [],
  };
}

export function loadConversation() {
  try {
    const conversation = JSON.parse(fs.readFileSync(CONVERSATION_PATH, 'utf8'));
    if (conversation?.conversation_id && Array.isArray(conversation.turns)) return conversation;
  } catch {}
  return createConversation();
}

export function saveConversation(conversation) {
  fs.mkdirSync(MARKED_HOME, { recursive: true, mode: 0o700 });
  const tmp = `${CONVERSATION_PATH}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(conversation, null, 2) + '\n', { mode: 0o600 });
  fs.chmodSync(tmp, 0o600);
  fs.renameSync(tmp, CONVERSATION_PATH);
}

export function appendConversationTurn(conversation, session) {
  const turns = [...conversation.turns, {
    research_id: session.research_id,
    question: session.question,
    answer: session.result,
    created_at: session.created_at,
  }];
  return { ...conversation, updated_at: new Date().toISOString(), turns: turns.slice(-20) };
}

export function conversationHistory(conversation, limit = 8) {
  return (conversation?.turns || []).slice(-limit).map(({ research_id, question, answer, created_at }) => ({
    research_id, question, answer, created_at,
  }));
}

export function formatConversationHistory(conversation, limit = 8) {
  const turns = conversationHistory(conversation, limit);
  if (!turns.length) return 'No saved turns in this session.';
  return turns.map((turn, index) => `${index + 1}. ${turn.question}`).join('\n');
}
