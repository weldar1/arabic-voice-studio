import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { FileAudio, Upload } from "lucide-react";
import { useState } from "react";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { StatusBadge, type JobStatus } from "@/client/components/StatusBadge";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent } from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { formatDate, formatDuration, messageOf } from "@/client/lib/format";
import { UPLOAD_MAX_BYTES } from "@/lib/catalog";
import { getTranscriptions, uploadRecording } from "@/serverFunctions/transcribe";

export const Route = createFileRoute("/transcribe/")({
  loader: () => getTranscriptions(),
  head: () => ({ meta: [{ title: "Transcribe · Arabic Voice Studio" }] }),
  component: Transcribe,
});

function Transcribe() {
  const transcriptions = Route.useLoaderData();
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function upload() {
    if (!file) return;
    setError(null);
    if (file.size > UPLOAD_MAX_BYTES) {
      setError("The file is larger than 5 MB.");
      return;
    }
    setPending(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const { jobId } = await uploadRecording({ data: form });
      await navigate({ to: "/transcribe/$id", params: { id: jobId } });
    } catch (cause) {
      setError(messageOf(cause));
      setPending(false);
    }
  }

  return (
    <AppShell nav={<AppNav />}>
      <PageHeader title="Transcribe" description="Arabic MP3 recordings up to 2 minutes and 5 MB." />
      <Card>
        <CardContent>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void upload();
            }}
          >
            <div className="min-w-0 flex-1 space-y-2">
              <Label htmlFor="transcribe-file">Recording</Label>
              <Input
                id="transcribe-file"
                data-testid="transcribe-file"
                type="file"
                accept=".mp3,audio/mpeg"
                onChange={(e) => {
                  setError(null);
                  setFile(e.target.files?.[0] ?? null);
                }}
              />
            </div>
            <Button type="submit" data-testid="transcribe-submit" disabled={!file} pending={pending}>
              <Upload />
              Transcribe
            </Button>
          </form>
          {error ? (
            <Alert variant="destructive" data-testid="transcribe-error" className="mt-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Transcriptions</h2>
        {transcriptions.length === 0 ? (
          <EmptyState icon={FileAudio} title="No transcriptions yet" description="Upload a recording to get its text." />
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {transcriptions.map((job) => (
              <li key={job.id} data-testid="transcription-row">
                <Link
                  to="/transcribe/$id"
                  params={{ id: job.id }}
                  className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{job.fileName}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDuration(job.durationSeconds)} · {formatDate(job.createdAt)}
                    </p>
                  </div>
                  <StatusBadge status={job.status as JobStatus} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
