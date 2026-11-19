import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Download, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { CopyButton } from "@/client/components/CopyButton";
import { EmptyState } from "@/client/components/EmptyState";
import { BackLink, PageHeader } from "@/client/components/PageHeader";
import { StatusBadge, isActive, type JobStatus } from "@/client/components/StatusBadge";
import { Alert, AlertDescription, AlertTitle } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Textarea } from "@/client/components/ui/textarea";
import { formatDuration, formatSeconds, messageOf, saveFile } from "@/client/lib/format";
import { downloadName } from "@/lib/catalog";
import { getTranscription, saveTranscript } from "@/serverFunctions/transcribe";

export const Route = createFileRoute("/transcribe/$id")({
  loader: ({ params }) => getTranscription({ data: { id: params.id } }),
  head: () => ({ meta: [{ title: "Transcript · Arabic Voice Studio" }] }),
  component: TranscriptionPage,
});

type Transcription = NonNullable<Awaited<ReturnType<typeof getTranscription>>>;

function TranscriptionPage() {
  const job = Route.useLoaderData();
  const router = useRouter();
  const active = job ? isActive(job.status) : false;
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => void router.invalidate(), 1500);
    return () => clearInterval(timer);
  }, [active, router]);

  const back = <BackLink to="/transcribe">Transcribe</BackLink>;
  if (!job) {
    return (
      <AppShell nav={<AppNav />}>
        <PageHeader title="Transcript" backLink={back} />
        <EmptyState kind="error" title="Transcription not found" action={<Button render={<Link to="/transcribe" />}>All transcriptions</Button>} />
      </AppShell>
    );
  }
  return (
    <AppShell nav={<AppNav />}>
      <PageHeader
        title={<span dir="auto">{job.fileName}</span>}
        backLink={back}
        description={
          <>
            {formatDuration(job.durationSeconds)}
            {job.chargedSeconds ? <> · {formatSeconds(job.chargedSeconds)} used</> : null}
          </>
        }
        actions={<StatusBadge status={job.status as JobStatus} testId="transcription-status" />}
      />
      <audio data-testid="transcription-audio" controls preload="none" src={`/files/${job.id}`} className="w-full" />
      {job.status === "failed" ? (
        <Alert variant="destructive">
          <AlertDescription>{job.error ?? "Transcription failed."}</AlertDescription>
        </Alert>
      ) : null}
      {job.status === "no_speech" ? (
        <EmptyState title="No speech found in this recording" />
      ) : null}
      {job.status === "ready" ? <Editor key={`${job.id}`} job={job} /> : null}
    </AppShell>
  );
}

function Editor({ job }: { job: Transcription }) {
  const [text, setText] = useState(job.transcript);
  const [revision, setRevision] = useState(job.revision);
  const [conflict, setConflict] = useState<{ revision: number; transcript: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save() {
    setPending(true);
    setError(null);
    try {
      const result = await saveTranscript({ data: { id: job.id, transcript: text, expectedRevision: revision } });
      if (result.ok) {
        setRevision(result.revision);
        setConflict(null);
        toast.success("Transcript saved");
      } else if (result.reason === "conflict") {
        setConflict({ revision: result.revision, transcript: result.transcript });
      } else {
        setError("This transcription no longer exists.");
      }
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="space-y-3">
      {conflict ? (
        <Alert variant="destructive" data-testid="transcript-conflict">
          <AlertTitle>Saved elsewhere first</AlertTitle>
          <AlertDescription>
            <p>Revision {conflict.revision} was saved after you opened this. Your edit wasn't saved.</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => {
                setText(conflict.transcript);
                setRevision(conflict.revision);
                setConflict(null);
              }}
            >
              Load revision {conflict.revision}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      <Textarea
        data-testid="transcript-text"
        aria-label="Transcript"
        dir="rtl"
        lang="ar"
        rows={10}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="min-h-48 text-base leading-relaxed"
      />
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button data-testid="transcript-save" pending={pending} onClick={() => void save()}>
          Save
        </Button>
        <CopyButton value={text} successMessage="Transcript copied" size="default" />
        <Button
          variant="outline"
          data-testid="transcript-download"
          onClick={() => saveFile(downloadName(job.fileName.replace(/\.mp3$/i, ""), "transcript", "txt"), text, "text/plain;charset=utf-8")}
        >
          <Download />
          Download TXT
        </Button>
        {text !== job.rawTranscript ? (
          <Button variant="ghost" onClick={() => setText(job.rawTranscript)}>
            <RotateCcw />
            Original text
          </Button>
        ) : null}
        <span data-testid="transcript-revision" className="ml-auto text-xs text-muted-foreground">
          Revision {revision}
        </span>
      </div>
    </section>
  );
}
