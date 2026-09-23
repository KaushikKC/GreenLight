"use client";

import { ClipboardPaste, FileText, UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CONTRACT_TYPES, MAX_CONTRACT_BYTES } from "@/lib/contract-schema";

type Mode = "file" | "text";

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message ?? "Something went wrong. Try again.");
  return data as T;
}

export function NewContractForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("file");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      let id: string;
      if (mode === "text") {
        ({ id } = await postJson<{ id: string }>("/api/contracts", { source: "text", text }));
      } else {
        if (!file) throw new Error("Choose a PDF or Word file.");
        if (!(file.type in CONTRACT_TYPES)) throw new Error("Upload a PDF or Word (.docx) file.");
        if (file.size > MAX_CONTRACT_BYTES) throw new Error("Files must be under 20 MB.");
        const { key, url } = await postJson<{ key: string; url: string }>("/api/contracts/upload", {
          filename: file.name,
          contentType: file.type,
          sizeBytes: file.size,
        });
        const put = await fetch(url, { method: "PUT", headers: { "content-type": file.type }, body: file });
        if (!put.ok) throw new Error("Upload failed. Check your connection.");
        ({ id } = await postJson<{ id: string }>("/api/contracts", {
          source: CONTRACT_TYPES[file.type as keyof typeof CONTRACT_TYPES],
          key,
          filename: file.name,
        }));
      }
      router.push(`/rights/${id}/review`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  const ready = mode === "file" ? Boolean(file) : text.trim().length >= 40;

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-muted p-1" role="tablist">
        {(
          [
            ["file", "Upload file", FileText],
            ["text", "Paste text", ClipboardPaste],
          ] as const
        ).map(([m, label, Icon]) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition ${
              mode === m ? "bg-card shadow-sm" : "text-muted-foreground"
            }`}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      {mode === "file" ? (
        <label
          htmlFor="contract-file"
          className={`flex cursor-pointer flex-col items-center gap-2 rounded-3xl border-2 border-dashed px-4 py-10 text-center transition ${
            file ? "border-ink bg-violet-soft" : "border-ink/40 bg-card hover:border-ink hover:bg-violet-soft/50"
          }`}
        >
          {file ? <FileText className="size-8 text-go" aria-hidden /> : <UploadCloud className="size-8" aria-hidden />}
          <span className="font-semibold">{file ? file.name : "Choose your contract"}</span>
          <span className="text-xs text-muted-foreground">PDF or Word (.docx), up to 20 MB</span>
          <input
            id="contract-file"
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="sr-only"
            aria-label="Contract file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
      ) : (
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          placeholder="Paste the contract, or the email where the brand set out the deal terms…"
          aria-label="Contract text"
          className="rounded-2xl bg-card"
        />
      )}

      {error && (
        <p role="alert" className="text-sm text-stop">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" disabled={!ready || busy} className="pop pop-press h-14 rounded-2xl bg-violet text-lg font-bold text-on-color hover:bg-violet disabled:opacity-60">
        {busy ? "Reading your contract…" : "Extract the terms"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        You&apos;ll check every term against the contract before anything is saved.
      </p>
    </form>
  );
}
