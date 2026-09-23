"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";

type Profile = { handle: string | null; niche: string | null; audience: string | null; followers: number | null };

/** What pitches may say about the creator. Followers are only used if entered. */
export function ProfileCard({ initial }: { initial: Profile }) {
  const [p, setP] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const set = (k: keyof Profile, v: string) =>
    setP((prev) => ({ ...prev, [k]: k === "followers" ? (v === "" ? null : Number(v)) : v || null }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setState("saving");
    await fetch("/api/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(p),
    });
    setState("saved");
  }

  return (
    <details
      className="pop-sm rounded-[2rem] bg-card p-5"
      style={{ "--pop": "var(--sun)" } as React.CSSProperties}
      data-testid="profile-card"
    >
      <summary className="cursor-pointer list-none">
        <span className="font-display text-xl font-extrabold">About you 🙋</span>
        <span className="mt-1 block text-sm text-muted-foreground">
          {p.niche ? `${p.handle ?? "You"} · ${p.niche}` : "Add your niche and audience so pitches sound like you."}
        </span>
      </summary>
      <form onSubmit={save} className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <label className="flex flex-col gap-1.5 font-medium">
          Handle
          <Input value={p.handle ?? ""} onChange={(e) => set("handle", e.target.value)} placeholder="@you" />
        </label>
        <label className="flex flex-col gap-1.5 font-medium">
          Followers (optional)
          <Input
            type="number"
            min={0}
            value={p.followers ?? ""}
            onChange={(e) => set("followers", e.target.value)}
            placeholder="Leave blank to never mention"
          />
        </label>
        <label className="col-span-2 flex flex-col gap-1.5 font-medium">
          Niche
          <Input value={p.niche ?? ""} onChange={(e) => set("niche", e.target.value)} placeholder="e.g. honest skincare routines" />
        </label>
        <label className="col-span-2 flex flex-col gap-1.5 font-medium">
          Audience
          <Input
            value={p.audience ?? ""}
            onChange={(e) => set("audience", e.target.value)}
            placeholder="e.g. UK women 18–30 into affordable skincare"
          />
        </label>
        <button type="submit" className="pop-sm pop-press col-span-2 h-10 rounded-2xl bg-sun font-bold text-on-color" disabled={state === "saving"}>
          {state === "saved" ? "Saved" : state === "saving" ? "Saving…" : "Save"}
        </button>
      </form>
    </details>
  );
}
