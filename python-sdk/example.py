import asyncio

from afp import Agent, Message


async def main():
    agent = Agent(agent_id="agent:demo@acme.ai")
    thread_id = "thread_01j8k9abc123"

    msg = Message(
        thread_id=thread_id,
        to=["agent:receiver@client.co"],
        type="task",
        subtype="status",
        content={"kind": "task_status", "status": "done", "result": "hello from AFP!"},
        metadata={"domain": "task_tracking"},
    )
    result = await agent.send(msg)
    print("Sent custom AFP message:", result)

    action_result = await agent.label(
        thread_id=thread_id,
        labels=["priority", "client-ready"],
    )
    print("Applied declarative action:", action_result)

    reply_result = await agent.reply(
        thread_id=thread_id,
        body="Looks good from the agent side. Shipping the digest now.",
        to=["person@example.com"],
        in_reply_to="<message-123@example.com>",
        references=["<message-122@example.com>", "<message-123@example.com>"],
    )
    print("Queued threaded reply:", reply_result)

    await agent.aclose()


asyncio.run(main())
