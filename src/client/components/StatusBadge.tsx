import { Badge } from "@/client/components/ui/badge";
import { Spinner } from "@/client/components/ui/spinner";

const LOOK = {
  queued: { label: "Queued", variant: "outline" },
  processing: { label: "Processing", variant: "info" },
  completed: { label: "Completed", variant: "success" },
  ready: { label: "Ready", variant: "success" },
  failed: { label: "Failed", variant: "destructive" },
  no_speech: { label: "No speech", variant: "warning" },
} as const;

export type JobStatus = keyof typeof LOOK;

export const STATUS_LABELS = Object.fromEntries(
  Object.entries(LOOK).map(([status, { label }]) => [status, label]),
) as Record<JobStatus, string>;

export const isActive = (status: string) => status === "queued" || status === "processing";

export function StatusBadge({ status, testId }: { status: JobStatus; testId?: string }) {
  const look = LOOK[status];
  return (
    <Badge variant={look.variant} data-testid={testId}>
      {isActive(status) ? <Spinner data-icon="inline-start" /> : null}
      {look.label}
    </Badge>
  );
}
