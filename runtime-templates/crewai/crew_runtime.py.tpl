import json
import os
import signal
import sys
import time
from pathlib import Path

RUNNING = True


def stop_handler(signum, frame):
    del signum, frame
    global RUNNING
    RUNNING = False


def main() -> None:
    profile_path = Path("/workspace/agent_profile.json")
    profile = json.loads(profile_path.read_text(encoding="utf-8"))
    signal.signal(signal.SIGTERM, stop_handler)
    signal.signal(signal.SIGINT, stop_handler)

    print("OmnyID Crew runtime booted")
    print(json.dumps(
        {
            "owner_user_id": os.getenv("OMNYID_OWNER_USER_ID"),
            "owner_email": os.getenv("OMNYID_OWNER_EMAIL"),
            "framework": os.getenv("OMNYID_FRAMEWORK"),
            "gui": os.getenv("OMNYID_FRAMEWORK_GUI"),
            "agent_scope": json.loads(os.getenv("OMNYID_AGENT_SCOPE_JSON", "{}")),
            "profile": profile,
        },
        indent=2,
    ))
    sys.stdout.flush()

    heartbeat = {
        "event": "runtime_heartbeat",
        "framework": os.getenv("OMNYID_FRAMEWORK"),
        "primary_agent_id": profile.get("primary_agent_id"),
    }
    while RUNNING:
        print(json.dumps(heartbeat))
        sys.stdout.flush()
        time.sleep(30)

    print("OmnyID Crew runtime shutting down cleanly")
    sys.stdout.flush()


if __name__ == "__main__":
    main()
