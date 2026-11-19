import { Link } from "@tanstack/react-router";

const LINKS = [
  { to: "/", label: "Studio" },
  { to: "/transcribe", label: "Transcribe" },
  { to: "/library", label: "Library" },
  { to: "/drafts", label: "Drafts" },
  { to: "/usage", label: "Usage" },
] as const;

/** The app's pages, in the AppShell bar. */
export function AppNav() {
  return (
    <nav className="-mx-1 flex min-w-0 items-center gap-1 overflow-x-auto">
      {LINKS.map((link) => (
        <Link
          key={link.to}
          to={link.to}
          activeOptions={{ exact: link.to === "/" }}
          className="shrink-0 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground data-[status=active]:bg-muted data-[status=active]:text-foreground"
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
