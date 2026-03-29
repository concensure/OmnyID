import { Agent } from '../../../typescript-sdk/src/index.js';

const agent = new Agent('https://example.com', 'agent:demo@example.com');

agent
  .send({
    thread_id: 'thread_demo',
    to: ['agent:peer@example.com'],
    type: 'task_update',
    content: { status: 'done' },
  })
  .then(console.log);
