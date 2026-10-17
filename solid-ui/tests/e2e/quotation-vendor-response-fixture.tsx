import { render } from "solid-js/web";

import { VendorQuotationResponsePanel } from "../../src/components/vendor/VendorQuotationResponsePanel";
import type { VendorContextProjectionView, VendorTransactionInboxItem } from "../../src/lib/vendorQuotationResponseState";
import "../../src/index.css";

const item: VendorTransactionInboxItem = {
  invitation_message_id: "invite-synthetic-1",
  vendor_id: "vendor-synthetic-1",
  grant_id: "grant-synthetic-1",
  quotation_id: "quote-synthetic-1",
  quotation_version_id: "quote-synthetic-1-v2",
  projection_fingerprint: "a".repeat(64),
  expires_at: "2030-10-19T03:00:00Z",
  envelope: {
    protocol: "afp-v1",
    id: "invite-synthetic-1",
    thread_id: "thread-synthetic-1",
    from: "agent:couple@example.com",
    to: ["agent:vendor@example.com"],
    timestamp: "2026-10-18T03:00:00Z",
    type: "wedding_enquiry",
    content: null,
    encryption: {
      scheme: "omnyid-envelope-v1",
      algorithm: "xchacha20poly1305-ietf",
      nonce: "synthetic-ciphertext-only",
      ciphertext: "no-plaintext-on-server",
    },
    views: [],
    references: [],
    attachments: [],
    signature: "signed-fixture",
  },
};

const projection: VendorContextProjectionView = {
  grantId: item.grant_id,
  vendorId: item.vendor_id,
  threadId: item.envelope.thread_id,
  quotationId: item.quotation_id,
  quotationVersionId: item.quotation_version_id,
  projectionFingerprint: item.projection_fingerprint,
  responseRecipientId: "agent:couple@example.com",
  responseRecipientEncryptionPublicKey: "b".repeat(64),
  questions: [{ id: "availability", label: "Are you available on the requested date?" }],
  approvedFields: [{ key: "guest_count", value: 85 }],
};

render(() => (
  <div class="mx-auto min-h-screen max-w-2xl bg-slate-50 p-4 text-slate-950">
    <h1 class="mb-4 text-2xl font-bold">Synthetic claimed vendor</h1>
    <VendorQuotationResponsePanel
      loadTransactions={async () => [item]}
      unlockTransaction={async (candidate) => {
        if (!candidate.envelope.encryption?.ciphertext) throw new Error("Encrypted fixture required");
        return projection;
      }}
      submitResponse={async () => ({ status: "accepted", receipt_id: "receipt-synthetic-1" })}
    />
  </div>
), document.getElementById("root")!);
