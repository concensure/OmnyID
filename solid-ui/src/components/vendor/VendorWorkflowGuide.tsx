import { For } from "solid-js";

type WorkflowStep = { label: string; vendor: string; couple: string; state: string };

const enquirySteps: WorkflowStep[] = [
  { label: "1. Enquiry", couple: "The couple sends an approved brief.", vendor: "You receive the enquiry and disclosed planning facts.", state: "New" },
  { label: "2. Qualification", couple: "The couple answers only the gaps they choose to share.", vendor: "You confirm fit, date, scope and who should follow up.", state: "Qualified" },
  { label: "3. Quote or tour", couple: "The couple sees the sent quote, terms and appointment status.", vendor: "You prepare a tailored quote or arrange a tour through the existing thread.", state: "Quoted / Tour booked" },
  { label: "4. Follow-up or hold", couple: "A hold is shown as temporary, never as a booking.", vendor: "You record the next action or a bounded hold without losing prior history.", state: "Follow-up / Hold" },
  { label: "5. Contract and deposit", couple: "The couple reviews evidence before approving a commitment.", vendor: "You record the commercial outcome; OmnyID does not infer a booking from a positive message.", state: "Contract / Deposit" },
];

const consultationSteps: WorkflowStep[] = [
  { label: "1. Publish times", couple: "A ranked Celebrant card shows your currently published 10-minute slots.", vendor: "You publish recurring or one-off consultation hours.", state: "Open slot" },
  { label: "2. Couple requests", couple: "They choose a time, review the draft, verify their phone and request it.", vendor: "The request appears with a pending approval state.", state: "Pending approval" },
  { label: "3. You approve", couple: "Their panel updates automatically; email and Calendar confirmation follow.", vendor: "You approve from the signed-in portal after checking the request.", state: "Approved" },
  { label: "4. Call outcome", couple: "They can record whether the call connected and decide the next step.", vendor: "The consultation remains separate from wedding-date availability and a booking.", state: "Connected / Follow-up" },
];

function Workflow(props: { title: string; intro: string; steps: WorkflowStep[] }) {
  return <section class="rounded-xl border border-wedding-muted bg-white p-5 shadow-sm">
    <h3 class="text-lg font-bold">{props.title}</h3>
    <p class="mt-1 text-sm leading-6 text-wedding-muted">{props.intro}</p>
    <ol class="mt-4 grid gap-3">
      <For each={props.steps}>{(step, index) => <li class="relative rounded-xl border border-wedding-muted bg-wedding-surface p-4 sm:grid sm:grid-cols-[9rem_1fr_1fr] sm:gap-4">
        <div><span class="inline-flex h-7 w-7 items-center justify-center rounded-full bg-wedding-accent text-xs font-bold text-white" aria-hidden="true">{index() + 1}</span><strong class="ml-2 text-sm">{step.state}</strong></div>
        <div class="mt-3 sm:mt-0"><span class="text-xs font-bold uppercase tracking-wide text-wedding-accent">Couple sees</span><p class="mt-1 text-sm leading-6">{step.couple}</p></div>
        <div class="mt-3 sm:mt-0"><span class="text-xs font-bold uppercase tracking-wide text-wedding-accent">Vendor does</span><p class="mt-1 text-sm leading-6">{step.vendor}</p></div>
      </li>}</For>
    </ol>
  </section>;
}

export function VendorWorkflowGuide() {
  return <div class="grid gap-5" aria-labelledby="vendor-workflow-guide-title">
    <header class="rounded-xl border border-wedding-muted bg-wedding-surface p-5">
      <p class="text-xs font-bold uppercase tracking-[0.16em] text-wedding-accent">Workflow guide</p>
      <h2 id="vendor-workflow-guide-title" class="mt-1 text-2xl font-bold">What changes for you and the couple</h2>
      <p class="mt-2 text-sm leading-6 text-wedding-muted">These are connected projections of the existing enquiry, availability, quote and Calendar authorities. Drafting never means sending, an open date is not a confirmed booking, and a consultation time is not proof that you can conduct the wedding.</p>
    </header>
    <Workflow title="Enquiry to confirmed work" intro="Sales journeys are not forced into one direction. You can revisit qualification, quote, tour or follow-up while the dated response history stays visible." steps={enquirySteps} />
    <Workflow title="Celebrant 10-minute consultation" intro="This workflow applies to Celebrants. The scoped management link publishes times and aggregate request counts; request details and approval require your claimed account." steps={consultationSteps} />
    <section class="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950"><strong>Two calendars, one management destination.</strong> Wedding-date availability tells couples whether you may be free for their ceremony. Consultation hours tell them when they can ask for a 10-minute call. The secure link shows both sections but never treats one as evidence for the other.</section>
  </div>;
}
