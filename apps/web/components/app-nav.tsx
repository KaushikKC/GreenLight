import Link from "next/link";

const LINKS = [
  { href: "/preflight/new", label: "Preflight", key: "preflight" },
  { href: "/rights", label: "Rights", key: "rights" },
  { href: "/brands", label: "Brands", key: "brands" },
] as const;

export function AppNav({ active }: { active?: (typeof LINKS)[number]["key"] }) {
  return (
    <nav className="flex items-center gap-3 text-sm font-semibold" aria-label="Main">
      {LINKS.map((l) => (
        <Link
          key={l.key}
          href={l.href}
          aria-current={active === l.key ? "page" : undefined}
          className={`underline-offset-4 hover:underline ${active === l.key ? "" : "text-muted-foreground"}`}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
