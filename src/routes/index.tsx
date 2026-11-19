import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { Download, FileText } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { StatusBadge, isActive, type JobStatus } from "@/client/components/StatusBadge";
import { Alert, AlertDescription, AlertTitle } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent } from "@/client/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
import { Textarea } from "@/client/components/ui/textarea";
import { formatCount, formatDuration, messageOf } from "@/client/lib/format";
import {
  DIALECTS,
  TEXT_LIMIT,
  TONE_LIMIT,
  TONE_PRESETS,
  VOICES,
  dialectName,
  downloadName,
  voiceName,
  type DialectId,
  type VoiceId,
} from "@/lib/catalog";
import { createDraft, updateDraft } from "@/serverFunctions/drafts";
import { generateSpeech, getRecentSpeech, getStudio } from "@/serverFunctions/studio";

export const Route = createFileRoute("/")({
  validateSearch: z.object({ draft: z.string().optional() }),
  loaderDeps: ({ search }) => ({ draftId: search.draft }),
  loader: ({ deps }) => getStudio({ data: { draftId: deps.draftId } }),
  head: () => ({ meta: [{ title: "Studio · Arabic Voice Studio" }] }),
  component: Studio,
});

type Recent = Awaited<ReturnType<typeof getRecentSpeech>>;

const dialectItems = DIALECTS.map((d) => ({ value: d.id, label: d.name }));
const voiceItems = VOICES.map((v) => ({ value: v.id, label: `${v.name} · ${v.description}` }));

function Studio() {
  const { setup, recent: initial, draft } = Route.useLoaderData();
  const [recent, setRecent] = useState<Recent>(initial);
  useEffect(() => setRecent(initial), [initial]);

  // While a job is being made, its card follows it.
  const working = recent.some((job) => isActive(job.status));
  useEffect(() => {
    if (!working) return;
    const timer = setInterval(() => {
      void getRecentSpeech().then(setRecent, () => undefined);
    }, 1500);
    return () => clearInterval(timer);
  }, [working]);

  return (
    <AppShell nav={<AppNav />}>
      <PageHeader title="Studio" description={draft ? <>Draft: {draft.name}</> : null} />
      {!setup.configured ? (
        <Alert data-testid="speech-setup">
          <AlertTitle>Speech isn't set up yet</AlertTitle>
          <AlertDescription>
            <p>{setup.setup ?? "An admin adds an OpenAI key to the Gateway."}</p>
            {setup.command ? (
              <p>
                <code>{setup.command}</code>
              </p>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
      <SpeechForm
        key={draft?.id ?? "new"}
        draft={draft}
        disabled={!setup.configured}
        onQueued={() => void getRecentSpeech().then(setRecent)}
      />
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Recent</h2>
        {recent.length === 0 ? (
          <EmptyState icon={FileText} title="No speech yet" description="Generated audio appears here." />
        ) : (
          <ul className="space-y-3">
            {recent.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}

type Draft = NonNullable<Awaited<ReturnType<typeof getStudio>>["draft"]>;

function SpeechForm({
  draft,
  disabled,
  onQueued,
}: {
  draft: Draft | null;
  disabled: boolean;
  onQueued: () => void;
}) {
  const router = useRouter();
  const navigate = useNavigate();
  const [projectName, setProjectName] = useState(draft?.projectName ?? "");
  const [text, setText] = useState(draft?.text ?? "");
  const [dialect, setDialect] = useState<DialectId>((draft?.dialect as DialectId) ?? "msa");
  const [voice, setVoice] = useState<VoiceId>((draft?.voice as VoiceId) ?? "noor");
  const [tone, setTone] = useState(draft?.tone ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<null | "generate" | "overwrite">(null);
  const [naming, setNaming] = useState(false);

  const tooLong = text.length > TEXT_LIMIT;
  const empty = text.trim().length === 0;
  const content = { text, dialect, voice, tone, projectName };

  async function generate() {
    setError(null);
    setPending("generate");
    try {
      await generateSpeech({ data: content });
      onQueued();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setPending(null);
    }
  }

  async function overwrite() {
    if (!draft) return;
    setError(null);
    setPending("overwrite");
    try {
      await updateDraft({ data: { id: draft.id, ...content } });
      toast.success("Draft saved");
      await router.invalidate();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setPending(null);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="project-name">Project name</Label>
          <Input
            id="project-name"
            data-testid="project-name"
            value={projectName}
            maxLength={120}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="Optional"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="speech-text">Text</Label>
          <Textarea
            id="speech-text"
            data-testid="speech-text"
            dir="rtl"
            lang="ar"
            rows={8}
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-invalid={tooLong || undefined}
            className="min-h-40 text-base leading-relaxed"
          />
          <p
            data-testid="char-count"
            className={tooLong ? "text-right text-xs text-destructive" : "text-right text-xs text-muted-foreground"}
          >
            {formatCount(text.length)} / {formatCount(TEXT_LIMIT)}
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Dialect</Label>
            <Select items={dialectItems} value={dialect} onValueChange={(v) => v && setDialect(v as DialectId)}>
              <SelectTrigger data-testid="dialect-select" className="w-full" aria-label="Dialect">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {dialectItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Voice</Label>
            <Select items={voiceItems} value={voice} onValueChange={(v) => v && setVoice(v as VoiceId)}>
              <SelectTrigger data-testid="voice-select" className="w-full" aria-label="Voice">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["male", "female"] as const).map((gender) => (
                  <SelectGroup key={gender}>
                    <SelectLabel>{gender === "male" ? "Male" : "Female"}</SelectLabel>
                    {VOICES.filter((v) => v.gender === gender).map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name} · {v.description}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="tone-input">Tone</Label>
          <div className="flex flex-wrap gap-2">
            {TONE_PRESETS.map((preset) => (
              <Button
                key={preset.label}
                type="button"
                size="sm"
                variant={tone === preset.text ? "secondary" : "outline"}
                aria-pressed={tone === preset.text}
                onClick={() => setTone(tone === preset.text ? "" : preset.text)}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          <Input
            id="tone-input"
            data-testid="tone-input"
            value={tone}
            maxLength={TONE_LIMIT}
            onChange={(e) => setTone(e.target.value)}
            placeholder="Optional, e.g. slow and reassuring"
          />
        </div>
        {error ? (
          <Alert variant="destructive" data-testid="form-error">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            data-testid="generate-button"
            disabled={disabled || empty || tooLong}
            pending={pending === "generate"}
            onClick={() => void generate()}
          >
            Generate speech
          </Button>
          {draft ? (
            <Button
              variant="outline"
              data-testid="draft-overwrite"
              disabled={tooLong}
              pending={pending === "overwrite"}
              onClick={() => void overwrite()}
            >
              Save draft
            </Button>
          ) : null}
          <Button
            variant="outline"
            data-testid="save-draft-button"
            disabled={tooLong}
            onClick={() => setNaming(true)}
          >
            {draft ? "Save as new draft" : "Save as draft"}
          </Button>
        </div>
      </CardContent>
      {naming ? (
        <NameDraftDialog
          initial={draft ? `${draft.name} (copy)` : projectName}
          onClose={() => setNaming(false)}
          onSave={async (name) => {
            const { id } = await createDraft({ data: { name, ...content } });
            setNaming(false);
            toast.success("Draft saved");
            await navigate({ to: "/", search: { draft: id } });
          }}
        />
      ) : null}
    </Card>
  );
}

function NameDraftDialog({
  initial,
  onClose,
  onSave,
}: {
  initial: string;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            setPending(true);
            setError(null);
            onSave(name.trim()).catch((cause) => {
              setError(messageOf(cause));
              setPending(false);
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Save as draft</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="draft-name">Name</Label>
            <Input id="draft-name" data-testid="draft-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button type="submit" data-testid="draft-save-confirm" disabled={!name.trim()} pending={pending}>
              Save draft
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function JobCard({ job }: { job: Recent[number] }) {
  const title = job.projectName || job.excerpt;
  const file = downloadName(job.projectName, "speech", "mp3");
  return (
    <li data-testid="job-card" data-status={job.status} className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="truncate font-medium" dir="auto">
            {title}
          </p>
          <p className="text-xs text-muted-foreground">
            {dialectName(job.dialect)} · {voiceName(job.voice)} · {formatCount(job.characters)} characters
            {job.durationSeconds != null ? <> · {formatDuration(job.durationSeconds)}</> : null}
          </p>
        </div>
        <StatusBadge status={job.status as JobStatus} testId="job-status" />
      </div>
      {job.status === "completed" ? (
        <div className="flex flex-wrap items-center gap-3">
          <audio data-testid="job-audio" controls preload="none" src={`/files/${job.id}`} className="h-9 min-w-0 flex-1" />
          <Button
            variant="outline"
            size="sm"
            render={<a href={`/files/${job.id}?download=1`} download={file} data-testid="job-download" />}
          >
            <Download />
            Download MP3
          </Button>
        </div>
      ) : null}
      {job.status === "failed" && job.error ? (
        <p data-testid="job-error" className="text-sm text-destructive">
          {job.error}
        </p>
      ) : null}
    </li>
  );
}
