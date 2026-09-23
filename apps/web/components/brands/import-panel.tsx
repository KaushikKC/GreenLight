"use client";

import { ClipboardPaste, FileSpreadsheet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Mode = "paste" | "csv";

const EXAMPLE = `https://www.tiktok.com/@you/video/123 2026-09-10 | morning routine with @theordinary niacinamide
https://www.instagram.com/p/abc 2026-08-28 | matcha + @oatly barista, every day`;

export function ImportPanel({ open: startOpen }: { open: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("paste");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/posts/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ format: mode, text }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMessage({ ok: false, text: data.message ?? "Couldn't import those posts." });
      return;
    }
    const parts = [`${data.imported} new post${data.imported === 1 ? "" : "s"} imported`];
    if (data.duplicates) parts.push(`${data.duplicates} already here`);
    setMessage({ ok: true, text: parts.join(", ") + ". Scanning for brands…" });
    setText("");
    setFileName(null);
    router.refresh();
  }

  async function readFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    setText(await file.text());
  }

  return (
    <details open={startOpen} className="group rounded-3xl border bg-card p-5" data-testid="import-panel">
      <summary className="cursor-pointer list-none">
        <span className="font-display text-xl font-semibold">Import your posts</span>
        <span className="mt-1 block text-sm text-muted-foreground">
          Paste links with captions, or upload a CSV. We only read what you give us: no scraping.
        </span>
      </summary>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-muted p-1" role="tablist">
          {(
            [
              ["paste", "Paste", ClipboardPaste],
              ["csv", "CSV file", FileSpreadsheet],
            ] as const
          ).map(([m, label, Icon]) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => {
                setMode(m);
                setText("");
                setFileName(null);
              }}
              className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl text-sm font-semibold ${
                mode === m ? "bg-card shadow-sm" : "text-muted-foreground"
              }`}
            >
              <Icon className="size-4" aria-hidden /> {label}
            </button>
          ))}
        </div>
        {mode === "paste" ? (
          <>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={7}
              placeholder={EXAMPLE}
              aria-label="Posts to import"
              className="rounded-2xl font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              One post per link. Put the caption after the link (optionally with a date), or on the lines below it.
            </p>
          </>
        ) : (
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-6 text-center">
            <FileSpreadsheet className="size-6" aria-hidden />
            <span className="text-sm font-semibold">{fileName ?? "Choose a CSV"}</span>
            <span className="text-xs text-muted-foreground">Columns: url, posted_at, caption</span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              aria-label="Posts CSV"
              onChange={(e) => {
                readFile(e.target.files?.[0]);
                // Allow picking the same file again later.
                e.target.value = "";
              }}
            />
          </label>
        )}
        {message && (
          <p role="status" className={`text-sm ${message.ok ? "text-go" : "text-stop"}`} data-testid="import-message">
            {message.text}
          </p>
        )}
        <Button type="submit" disabled={!text.trim() || busy} className="h-11 rounded-2xl font-semibold">
          {busy ? "Importing…" : "Import and find brands"}
        </Button>
      </form>
    </details>
  );
}
