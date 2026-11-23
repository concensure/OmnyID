import test from "node:test";
import assert from "node:assert/strict";

import { parseSyncBootstrapResponse } from "../src/lib/syncBootstrapState.ts";

test("parseSyncBootstrapResponse normalizes valid bootstrap payloads", () => {
  assert.deepEqual(
    parseSyncBootstrapResponse({
      device_class: "desktop",
      profile: "full",
      profile_source: "explicit",
      bootstrap: {
        device_id: " device-1 ",
        agent_id: "agent-1",
        electric_project_url: "https://electric.example",
        encrypted_seed_ref: "seed",
        pglite_path: "idb://omnyid",
      },
      shapes: [
        {
          schema: "public",
          table: "messages",
          local_table: "local_messages",
          where_clause: "user_id = 'u1'",
          requires_key_material: true,
          conflict_mode: "last_write_wins",
        },
      ],
      sync_endpoint: " https://sync.example ",
      electric_url: "https://electric.example",
      requires_local_key_material: true,
    }),
    {
      device_class: "desktop",
      profile: "full",
      profile_source: "explicit",
      bootstrap: {
        device_id: "device-1",
        agent_id: "agent-1",
        electric_project_url: "https://electric.example",
        encrypted_seed_ref: "seed",
        pglite_path: "idb://omnyid",
      },
      shapes: [
        {
          schema: "public",
          table: "messages",
          local_table: "local_messages",
          where_clause: "user_id = 'u1'",
          requires_key_material: true,
          conflict_mode: "last_write_wins",
        },
      ],
      sync_endpoint: "https://sync.example",
      electric_url: "https://electric.example",
      requires_local_key_material: true,
    },
  );
});

test("parseSyncBootstrapResponse rejects missing endpoint and drops malformed shapes", () => {
  assert.equal(parseSyncBootstrapResponse({ shapes: [] }), null);
  assert.deepEqual(
    parseSyncBootstrapResponse({
      sync_endpoint: "https://sync.example",
      shapes: [{ table: "messages" }, { table: "messages", local_table: "local_messages" }],
    })?.shapes,
    [{
      schema: null,
      table: "messages",
      local_table: "local_messages",
      where_clause: null,
      requires_key_material: false,
      conflict_mode: undefined,
    }],
  );
});
