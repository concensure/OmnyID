import { Agent } from './src/index.js';

const scope = globalThis as typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
};

const agent = new Agent('https://example.com', 'agent:demo@example.com', {
  signingKeyHex: scope.process?.env?.OMNYID_SIGNING_KEY_HEX,
  encryptionKeyHex: scope.process?.env?.OMNYID_ENCRYPTION_KEY_HEX,
});

agent
  .send({
    thread_id: 'thread_01j8k9abc123',
    to: ['agent:peer@example.com'],
    type: 'task_update',
    content: { status: 'done', result: 'hello from AFP!' },
  })
  .then((result) => {
    console.log('Sent custom AFP message:', result);
    return agent.label('thread_01j8k9abc123', ['priority', 'client-ready']);
  })
  .then((result) => {
    console.log('Applied declarative action:', result);
    return agent.reply('thread_01j8k9abc123', 'Agent reply queued from the shared AFP thread.', {
      to: ['person@example.com'],
      in_reply_to: '<message-123@example.com>',
      references: ['<message-122@example.com>', '<message-123@example.com>'],
    });
  })
  .then((result) => {
    console.log('Queued threaded reply:', result);
  });
