export type WeddingCelebrantConsultationDraftContext = {
  vendorSlug: string;
  scheduledStart: string;
  timezone: "Australia/Sydney";
  consultationMinutes: 10;
};

export function weddingCelebrantConsultationTimeLabel(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Australia/Sydney",
    timeZoneName: "short",
  });
}

export function withWeddingCelebrantConsultationContext(
  body: string,
  context: WeddingCelebrantConsultationDraftContext | null | undefined,
): string {
  if (!context?.scheduledStart) return body;
  const label = weddingCelebrantConsultationTimeLabel(context.scheduledStart);
  if (body.includes(context.scheduledStart) || body.toLowerCase().includes(label.toLowerCase())) return body;
  return `${body.trim()}\n\nWe would like to request your published ${context.consultationMinutes}-minute phone consultation on ${label}. Please let us know if you can approve this time.`;
}

export function weddingCelebrantConsultationSubject(
  subject: string,
  context: WeddingCelebrantConsultationDraftContext | null | undefined,
): string {
  if (!context?.scheduledStart) return subject;
  const label = weddingCelebrantConsultationTimeLabel(context.scheduledStart);
  return subject.toLowerCase().includes(label.toLowerCase())
    ? subject
    : `${subject} — consultation ${label}`;
}
