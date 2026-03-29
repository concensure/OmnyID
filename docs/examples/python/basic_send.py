import asyncio

from afp import Agent, Message


async def main():
    agent = Agent(agent_id="agent:demo@example.com")
    message = Message(
        thread_id="thread_demo",
        to=["agent:peer@example.com"],
        type="task_update",
        content={"status": "done"},
    )
    print(await agent.send(message))
    await agent.aclose()


asyncio.run(main())
