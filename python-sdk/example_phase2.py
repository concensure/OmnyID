import asyncio

from afp import Agent, Message


async def main():
    agent = Agent(agent_id="agent:human@you.com")
    thread_id = "page_notation_ai_workspace"

    msg = Message(
        thread_id=thread_id,
        to=["agent:team@acme.ai"],
        type="note",
        subtype="block_update",
        content={
            "kind": "page_block",
            "text": "This is a normal human paragraph about taxes.",
            "references": ["page_budget_2026"],
        },
        metadata={"domain": "page_structure"},
    )
    await agent.send(msg)
    await agent.summarise(thread_id, style="brief")
    thread = await agent.get_thread(thread_id)
    print("Saved page content, requested a summary action, and loaded the shared thread:")
    print(thread)

    await agent.aclose()


asyncio.run(main())
