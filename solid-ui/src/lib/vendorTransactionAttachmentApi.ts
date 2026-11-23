import { API_BASE, sessionBearerToken } from "@/lib/api";

export const uploadVendorTransactionAttachment = async <TAttachment, TSource>(
  invitationMessageId: string,
  file: File,
): Promise<{ attachment: TAttachment; source: TSource }> => {
  const formData = new FormData();
  formData.append("invitation_message_id", invitationMessageId);
  formData.append("file", file, file.name);
  const headers = new Headers();
  const token = sessionBearerToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_BASE}/api/quotation/vendor-transactions/attachments`, {
    method: "POST",
    headers,
    credentials: "include",
    body: formData,
  });
  const payload = await response.json().catch(() => null) as {
    attachment?: TAttachment;
    source?: TSource;
    detail?: string;
  } | null;
  if (!response.ok || !payload?.attachment || !payload.source) {
    throw new Error(payload?.detail || `Upload failed for ${file.name}`);
  }
  return { attachment: payload.attachment, source: payload.source };
};
