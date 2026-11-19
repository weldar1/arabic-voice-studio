/** 75 → "1:15"; null → "—". */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** 3725 → "3,725 s". */
export function formatSeconds(seconds: number): string {
  return `${seconds.toLocaleString("en")} s`;
}

export function formatCount(n: number): string {
  return n.toLocaleString("en");
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

/** The message a server function's error carries. */
export function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) {
    // A validation error arrives as zod's JSON list of issues.
    try {
      const issues = JSON.parse(error.message) as { message?: string }[];
      if (Array.isArray(issues) && issues[0]?.message) return issues[0].message;
    } catch {
      // not JSON
    }
    return error.message;
  }
  return "That didn't work. Try again.";
}

/** Saves `content` as a file on the person's device. */
export function saveFile(name: string, content: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
