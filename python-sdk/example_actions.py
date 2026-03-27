"""
Example: approval/decision actions and key rotation via the AFP Python SDK.

Demonstrates:
- Submitting an approval request as an AFP message with an 'approvals' view
- Reading the thread to see the pending approval
- Using rotate_key() to request a server-side key rotation
"""
import asyncio

from afp import Agent, Message, View


async def main():
    agent = Agent(agent_id="agent:orchestrator@acme.ai")
    thread_id = "thread_approval_demo"

    # 1. Send an approval request with an 'approvals' view so the workspace
    #    renders it with the ApprovalsRenderer and wires Approve/Reject buttons.
    approval_msg = Message(
        thread_id=thread_id,
        to=["agent:approver@acme.ai"],
        type="approval_request",
        content={
            "title": "Deploy v2.3 to production",
            "description": "All tests passed. Approval required before rollout.",
            "action_id": "deploy_v2_3",
        },
        views=[
            View(
                format="approvals",
                content={
                    "title": "Deploy v2.3 to production",
                    "items": [
                        {
                            "id": "deploy_v2_3",
                            "label": "Approve production deploy",
                            "description": "All tests passed on staging.",
                        }
                    ],
                },
            )
        ],
    )
    result = await agent.send(approval_msg)
    print("Approval request sent:", result)

    # 2. Fetch the thread to confirm the message is stored.
    thread = await agent.get_thread(thread_id)
    print(f"Thread now has {len(thread)} message(s)")

    # 3. Demonstrate key rotation (operator must apply the returned values).
    rotation = await agent.rotate_key(reason="scheduled quarterly rotation")
    print("Key rotation initiated:")
    print(f"  old key_id : {rotation['old_key_id']}")
    print(f"  new key_id : {rotation['new_key_id']}")
    print(f"  action     : {rotation['action_required']}")

    await agent.aclose()


asyncio.run(main())
