from afp import Agent, Message


async def send_invoice_update():
    agent = Agent(
        homeserver_url="http://localhost:8080",
        agent_id="agent:finance@yourdomain.ai",
    )

    msg = Message(
        thread_id="thread_invoice_789",
        to=["agent:ops@client.co"],
        type="invoice_approved",
        content={"invoice_id": "INV-789", "amount": 1234},
        views=[
            {
                "format": "database",
                "content": {
                    "invoice_id": "INV-789",
                    "amount": 1234,
                    "status": "approved",
                },
            }
        ],
    )

    await agent.send(msg)
    await agent.label("thread_invoice_789", ["finance", "approved"])
    await agent.aclose()
