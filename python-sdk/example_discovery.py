import asyncio

from afp import Agent


async def main():
    agent = Agent()
    card = await agent.discover_verified("https://example.com")
    print("Ready to message discovered agent with verified discovery!", card)
    await agent.aclose()


asyncio.run(main())
