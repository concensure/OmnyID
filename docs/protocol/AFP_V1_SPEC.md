# AFP v1

AFP v1 is the append-only wire protocol used by OmnyID for agent messaging.

Core properties:

- signed messages
- optional encrypted envelopes
- thread-based history
- Agent ID addressing
- transport-neutral delivery over HTTP, WebSocket, and WebTransport

The canonical protobuf schema lives in `proto/afp.proto`.
