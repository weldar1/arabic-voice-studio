import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { FileDown, FilePen, FileUp, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/client/components/ui/dialog";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { formatCount, formatDate, messageOf, saveFile } from "@/client/lib/format";
import { DRAFT_LIMIT, dialectName, voiceName } from "@/lib/catalog";
import { createDraft, deleteDraft, getDrafts, renameDraft } from "@/serverFunctions/drafts";

export const Route = createFileRoute("/drafts")({
  loader: () => getDrafts(),
  head: () => ({ meta: [{ title: "Drafts · Arabic Voice Studio" }] }),
  component: Drafts,
});

type Draft = Awaited<ReturnType<typeof getDrafts>>[number];

/** The exported file: the draft's fields, and a marker import checks for. */
const FORMAT = "arabic-voice-studio/draft@1";

function Drafts() {
  const drafts = Route.useLoaderData();
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<Draft | null>(null);
  const [pending, setPending] = useState(false);

  async function importFile(file: File) {
    setError(null);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(await file.text());
      } catch {
        throw new Error("This file isn't a draft export.");
      }
      if (!parsed || typeof parsed !== "object") throw new Error("This file isn't a draft export.");
      const { format: _format, ...content } = parsed as Record<string, unknown>;
      await createDraft({ data: content });
      toast.success("Draft imported");
      await router.invalidate();
    } catch (cause) {
      const message = messageOf(cause);
      setError(message.startsWith("You have") || message.startsWith("This file") ? message : `This file isn't a valid draft: ${message}`);
    }
  }

  return (
    <AppShell nav={<AppNav />}>
      <PageHeader
        title="Drafts"
        description={`${drafts.length} of ${DRAFT_LIMIT}`}
        actions={
          <>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              className="hidden"
              data-testid="draft-import-input"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void importFile(file);
              }}
            />
            <Button variant="outline" data-testid="draft-import" onClick={() => fileInput.current?.click()}>
              <FileUp />
              Import
            </Button>
          </>
        }
      />
      {error ? (
        <Alert variant="destructive" data-testid="drafts-error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {drafts.length === 0 ? (
        <EmptyState
          title="No drafts yet"
          description="Save one from the studio, or import an exported draft."
          action={<Button render={<Link to="/" />}>Open the studio</Button>}
        />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {drafts.map((draft) => (
            <li key={draft.id} data-testid="draft-row" className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1 space-y-1">
                <Link
                  to="/"
                  search={{ draft: draft.id }}
                  data-testid="draft-open"
                  className="block truncate font-medium hover:underline"
                >
                  {draft.name}
                </Link>
                <p className="truncate text-xs text-muted-foreground">
                  {dialectName(draft.dialect)} · {voiceName(draft.voice)} · {formatCount(draft.text.length)} characters ·{" "}
                  {formatDate(draft.updatedAt)}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" size="sm" data-testid="draft-rename" onClick={() => setRenaming(draft)}>
                  <FilePen />
                  Rename
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  data-testid="draft-export"
                  onClick={() =>
                    saveFile(
                      `${draft.name}.json`,
                      JSON.stringify(
                        {
                          format: FORMAT,
                          name: draft.name,
                          text: draft.text,
                          dialect: draft.dialect,
                          voice: draft.voice,
                          tone: draft.tone,
                          projectName: draft.projectName,
                        },
                        null,
                        2,
                      ),
                      "application/json",
                    )
                  }
                >
                  <FileDown />
                  Export
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${draft.name}`}
                  data-testid="draft-delete"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => setDeleting(draft)}
                >
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {renaming ? (
        <RenameDialog
          draft={renaming}
          onClose={() => setRenaming(null)}
          onDone={async () => {
            setRenaming(null);
            await router.invalidate();
          }}
        />
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title={`Delete "${deleting.name}"?`}
          confirmLabel="Delete"
          destructive
          pending={pending}
          onClose={() => setDeleting(null)}
          onConfirm={() => {
            setPending(true);
            deleteDraft({ data: { id: deleting.id } })
              .then(() => router.invalidate())
              .catch((cause) => setError(messageOf(cause)))
              .finally(() => {
                setPending(false);
                setDeleting(null);
              });
          }}
        />
      ) : null}
    </AppShell>
  );
}

function RenameDialog({ draft, onClose, onDone }: { draft: Draft; onClose: () => void; onDone: () => Promise<void> }) {
  const [name, setName] = useState(draft.name);
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
            renameDraft({ data: { id: draft.id, name: name.trim() } })
              .then(onDone)
              .catch((cause) => {
                setError(messageOf(cause));
                setPending(false);
              });
          }}
        >
          <DialogHeader>
            <DialogTitle>Rename draft</DialogTitle>
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
            <Button type="submit" data-testid="draft-rename-confirm" disabled={!name.trim()} pending={pending}>
              Rename
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
