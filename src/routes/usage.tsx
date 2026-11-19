import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Receipt } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { Progress } from "@/client/components/ui/progress";
import { Table, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "@/client/components/ui/table";
import { formatDate, formatSeconds, messageOf } from "@/client/lib/format";
import { getUsage, setAllowance } from "@/serverFunctions/usage";

export const Route = createFileRoute("/usage")({
  loader: () => getUsage(),
  head: () => ({ meta: [{ title: "Usage · Arabic Voice Studio" }] }),
  component: Usage,
});

function monthName(period: string) {
  return new Date(`${period}-01T00:00:00Z`).toLocaleString("en", { month: "long", year: "numeric", timeZone: "UTC" });
}

function Usage() {
  const { balance, charges, admin, members } = Route.useLoaderData();
  const unlimited = balance.allowanceSeconds === 0;
  const spent = balance.usedSeconds + balance.reservedSeconds;

  return (
    <AppShell nav={<AppNav />}>
      <PageHeader title="Usage" description={`${monthName(balance.period)}, UTC`} />
      <section className="grid gap-3 sm:grid-cols-3">
        <Stat label="Used" value={formatSeconds(balance.usedSeconds)} testId="usage-used" />
        <Stat label="Held by jobs in progress" value={formatSeconds(balance.reservedSeconds)} testId="usage-reserved" />
        <Stat
          label="Remaining"
          value={balance.remainingSeconds === null ? "Unlimited" : formatSeconds(balance.remainingSeconds)}
          testId="usage-remaining"
        />
      </section>
      {!unlimited ? (
        <Progress value={Math.min(100, (spent / balance.allowanceSeconds) * 100)} aria-label="Allowance used" />
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Charges this month</h2>
        {charges.length === 0 ? (
          <EmptyState icon={Receipt} title="No charges this month" />
        ) : (
          <TableCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead className="text-right">Seconds</TableHead>
                  <TableHead>Charged</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {charges.map((charge) => (
                  <TableRow key={charge.id} data-testid="ledger-row">
                    <TableCell className="max-w-64 truncate" dir="auto">
                      {charge.label}
                    </TableCell>
                    <TableCell>{charge.kind === "speech" ? "Speech" : "Transcription"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatSeconds(charge.seconds)}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(charge.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>
        )}
      </section>

      {admin && members ? (
        <>
          <AllowanceForm current={balance.allowanceSeconds} />
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Members this month</h2>
            <TableCard>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead className="text-right">Used</TableHead>
                    <TableHead className="text-right">Held</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((member) => (
                    <TableRow key={member.id} data-testid="member-usage-row">
                      <TableCell>{member.email}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatSeconds(member.usedSeconds)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatSeconds(member.reservedSeconds)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableCard>
          </section>
        </>
      ) : null}
    </AppShell>
  );
}

function Stat({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p data-testid={testId} className="text-xl font-semibold tabular-nums">
        {value}
      </p>
    </div>
  );
}

function AllowanceForm({ current }: { current: number }) {
  const router = useRouter();
  const [value, setValue] = useState(String(current));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seconds = Number(value);
  const valid = value.trim() !== "" && Number.isInteger(seconds) && seconds >= 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly allowance</CardTitle>
        <CardDescription data-testid="allowance-current">
          {current === 0 ? "Unlimited" : `${formatSeconds(current)} per member`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            setPending(true);
            setError(null);
            setAllowance({ data: { seconds } })
              .then(() => {
                toast.success("Allowance saved");
                return router.invalidate();
              })
              .catch((cause) => setError(messageOf(cause)))
              .finally(() => setPending(false));
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="allowance">Seconds per member per month</Label>
            <Input
              id="allowance"
              data-testid="allowance-input"
              type="number"
              min={0}
              step={1}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-48"
            />
          </div>
          <Button type="submit" data-testid="allowance-save" disabled={!valid} pending={pending}>
            Save
          </Button>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">0 means unlimited.</p>
        {error ? (
          <Alert variant="destructive" className="mt-3">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
