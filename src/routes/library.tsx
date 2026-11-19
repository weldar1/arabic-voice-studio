import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { Download, FileAudio, Mic, Play, Trash2, Type } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { STATUS_LABELS, StatusBadge, isActive, type JobStatus } from "@/client/components/StatusBadge";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/client/components/ui/select";
import { Table, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "@/client/components/ui/table";
import { formatCount, formatDate, formatDuration, formatSeconds, messageOf } from "@/client/lib/format";
import { dialectName, downloadName, voiceName } from "@/lib/catalog";
import { deleteJob, getLibrary } from "@/serverFunctions/library";

const STATUSES = ["queued", "processing", "completed", "ready", "failed", "no_speech"] as const;

export const Route = createFileRoute("/library")({
  validateSearch: z.object({ status: z.enum(STATUSES).optional() }),
  loaderDeps: ({ search }) => ({ status: search.status }),
  loader: ({ deps }) => getLibrary({ data: { status: deps.status } }),
  head: () => ({ meta: [{ title: "Library · Arabic Voice Studio" }] }),
  component: Library,
});

type Job = Awaited<ReturnType<typeof getLibrary>>[number];

const filterItems = [{ value: "all", label: "All" }, ...STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))];

function Library() {
  const jobs = Route.useLoaderData();
  const { status } = Route.useSearch();
  const navigate = useNavigate();
  const router = useRouter();
  const [playing, setPlaying] = useState<Job | null>(null);
  const [deleting, setDeleting] = useState<Job | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const working = jobs.some((job) => isActive(job.status));
  useEffect(() => {
    if (!working) return;
    const timer = setInterval(() => void router.invalidate(), 2000);
    return () => clearInterval(timer);
  }, [working, router]);

  return (
    <AppShell nav={<AppNav />}>
      <PageHeader
        title="Library"
        actions={
          <Select
            items={filterItems}
            value={status ?? "all"}
            onValueChange={(value) =>
              void navigate({ to: "/library", search: value && value !== "all" ? { status: value as JobStatus } : {} })
            }
          >
            <SelectTrigger data-testid="status-filter" aria-label="Status" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {filterItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {playing ? (
        <div className="space-y-2 rounded-xl border border-border bg-card p-4">
          <p className="truncate text-sm font-medium" dir="auto">
            {titleOf(playing)}
          </p>
          <audio data-testid="library-player" key={playing.id} controls autoPlay src={`/files/${playing.id}`} className="w-full" />
        </div>
      ) : null}
      {jobs.length === 0 ? (
        status ? (
          <EmptyState kind="filtered" title={`Nothing ${STATUS_LABELS[status].toLowerCase()}`} />
        ) : (
          <EmptyState
            icon={FileAudio}
            title="Nothing here yet"
            description="Speech you generate and recordings you transcribe are listed here."
            action={<Button render={<Link to="/" />}>Open the studio</Button>}
          />
        )
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Duration</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => {
                const playable = job.hasAudio && (job.kind === "transcription" || job.status === "completed");
                const KindIcon = job.kind === "speech" ? Type : Mic;
                return (
                  <TableRow key={job.id} data-testid="library-row" data-kind={job.kind} data-status={job.status}>
                    <TableCell className="max-w-72">
                      <div className="flex items-start gap-2">
                        <KindIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label={job.kind === "speech" ? "Speech" : "Transcription"} />
                        <div className="min-w-0">
                          {job.kind === "transcription" ? (
                            <Link to="/transcribe/$id" params={{ id: job.id }} className="block truncate font-medium hover:underline" dir="auto">
                              {titleOf(job)}
                            </Link>
                          ) : (
                            <p className="truncate font-medium" dir="auto">
                              {titleOf(job)}
                            </p>
                          )}
                          <p className="truncate text-xs text-muted-foreground">
                            {job.kind === "speech"
                              ? `${dialectName(job.dialect)} · ${voiceName(job.voice)} · ${formatCount(job.characters)} chars`
                              : "Transcription"}{" "}
                            · {formatDate(job.createdAt)}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={job.status as JobStatus} />
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">{formatDuration(job.durationSeconds)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">
                      {isActive(job.status) ? `${formatSeconds(job.reservedSeconds)} held` : formatSeconds(job.chargedSeconds)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {playable ? (
                          <>
                            <Button variant="ghost" size="icon-sm" aria-label="Play" data-testid="library-play" onClick={() => setPlaying(job)}>
                              <Play />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label="Download"
                              render={
                                <a
                                  href={`/files/${job.id}?download=1`}
                                  download={downloadName(job.projectName, job.kind === "speech" ? "speech" : "recording", "mp3")}
                                  data-testid="library-download"
                                />
                              }
                            >
                              <Download />
                            </Button>
                          </>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Delete job"
                          data-testid="library-delete"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleting(job)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableCard>
      )}
      {deleting ? (
        <ConfirmDialog
          title="Delete this job?"
          confirmLabel="Delete"
          destructive
          pending={pending}
          onClose={() => setDeleting(null)}
          onConfirm={() => {
            setPending(true);
            setError(null);
            deleteJob({ data: { id: deleting.id } })
              .then(() => {
                if (playing?.id === deleting.id) setPlaying(null);
                return router.invalidate();
              })
              .catch((cause) => setError(messageOf(cause)))
              .finally(() => {
                setPending(false);
                setDeleting(null);
              });
          }}
        >
          Its audio is deleted too. Seconds already charged stay on this month's usage.
        </ConfirmDialog>
      ) : null}
    </AppShell>
  );
}

function titleOf(job: Job): string {
  return job.projectName || job.fileName || job.excerpt || "Untitled";
}
