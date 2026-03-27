'use client';

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function Omnyid() {
  const [email, setEmail] = useState("");
  const [demoStep, setDemoStep] = useState(0);

  const handleDemo = () => {
    setDemoStep((prev) => (prev + 1) % 4);
  };

  return (
    <div className="min-h-screen bg-zinc-950 font-mono text-white">
      <div className="mx-auto max-w-4xl px-6 pt-32 text-center">
        <h1 className="mb-6 text-7xl font-bold tracking-tighter">
          Your email.
          <br />
          Your agent.
          <br />
          Your rules.
        </h1>
        <p className="mb-12 text-2xl text-zinc-400">
          Omnyid gives every agent a real email address that actually works:
          private, encrypted, and able to act.
        </p>

        <div className="flex justify-center gap-4">
          <Button
            size="lg"
            className="bg-white px-10 text-lg text-black"
            onClick={() => {
              window.location.href = "#signup";
            }}
          >
            Get Free Agent ID
          </Button>
          <Button size="lg" variant="outline" onClick={handleDemo}>
            Watch Agent in Action
          </Button>
        </div>
      </div>

      <div className="mx-auto mt-32 max-w-2xl px-6 text-center">
        <p className="mb-8 text-xl text-red-400">Tired of drowning in 11+ hours of email weekly?</p>
        <p className="text-3xl">Google reads your mail. Omnyid never will.</p>
      </div>

      <div className="mx-auto mt-24 grid max-w-5xl grid-cols-3 gap-8 px-6">
        <Card className="border-zinc-800 bg-zinc-900 p-8">
          <h3 className="mb-4 text-xl">End-to-End Encrypted</h3>
          <p className="text-zinc-400">
            Homeserver sees nothing. Only you and intended agents can read messages or attachments,
            even large files.
          </p>
        </Card>
        <Card className="border-zinc-800 bg-zinc-900 p-8">
          <h3 className="mb-4 text-xl">Agent Actions</h3>
          <p className="text-zinc-400">
            One ID lets agents book flights, charge cards, update workspaces, and call real APIs
            through typed, auditable actions.
          </p>
        </Card>
        <Card className="border-zinc-800 bg-zinc-900 p-8">
          <h3 className="mb-4 text-xl">Real Email Gateway</h3>
          <p className="text-zinc-400">
            Send and receive from your own address. Auto-summarise, label, star, archive, and
            forward only what matters.
          </p>
        </Card>
      </div>

      <div className="mx-auto mt-32 max-w-3xl px-6">
        <Card className="border-zinc-800 bg-zinc-900 p-10">
          <h2 className="mb-6 text-2xl">See it work</h2>
          {demoStep === 0 && <p className="text-4xl">Agent receives invoice, auto-labels it, then books payment</p>}
          {demoStep === 1 && <p className="text-4xl">Agent books a Sydney flight through an external travel API</p>}
          {demoStep === 2 && <p className="text-4xl">Agent updates a workspace and stars the receipt</p>}
          {demoStep === 3 && <p className="text-4xl">Only the important summary reaches your real inbox</p>}
          <Button onClick={handleDemo} className="mt-8">
            Next Demo Step
          </Button>
        </Card>
      </div>

      <div id="signup" className="mx-auto mt-32 max-w-md px-6 pb-32">
        <Card className="border-zinc-800 bg-zinc-900 p-10">
          <h3 className="mb-8 text-3xl">Claim your Agent ID free</h3>
          <Input
            placeholder="you@yourdomain.com"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
            }}
            className="mb-6 text-lg"
          />
          <Button
            className="w-full py-8 text-lg"
            onClick={() => {
              alert("Omnyid Agent ID created. Redirecting to dashboard.");
            }}
          >
            Get Omnyid Agent ID Now
          </Button>
          <p className="mt-6 text-center text-xs text-zinc-500">Privacy-first. E2EE target. Yours forever.</p>
        </Card>
      </div>
    </div>
  );
}
