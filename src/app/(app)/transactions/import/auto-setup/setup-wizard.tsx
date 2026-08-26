'use client'

import { useActionState, useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { MapleLabel } from '@/components/ui/label'
import { formatDate } from '@/lib/format'
import {
  rotateSecret,
  saveRule,
  deleteRule,
  suggestFromSample,
  sendTestEmail,
  getRecentLog,
  addBankPreset,
  saveSyncUrl,
  triggerGmailSync,
  type RotateSecretState,
  type RuleFormState,
  type TestEmailState,
  type SaveSyncUrlState,
  type SyncNowState,
} from './actions'
import { BANK_PRESETS } from '@/lib/bank-presets'
import { ConfirmButton } from '@/components/ui/confirm-button'
import { DataTable } from '@/components/ui/data-table'
import { Button } from '@/components/ui/button'

type Account = { id: string; name: string; last_four: string | null }
type Member = { id: string; name: string }
type Category = { id: string; name: string; code: string; parent_id: string | null }

type Rule = {
  id: string
  name: string
  enabled: boolean
  match_from: string | null
  match_subject: string | null
  amount_regex: string
  description_regex: string | null
  date_regex: string | null
  direction: 'outflow' | 'inflow' | 'auto'
  inflow_regex: string | null
  account_router_regex: string | null
  default_account_id: string | null
  default_member_id: string | null
  default_category_id: string | null
}

type LogEntry = {
  id: string
  received_at: string
  from_address: string | null
  subject: string | null
  status: string
  error_detail: string | null
  transaction_id: string | null
}

const STARTER_TEMPLATES: Array<{
  label: string
  value: Partial<Rule> & { name: string; amount_regex: string; direction: Rule['direction'] }
}> = [
  {
    label: 'Generic - “transaction of $X.XX at MERCHANT”',
    value: {
      name: 'Generic transaction alert',
      enabled: true,
      match_from: '',
      match_subject: '',
      amount_regex: '\\$([0-9,]+\\.[0-9]{2})',
      description_regex: 'at\\s+([A-Z0-9 .&\\-\']{2,})',
      date_regex: '',
      direction: 'auto',
      inflow_regex: '(deposit|credit|received|refund|e\\-?transfer received)',
    },
  },
  {
    label: 'RBC - debit / credit card alerts',
    value: {
      name: 'RBC card alerts',
      enabled: true,
      match_from: '(donotreply|alerts)@(rbc|royalbank)\\.com',
      match_subject: '(transaction|purchase|withdrawal|deposit) (alert|notification)',
      amount_regex: '\\$([0-9,]+\\.[0-9]{2})',
      description_regex: 'at\\s+([^\\n\\r.]{2,80})',
      date_regex: '',
      direction: 'auto',
      inflow_regex: '(deposit|credit|payment received)',
    },
  },
  {
    label: 'TD - EasyWeb alerts',
    value: {
      name: 'TD EasyWeb alerts',
      enabled: true,
      match_from: 'easyweb@td\\.com',
      match_subject: '(purchase|withdrawal|deposit|transaction)',
      amount_regex: '\\$([0-9,]+\\.[0-9]{2})',
      description_regex: 'at\\s+([^\\n\\r.]{2,80})',
      date_regex: '',
      direction: 'auto',
      inflow_regex: '(deposit|credit|received)',
    },
  },
]

export function SetupWizard({
  webhookUrl,
  hasSecret,
  gmailSyncUrl,
  accounts,
  members,
  categories,
  rules,
  log,
}: {
  webhookUrl: string
  hasSecret: boolean
  gmailSyncUrl: string | null
  accounts: Account[]
  members: Member[]
  categories: Category[]
  rules: Rule[]
  log: LogEntry[]
}) {
  const [editingRule, setEditingRule] = useState<Rule | 'new' | null>(null)
  // The secret is shown once, right after generation. Hold it in memory so
  // step 3 can bake it straight into the Apps Script - the user never has to
  // copy the key into a script property by hand. Lost on refresh by design
  // (we never re-fetch it from the server), which keeps the "shown once" model.
  const [freshSecret, setFreshSecret] = useState<string | null>(null)

  // Per-step completion, derived from the same server props the wizard already
  // receives. Presentation only - nothing here changes how the script or secret
  // are generated.
  //  1. Secret exists (already set, or freshly minted this session).
  //  2. Bank alerts: a manual toggle at the bank - can't be detected, so it
  //     stays informational ('manual'), never blocking.
  //  3. Script install depends on a secret being available to bake in.
  //  4. At least one rule defined.
  //  5. Something has actually arrived (a log entry) or on-demand sync is wired.
  const secretReady = hasSecret || !!freshSecret
  const hasRules = rules.length > 0
  const hasArrived = log.length > 0
  const stepStatus: Record<number, StepStatus> = {
    1: secretReady ? 'done' : 'todo',
    2: 'manual',
    3: secretReady ? 'done' : 'todo',
    4: hasRules ? 'done' : 'todo',
    5: hasArrived ? 'done' : 'todo',
  }

  // Count the auto-detectable steps that are done (steps 1, 3, 4, 5 - step 2 is
  // a manual bank toggle we can't verify, so it's excluded from the tally).
  const trackable = [1, 3, 4, 5]
  const doneCount = trackable.filter((n) => stepStatus[n] === 'done').length
  const progress = doneCount / trackable.length

  return (
    <div className="flex flex-col gap-5">
      <ProgressSummary doneCount={doneCount} total={trackable.length} progress={progress} />

      <Step n={1} title="Generate your private webhook" status={stepStatus[1]}>
        <SecretCard webhookUrl={webhookUrl} hasSecret={hasSecret} onSecret={setFreshSecret} />
      </Step>

      <Step
        n={2}
        title="Turn on transaction alerts at your bank"
        status={stepStatus[2]}
      >
        <BankAlertHelp />
      </Step>

      <Step n={3} title="Install the Gmail Apps Script" status={stepStatus[3]}>
        <GmailScriptCard webhookUrl={webhookUrl} secret={freshSecret} />
      </Step>

      <Step
        n={4}
        title="Define how each email becomes a transaction"
        status={stepStatus[4]}
        hint={hasRules ? `${rules.length} rule${rules.length === 1 ? '' : 's'} defined` : undefined}
      >
        <RulesSection
          rules={rules}
          accounts={accounts}
          members={members}
          categories={categories}
          editing={editingRule}
          onEdit={setEditingRule}
        />
      </Step>

      <Step
        n={5}
        title="Test it, then watch alerts arrive"
        status={stepStatus[5]}
        hint={hasArrived ? `${log.length} entr${log.length === 1 ? 'y' : 'ies'} logged` : undefined}
      >
        <VerifyLog log={log} gmailSyncUrl={gmailSyncUrl} />
      </Step>
    </div>
  )
}

type StepStatus = 'todo' | 'done' | 'manual'

// Top-of-wizard tally so the user sees how far along setup is at a glance.
function ProgressSummary({
  doneCount,
  total,
  progress,
}: {
  doneCount: number
  total: number
  progress: number
}) {
  const allDone = doneCount >= total
  return (
    <div
      className={`flex flex-col gap-2 rounded-md border px-4 py-3 ${
        allDone ? 'border-leaf bg-leaf-tint' : 'border-hair bg-cream-2'
      }`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span
          className={`text-[10.5px] font-bold uppercase tracking-[0.08em] ${
            allDone ? 'text-leaf-deep' : 'text-ink-3'
          }`}
        >
          Setup progress
        </span>
        <span className="font-serif text-[14px] tabular-nums text-ink">
          {doneCount} / {total} {allDone ? '· ready' : 'done'}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-paper">
        <div
          role="progressbar"
          aria-valuenow={doneCount}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-label="Auto-import setup progress"
          className="h-full rounded-full bg-leaf"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
    </div>
  )
}

// ─── Step 1 - Secret ──────────────────────────────────────────────────────

function SecretCard({
  webhookUrl,
  hasSecret,
  onSecret,
}: {
  webhookUrl: string
  hasSecret: boolean
  onSecret: (secret: string) => void
}) {
  const [state, formAction, pending] = useActionState<RotateSecretState, FormData>(
    rotateSecret,
    undefined,
  )
  const [copied, setCopied] = useState<'url' | 'secret' | null>(null)

  function copy(value: string, key: 'url' | 'secret') {
    navigator.clipboard?.writeText(value).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(null), 1500)
    })
  }

  const newlyMintedSecret = state && 'ok' in state && state.ok ? state.secret : null

  // Hand the freshly-minted secret up so step 3 bakes it into the script.
  useEffect(() => {
    if (newlyMintedSecret) onSecret(newlyMintedSecret)
  }, [newlyMintedSecret, onSecret])

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13.5px] leading-relaxed text-ink-2">
        Your webhook URL is fixed - your secret rotates each time you press the button.
        The secret is shown <b>once</b> right after generation. Copy it into the Gmail
        script in step 3, then we&rsquo;ll never display it again.
      </p>

      <div className="grid gap-3">
        <CopyField
          label="Webhook URL"
          value={webhookUrl}
          copied={copied === 'url'}
          onCopy={() => copy(webhookUrl, 'url')}
        />
        {newlyMintedSecret ? (
          <CopyField
            label="Your new secret - copy now"
            value={newlyMintedSecret}
            copied={copied === 'secret'}
            onCopy={() => copy(newlyMintedSecret, 'secret')}
            tone="warn"
          />
        ) : (
          <div
            className={`rounded-md border border-hair px-4 py-3 ${
              hasSecret ? 'bg-leaf-tint' : 'bg-cream-2'
            }`}
          >
            <div
              className={`text-[10.5px] font-bold uppercase tracking-[0.08em] ${
                hasSecret ? 'text-leaf' : 'text-ink-3'
              }`}
            >
              Secret
            </div>
            <div className="mt-1 text-[13px] text-ink-2">
              {hasSecret
                ? 'A secret is set. Press the button to rotate it (you’ll need to update the Gmail script if you do).'
                : 'No secret yet - press the button to generate one.'}
            </div>
          </div>
        )}
      </div>

      <form action={formAction}>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? 'Generating…' : hasSecret ? 'Rotate secret' : 'Generate secret'}
          {!pending && <span aria-hidden>→</span>}
        </Button>
      </form>

      <div aria-live="polite" role="status">
        {state && 'error' in state && state.error && (
          <p className="rounded-md bg-maple-soft px-3 py-1.5 text-[12.5px] font-medium text-maple">
            {state.error}
          </p>
        )}
      </div>
    </div>
  )
}

function CopyField({
  label,
  value,
  copied,
  onCopy,
  tone,
}: {
  label: string
  value: string
  copied: boolean
  onCopy: () => void
  tone?: 'warn'
}) {
  const isWarn = tone === 'warn'
  return (
    <div
      className={`flex flex-col gap-1.5 rounded-md border px-4 py-3 ${
        isWarn ? 'border-honey bg-paper-2' : 'border-hair bg-paper'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
          {label}
        </span>
        <button
          type="button"
          onClick={onCopy}
          aria-label={`Copy ${label}`}
          className="inline-flex min-h-[44px] items-center text-[11.5px] font-semibold text-ink-2 underline-offset-2 hover:text-ink hover:underline"
        >
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
      </div>
      <code className="block break-all font-mono text-[12px] text-ink">{value}</code>
    </div>
  )
}

// ─── Step 2 - Bank instructions ───────────────────────────────────────────

function BankAlertHelp() {
  const banks = [
    { name: 'RBC', steps: 'Online Banking → Profile & settings → Alerts → Card transaction alerts → set threshold to $0.01.' },
    { name: 'TD', steps: 'EasyWeb → My Accounts → Alerts → Set up alerts → Purchase / Withdrawal alerts.' },
    { name: 'BMO', steps: 'Online Banking → My Profile → Alerts & subscriptions → Account & card alerts.' },
    { name: 'Scotiabank', steps: 'Scotia OnLine → Alerts → Card alerts / Account alerts.' },
    { name: 'CIBC', steps: 'Online Banking → My profile → Alerts → Card alerts / Spending alerts.' },
    { name: 'National Bank', steps: 'Online Banking → Profile → Notifications → Transaction notifications.' },
  ]

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13.5px] leading-relaxed text-ink-2">
        Set the alert threshold to <b>$0.01</b> so every transaction triggers an email.
        These usually arrive within 30 seconds of the swipe / tap / e-transfer.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {banks.map((b) => (
          <div
            key={b.name}
            className="rounded-md border border-hair bg-paper px-4 py-3"
          >
            <div className="font-serif text-[15px] tracking-[-0.01em] text-ink">
              {b.name}
            </div>
            <div className="mt-1 text-[12.5px] leading-relaxed text-ink-2">
              {b.steps}
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-md bg-cream-2 px-4 py-3 text-[12.5px] leading-relaxed text-ink-2">
        <b className="text-ink">Tip:</b> create a Gmail filter that
        labels these alerts (e.g. <code className="rounded bg-paper px-1.5 py-0.5 font-mono text-[11.5px]">label:bank-alerts</code>) so the
        Apps Script in step 3 only sees them.
      </div>
    </div>
  )
}

// ─── Step 3 - Gmail Apps Script ───────────────────────────────────────────

function GmailScriptCard({ webhookUrl, secret }: { webhookUrl: string; secret: string | null }) {
  const [copied, setCopied] = useState(false)
  const code = appsScriptCode(webhookUrl, secret)

  function copy() {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {secret ? (
        <div className="rounded-md border border-leaf bg-leaf-tint px-3 py-2 text-[12px] font-medium text-leaf-deep">
          ✓ Your secret is already baked into the script below - no script property to set.
          Just paste, run <code className="rounded bg-paper px-1.5 py-0.5 font-mono text-[11px]">setup</code>, done.
        </div>
      ) : (
        <div className="rounded-md border border-honey bg-paper-2 px-3 py-2 text-[12px] leading-relaxed text-ink-2">
          Press <b>Rotate secret</b> in step 1 and the script below comes back with your key
          already baked in - nothing to copy. Otherwise set the{' '}
          <code className="rounded bg-cream-2 px-1.5 py-0.5 font-mono text-[11px]">SECRET</code> script
          property by hand (step 3 below).
        </div>
      )}

      <ol className="ml-5 list-decimal space-y-1 text-[13.5px] leading-relaxed text-ink-2">
        <li>
          Open{' '}
          <a
            href="https://script.google.com/home"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-ink underline-offset-2 hover:underline"
          >
            script.google.com
          </a>
          {' '}and click <b>New project</b>.
        </li>
        <li>Replace the contents of <code className="rounded bg-cream-2 px-1.5 py-0.5 font-mono text-[11.5px]">Code.gs</code> with the script below{secret ? ' (secret already baked in)' : ''}.</li>
        {!secret && (
          <li>
            Set <code className="rounded bg-cream-2 px-1.5 py-0.5 font-mono text-[11.5px]">SECRET</code> in <b>Project Settings → Script properties</b>
            {' '}to the secret from step 1. <span className="text-ink-3">(Or rotate the secret to skip this - see note above.)</span>
          </li>
        )}
        <li>
          <b>Label your alerts in Gmail.</b> Gmail → Settings → Filters → create a filter on
          your bank&rsquo;s sender, then <b>Apply label</b> →{' '}
          <code className="rounded bg-cream-2 px-1.5 py-0.5 font-mono text-[11.5px]">bank-alerts</code>.
          {' '}<span className="text-ink-3"><code className="font-mono">setup</code> creates this label for you, but only a filter routes mail into it. Tick &ldquo;also apply to matching conversations&rdquo; to backfill existing alerts.</span>
        </li>
        <li>
          In the editor, pick <code className="rounded bg-cream-2 px-1.5 py-0.5 font-mono text-[11.5px]">setup</code> from the
          function dropdown and click <b>Run</b>. Approve Gmail access when prompted -
          this creates the label, installs the <b>hourly</b> trigger, and pulls existing alerts right away.
          {' '}<span className="text-ink-3">(One run does everything. Hourly is plenty; you can also pull on demand from the app.)</span>
        </li>
        <li>
          <b>For on-demand sync:</b> click <b>Deploy → New deployment</b> → type <b>Web app</b>,
          execute as <i>Me</i>, who has access <i>Anyone with the link</i>. Copy the resulting
          <code className="rounded bg-cream-2 mx-1 px-1.5 py-0.5 font-mono text-[11.5px]">/exec</code> URL and paste it into Maple in step 5 - that&rsquo;s what
          powers the &ldquo;Sync now&rdquo; button.
        </li>
      </ol>

      <div className="overflow-hidden rounded-md border border-hair">
        <div className="flex items-center justify-between border-b border-hair bg-cream-2 px-4 py-2">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
            Code.gs
          </span>
          <button
            type="button"
            onClick={copy}
            aria-label="Copy the Gmail Apps Script"
            className="inline-flex min-h-[44px] items-center text-[11.5px] font-semibold text-ink-2 underline-offset-2 hover:text-ink hover:underline"
          >
            {copied ? 'Copied ✓' : 'Copy'}
          </button>
        </div>
        <pre className="overflow-x-auto bg-paper px-4 py-3 font-mono text-[11.5px] leading-relaxed text-ink">
{code}
        </pre>
      </div>
    </div>
  )
}

function appsScriptCode(webhookUrl: string, secret: string | null): string {
  // The secret is 64 hex chars (gen_random_bytes(32) → hex), so it is safe to
  // drop straight into a single-quoted JS literal - no escaping needed.
  const bakedSecret = secret ?? ''
  return `// Forwards Gmail messages labelled "bank-alerts" to Maple.
//
// EASIEST SETUP - pick "setup" in the function dropdown above and click Run, once.
// It creates the Gmail label, installs the hourly trigger, authorizes Gmail, and
// pulls your existing alerts immediately. Nothing else to configure.
//
// Script properties (optional overrides):
//   SECRET        - your Maple webhook secret. Baked in below when you copy the
//                   script right after pressing "Generate/Rotate secret";
//                   otherwise set it here (Project Settings ▸ Script properties).
//   LABEL_NAME    - Gmail label to scan; defaults to "bank-alerts".
//   LOOKBACK_DAYS - how far back to scan each run; defaults to 30. Bump to 365
//                   once for a one-time backfill, then lower it again.
//
// Note: GmailApp only supports labels at the thread level, and bank alerts
// with identical subjects often share a thread - so we do NOT track "already
// imported" with a label (that would drop later alerts in a reused thread).
// Instead we re-scan recent labelled mail each run and let Maple dedup by
// message-id (it returns "duplicate" for anything already imported). Safe to
// run as often as you like.

const WEBHOOK_URL = '${webhookUrl}';
const SECRET = '${bakedSecret}';

// ── Run this ONCE ──────────────────────────────────────────────────────────
// Pick "setup" in the function dropdown, click Run, approve Gmail access.
// Persists the secret, creates the label, installs the hourly trigger, and
// pulls your existing alerts right now.
function setup() {
  if (SECRET) PropertiesService.getScriptProperties().setProperty('SECRET', SECRET);
  ensureLabel_(labelName_());
  installTrigger();
  const result = forwardBankAlerts();
  Logger.log('Setup complete. First run: ' + JSON.stringify(result));
  return result;
}

// (Re)creates the hourly trigger. setup() calls this; you can also run it on
// its own to reinstall the schedule.
function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'forwardBankAlerts') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('forwardBankAlerts').timeBased().everyHours(1).create();
}

function labelName_() {
  return PropertiesService.getScriptProperties().getProperty('LABEL_NAME') || 'bank-alerts';
}

function secret_() {
  return SECRET || PropertiesService.getScriptProperties().getProperty('SECRET') || '';
}

// Make the label exist so it shows up in Gmail's filter UI and the search never
// errors. A Gmail filter is still what routes incoming mail into it.
function ensureLabel_(name) {
  if (!GmailApp.getUserLabelByName(name)) GmailApp.createLabel(name);
}

function forwardBankAlerts() {
  const secret = secret_();
  if (!secret) throw new Error('No secret set. In Maple, press "Generate/Rotate secret", re-copy this script (the key bakes in), and run setup - or set the SECRET script property by hand.');
  const labelName = labelName_();
  const lookback = PropertiesService.getScriptProperties().getProperty('LOOKBACK_DAYS') || '30';
  const query = 'label:' + labelName + ' newer_than:' + lookback + 'd';

  let imported = 0;
  let duplicates = 0;
  let unmatched = 0;
  let failures = 0;

  let start = 0;
  const PAGE = 50;
  while (true) {
    const threads = GmailApp.search(query, start, PAGE);
    if (threads.length === 0) break;
    for (const thread of threads) {
      const messages = thread.getMessages();
      for (const msg of messages) {
        const payload = {
          secret: secret,
          from: msg.getFrom(),
          subject: msg.getSubject(),
          body: msg.getPlainBody(),
          message_id: msg.getId(),
          received_at: msg.getDate().toISOString(),
        };
        const res = UrlFetchApp.fetch(WEBHOOK_URL, {
          method: 'post',
          contentType: 'application/json',
          payload: JSON.stringify(payload),
          muteHttpExceptions: true,
        });
        const code = res.getResponseCode();
        if (code === 401) {
          // Bad/stale secret. Stop loudly instead of silently dropping every
          // alert - rotate in Maple, re-copy the script, and run setup again.
          throw new Error('Maple rejected the secret (HTTP 401). In Maple, press "Generate/Rotate secret", re-copy this script, and run setup again.');
        }
        if (code !== 200) {
          failures++;
          continue; // 5xx / network - leave it for the next run to retry
        }
        let status = '';
        try { status = JSON.parse(res.getContentText()).status || ''; } catch (e) {}
        if (status === 'inserted') imported++;
        else if (status === 'duplicate') duplicates++;
        else if (status === 'no_match') unmatched++;
        else failures++; // parse_error etc - visible in Maple's ingestion log
      }
    }
    if (threads.length < PAGE) break;
    start += PAGE;
  }
  return { imported: imported, skipped: duplicates, unmatched: unmatched, failures: failures };
}

// HTTP entry point - deploy this script as a Web App (Deploy → New
// deployment → type: Web App, execute as Me, who has access: Anyone with
// the link). Maple's "Sync now" button calls the resulting URL.
function doGet() {
  const result = forwardBankAlerts();
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, result: result }))
    .setMimeType(ContentService.MimeType.JSON);
}
`
}

// ─── Step 4 - Rules ───────────────────────────────────────────────────────

function RulesSection({
  rules,
  accounts,
  members,
  categories,
  editing,
  onEdit,
}: {
  rules: Rule[]
  accounts: Account[]
  members: Member[]
  categories: Category[]
  editing: Rule | 'new' | null
  onEdit: (r: Rule | 'new' | null) => void
}) {
  const [, startTransition] = useTransition()
  const [presetPending, setPresetPending] = useState<string | null>(null)
  const [presetError, setPresetError] = useState<string | null>(null)

  function addPreset(presetId: string) {
    setPresetError(null)
    setPresetPending(presetId)
    startTransition(async () => {
      const result = await addBankPreset(presetId)
      setPresetPending(null)
      if (result && 'error' in result) setPresetError(result.error)
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13.5px] leading-relaxed text-ink-2">
        One rule per bank routes to all your accounts there - set the last 4
        digits on each account in <Link href="/accounts" className="font-semibold text-ink underline-offset-2 hover:underline">Accounts</Link>{' '}
        and the engine sends each alert to the right one.
      </p>

      <div className="rounded-md border border-leaf bg-leaf-tint p-4">
        <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-leaf-deep">
          Quick start: pick your bank
        </div>
        <p className="mt-1 text-[12.5px] text-ink-2">
          One click installs a tuned rule for that bank. You can tweak it after.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {BANK_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => addPreset(p.id)}
              disabled={presetPending !== null}
              title={p.hint}
              aria-label={`Add ${p.label} rule preset`}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-leaf bg-paper px-3.5 py-1.5 text-[12.5px] font-semibold text-leaf-deep transition-transform active:scale-[0.97] disabled:opacity-50"
            >
              {presetPending === p.id ? 'Adding…' : `+ ${p.label}`}
            </button>
          ))}
        </div>
        <div aria-live="polite" role="status">
          {presetError && (
            <p className="mt-2 rounded-md bg-maple-soft px-3 py-1.5 text-[12.5px] font-medium text-maple">
              {presetError}
            </p>
          )}
        </div>
      </div>

      {rules.length > 0 && (
        <ul className="flex flex-col gap-2">
          {rules.map((r) => (
            <li
              key={r.id}
              className="flex flex-col gap-2 rounded-md border border-hair bg-paper p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-serif text-[15.5px] tracking-[-0.01em] text-ink">
                    {r.name}
                  </span>
                  {!r.enabled && (
                    <span className="rounded-full bg-cream-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                      Disabled
                    </span>
                  )}
                </div>
                <div className="mt-0.5 truncate font-mono text-[11.5px] text-ink-3">
                  {[r.match_from, r.match_subject].filter(Boolean).join(' · ') || 'Matches every email'}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => onEdit(r)}
                  aria-label={`Edit rule "${r.name}"`}
                  className="inline-flex min-h-[44px] items-center rounded-full border border-hair bg-paper-2 px-3 py-1.5 text-[12px] font-semibold text-ink"
                >
                  Edit
                </button>
                <ConfirmButton
                  action={(fd) => startTransition(() => deleteRule(fd))}
                  formData={{ id: r.id }}
                  prompt={`Delete rule "${r.name}"?`}
                  description="Future emails matching this rule will fall through to the next one (if any)."
                  confirmLabel="Delete"
                  destructive
                  className="inline-flex min-h-[44px] items-center rounded-full px-3 py-1.5 text-[12px] font-semibold text-maple hover:bg-maple-soft"
                >
                  Delete
                </ConfirmButton>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing ? (
        <RuleForm
          key={editing === 'new' ? 'new' : editing.id}
          initial={editing === 'new' ? null : editing}
          accounts={accounts}
          members={members}
          categories={categories}
          onClose={() => onEdit(null)}
        />
      ) : (
        <button
          type="button"
          onClick={() => onEdit('new')}
          className="inline-flex min-h-[44px] items-center self-start rounded-full border border-dashed border-hair bg-cream-2 px-4 py-2.5 text-[12.5px] font-semibold text-ink-2 hover:bg-paper-2 hover:text-ink"
        >
          + Add a rule
        </button>
      )}
    </div>
  )
}

function RuleForm({
  initial,
  accounts,
  members,
  categories,
  onClose,
}: {
  initial: Rule | null
  accounts: Account[]
  members: Member[]
  categories: Category[]
  onClose: () => void
}) {
  const [state, formAction, pending] = useActionState<RuleFormState, FormData>(
    saveRule,
    undefined,
  )
  const [templateIdx, setTemplateIdx] = useState<number | ''>('')
  const [draft, setDraft] = useState<Partial<Rule>>(
    initial ?? {
      enabled: true,
      direction: 'auto',
      amount_regex: '\\$([0-9,]+\\.[0-9]{2})',
    },
  )

  function applyTemplate(i: number) {
    setTemplateIdx(i)
    const t = STARTER_TEMPLATES[i].value
    setDraft({ ...draft, ...t })
  }

  function field(key: keyof Rule, value: string | boolean | null) {
    setDraft((prev) => ({ ...prev, [key]: value as never }))
  }

  // Close the form when save succeeds.
  if (state && 'ok' in state && state.ok) {
    queueMicrotask(onClose)
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-lg border border-hair bg-paper-2 p-4 md:p-5"
    >
      {initial && <input type="hidden" name="id" value={initial.id} />}

      {!initial && (
        <>
          <SmartSuggester
            onApply={(suggestion) => {
              setDraft((prev) => ({
                ...prev,
                match_from: suggestion.match_from ?? prev.match_from ?? null,
                match_subject: suggestion.match_subject ?? prev.match_subject ?? null,
                amount_regex: suggestion.amount_regex,
                description_regex: suggestion.description_regex ?? prev.description_regex ?? null,
                direction: suggestion.direction,
                inflow_regex: suggestion.inflow_regex,
                account_router_regex: suggestion.account_router_regex ?? prev.account_router_regex ?? null,
                name: prev.name || 'Auto-suggested rule',
              }))
            }}
          />
          <FormField label="…or start from a template">
            <select
              value={templateIdx}
              onChange={(e) => applyTemplate(Number(e.target.value))}
              className="maple-select"
            >
              <option value="">Blank - fill it in manually</option>
              {STARTER_TEMPLATES.map((t, i) => (
                <option key={t.label} value={i}>{t.label}</option>
              ))}
            </select>
          </FormField>
        </>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Rule name">
          <input
            name="name"
            required
            value={draft.name ?? ''}
            onChange={(e) => field('name', e.target.value)}
            className="maple-input"
            placeholder="e.g. RBC card alerts"
          />
        </FormField>
        <FormField label="Enabled">
          <label className="inline-flex min-h-[44px] items-center gap-2 pt-1.5 text-[13.5px] text-ink">
            <input
              type="checkbox"
              name="enabled"
              checked={draft.enabled ?? true}
              onChange={(e) => field('enabled', e.target.checked)}
              className="h-4 w-4 accent-leaf"
            />
            Run this rule on incoming emails
          </label>
        </FormField>

        <FormField label="From-address regex (optional)" hint="e.g. alerts@rbc\.com">
          <input
            name="match_from"
            value={draft.match_from ?? ''}
            onChange={(e) => field('match_from', e.target.value)}
            className="maple-input font-mono text-[12.5px]"
            placeholder="alerts@your-bank\.com"
          />
        </FormField>
        <FormField label="Subject regex (optional)" hint="e.g. transaction notification">
          <input
            name="match_subject"
            value={draft.match_subject ?? ''}
            onChange={(e) => field('match_subject', e.target.value)}
            className="maple-input font-mono text-[12.5px]"
            placeholder="purchase|withdrawal|deposit"
          />
        </FormField>

        <FormField label="Amount regex (required)" hint="First capture group → dollars">
          <input
            name="amount_regex"
            required
            value={draft.amount_regex ?? ''}
            onChange={(e) => field('amount_regex', e.target.value)}
            className="maple-input font-mono text-[12.5px]"
            placeholder="\\$([0-9,]+\\.[0-9]{2})"
          />
        </FormField>
        <FormField label="Description regex (optional)" hint="First capture group → merchant">
          <input
            name="description_regex"
            value={draft.description_regex ?? ''}
            onChange={(e) => field('description_regex', e.target.value)}
            className="maple-input font-mono text-[12.5px]"
            placeholder="at\\s+([A-Z0-9 .&\\-']{2,})"
          />
        </FormField>

        <FormField label="Date regex (optional)" hint="Falls back to email received-at">
          <input
            name="date_regex"
            value={draft.date_regex ?? ''}
            onChange={(e) => field('date_regex', e.target.value)}
            className="maple-input font-mono text-[12.5px]"
            placeholder="(\\d{4}-\\d{2}-\\d{2})"
          />
        </FormField>
        <FormField label="Sign convention">
          <select
            name="direction"
            value={draft.direction ?? 'outflow'}
            onChange={(e) => field('direction', e.target.value as Rule['direction'])}
            className="maple-select"
          >
            <option value="outflow">Always an outflow (debit / purchase)</option>
            <option value="inflow">Always an inflow (deposit / credit)</option>
            <option value="auto">Auto - use inflow regex below</option>
          </select>
        </FormField>

        {draft.direction === 'auto' && (
          <FormField
            label="Inflow regex (auto-mode only)"
            hint="If this matches the body, treat as inflow"
          >
            <input
              name="inflow_regex"
              value={draft.inflow_regex ?? ''}
              onChange={(e) => field('inflow_regex', e.target.value)}
              className="maple-input font-mono text-[12.5px]"
              placeholder="(deposit|credit|received)"
            />
          </FormField>
        )}

        <FormField
          label="Account router regex"
          hint="Captured group 1 is matched against each account's last 4. Routes one rule across many accounts."
        >
          <input
            name="account_router_regex"
            value={draft.account_router_regex ?? ''}
            onChange={(e) => field('account_router_regex', e.target.value)}
            className="maple-input font-mono text-[12.5px]"
            placeholder="ending\s+(?:in|with)\s+(\d{4})"
          />
        </FormField>
      </div>

      {accounts.some((a) => a.last_four) && (
        <div className="rounded-md border border-leaf bg-leaf-tint px-3 py-2 text-[11.5px] leading-relaxed text-ink-2">
          <b className="text-leaf-deep">Will route to:</b>{' '}
          {accounts
            .filter((a) => a.last_four)
            .map((a) => `${a.name} (····${a.last_four})`)
            .join(', ')}
          {accounts.some((a) => !a.last_four) && (
            <>
              {' · '}<span className="text-ink-3">
                accounts without a last-4 won&rsquo;t auto-route - set them in Accounts.
              </span>
            </>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <FormField label="Fallback account (required)" hint="Used when the router regex doesn't match - e.g. an e-transfer with no card number.">
          <select
            name="default_account_id"
            required
            value={draft.default_account_id ?? ''}
            onChange={(e) => field('default_account_id', e.target.value)}
            className="maple-select"
          >
            <option value="">Choose…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}{a.last_four ? ` ····${a.last_four}` : ''}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Default member">
          <select
            name="default_member_id"
            value={draft.default_member_id ?? ''}
            onChange={(e) => field('default_member_id', e.target.value)}
            className="maple-select"
          >
            <option value="">Shared</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </FormField>
        <FormField label="Default category">
          <select
            name="default_category_id"
            value={draft.default_category_id ?? ''}
            onChange={(e) => field('default_category_id', e.target.value)}
            className="maple-select"
          >
            <option value="">Uncategorized</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </FormField>
      </div>

      <div aria-live="polite" role="status">
        {state && 'error' in state && state.error && (
          <p className="rounded-md bg-maple-soft px-3 py-1.5 text-[12.5px] font-medium text-maple">
            {state.error}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          {pending ? 'Saving…' : initial ? 'Save changes' : 'Add rule'}
        </Button>
      </div>
    </form>
  )
}

function FormField({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
        {label}
      </span>
      {children}
      {hint && <span className="text-[11px] text-ink-3">{hint}</span>}
    </label>
  )
}

// ─── Step 5 - Verify ──────────────────────────────────────────────────────

function VerifyLog({
  log: initial,
  gmailSyncUrl,
}: {
  log: LogEntry[]
  gmailSyncUrl: string | null
}) {
  const [log, setLog] = useState<LogEntry[]>(initial)
  const [polling, setPolling] = useState(true)
  const [testState, setTestState] = useState<TestEmailState>(undefined)
  const [testPending, startTest] = useTransition()
  const [syncState, setSyncState] = useState<SyncNowState>(undefined)
  const [syncPending, startSync] = useTransition()
  const [urlState, urlAction, urlPending] = useActionState<SaveSyncUrlState, FormData>(
    saveSyncUrl,
    undefined,
  )

  // Live tail: poll every 5s while the tab is visible. Pause on hidden so we
  // don't burn quota for nothing; resume on visibility change.
  useEffect(() => {
    if (!polling) return
    let cancelled = false
    let timer: ReturnType<typeof setInterval> | null = null

    async function tick() {
      if (document.visibilityState !== 'visible') return
      try {
        const next = await getRecentLog()
        if (!cancelled) setLog(next)
      } catch {
        /* swallow - next tick will retry */
      }
    }

    timer = setInterval(tick, 5000)
    const onVis = () => { if (document.visibilityState === 'visible') tick() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [polling])

  function fireTest() {
    setTestState(undefined)
    startTest(async () => {
      const result = await sendTestEmail()
      setTestState(result)
      // Refresh immediately rather than waiting for the next 5s tick.
      try { setLog(await getRecentLog()) } catch {}
    })
  }

  function fireSync() {
    setSyncState(undefined)
    startSync(async () => {
      const result = await triggerGmailSync()
      setSyncState(result)
      try { setLog(await getRecentLog()) } catch {}
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Lead with the payoff: one click proves ingestion → parse → insert
          works end-to-end, and the result lands in the log right below. */}
      <p className="text-[13.5px] leading-relaxed text-ink-2">
        Hit <b>Send test email</b> to push a fake bank alert through the whole
        pipeline. You&rsquo;ll see it land in the log below within a second - proof
        the wiring works before a real alert ever arrives.
      </p>

      <div className="flex flex-col gap-3 rounded-md border border-hair bg-cream-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
            Test the pipeline now
          </div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">
            Sends a fake bank-alert email through the webhook so you can see
            ingestion + parsing + insert work end-to-end without waiting on a
            real bank.
          </p>
          <div aria-live="polite" role="status">
            {testState && 'ok' in testState && testState.ok && (
              <p className="mt-1.5 text-[12px] font-medium text-leaf-deep">
                Webhook responded with <b>{testState.status}</b>
                {testState.transaction_id ? ` - transaction ${testState.transaction_id.slice(0, 8)}…` : ''}.
                {testState.status === 'inserted' && ' Check Activity to see it.'}
                {testState.status === 'no_match' && ' Add a matching rule above so the engine can find your test email.'}
              </p>
            )}
            {testState && 'error' in testState && testState.error && (
              <p className="mt-1.5 text-[12px] font-medium text-maple">
                {testState.error}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="inline-flex min-h-[44px] items-center gap-1.5 text-[12px] text-ink-2">
            <input
              type="checkbox"
              checked={polling}
              onChange={(e) => setPolling(e.target.checked)}
              className="h-4 w-4 accent-leaf"
            />
            Live
          </label>
          <Button type="button" variant="primary" size="sm" onClick={fireTest} disabled={testPending}>
            {testPending ? 'Sending…' : 'Send test email'}
          </Button>
        </div>
      </div>

      {log.length === 0 ? (
        <p className="rounded-md border border-dashed border-hair bg-paper px-4 py-6 text-center text-[13px] text-ink-2">
          No alerts yet. Send a test above, or wait for your Gmail script to fire - entries appear here within seconds.
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border border-hair">
          <DataTable minWidth={640} className="text-[12.5px]">
            <thead className="bg-cream-2 text-left text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
              <tr>
                <th className="px-4 py-2.5 font-bold">When</th>
                <th className="px-4 py-2.5 font-bold">From</th>
                <th className="px-4 py-2.5 font-bold">Subject</th>
                <th className="px-4 py-2.5 font-bold">Status</th>
              </tr>
            </thead>
            <tbody>
              {log.map((l) => (
                <tr key={l.id} className="border-t border-hair">
                  <td className="px-4 py-2 tabular-nums text-ink-2">
                    {formatDate(l.received_at.slice(0, 10))}
                  </td>
                  <td className="max-w-[200px] truncate px-4 py-2 text-ink-2">
                    {l.from_address ?? '-'}
                  </td>
                  <td className="max-w-[280px] truncate px-4 py-2 text-ink">
                    {l.subject ?? '-'}
                  </td>
                  <td className="px-4 py-2">
                    <StatusPill status={l.status} detail={l.error_detail} />
                    {l.transaction_id && (
                      <Link
                        href="/transactions"
                        aria-label="View imported transaction"
                        className="ml-2 inline-flex min-h-[44px] items-center text-[11px] font-semibold text-ink-2 underline-offset-2 hover:text-ink hover:underline"
                      >
                        view
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>
      )}

      {/* On-demand sync editor - secondary to the test payoff above, so it sits
          last. The hourly trigger covers steady-state; this is for "I just
          bought something, pull it now". */}
      <div className="rounded-md border border-leaf bg-leaf-tint p-4">
        <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-leaf-deep">
          On-demand sync
        </div>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">
          Hourly trigger handles steady-state. For when you just bought something and
          want it in the app now, paste the Apps Script <b>/exec</b> URL here and use
          the Sync button.
        </p>
        <form action={urlAction} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
              Apps Script Web App URL
            </span>
            <input
              type="url"
              name="url"
              defaultValue={gmailSyncUrl ?? ''}
              placeholder="https://script.google.com/macros/s/AKfy…/exec"
              className="maple-input font-mono"
            />
          </label>
          <Button type="submit" variant="secondary" size="sm" disabled={urlPending}>
            {urlPending ? 'Saving…' : 'Save URL'}
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={fireSync}
            disabled={syncPending || !gmailSyncUrl}
            title={!gmailSyncUrl ? 'Save the URL first.' : 'Trigger Gmail polling now.'}
          >
            {syncPending ? 'Syncing…' : 'Sync now'}
          </Button>
        </form>
        <div aria-live="polite" role="status">
          {urlState && 'ok' in urlState && (
            <p className="mt-2 text-[12px] font-medium text-leaf-deep">
              URL saved.
            </p>
          )}
          {urlState && 'error' in urlState && (
            <p className="mt-2 rounded-md bg-maple-soft px-3 py-1.5 text-[12.5px] font-medium text-maple">
              {urlState.error}
            </p>
          )}
          {syncState && 'ok' in syncState && syncState.ok && (
            <p className="mt-2 text-[12px] font-medium text-leaf-deep">
              Sync ran - script processed {syncState.imported} message{syncState.imported === 1 ? '' : 's'}
              {syncState.skipped > 0 && `, skipped ${syncState.skipped} already-imported`}.
            </p>
          )}
          {syncState && 'error' in syncState && (
            <p className="mt-2 rounded-md bg-maple-soft px-3 py-1.5 text-[12.5px] font-medium text-maple">
              {syncState.error}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function StatusPill({ status, detail }: { status: string; detail: string | null }) {
  const palette: Record<string, { cls: string; label: string }> = {
    inserted:        { cls: 'bg-leaf-soft text-leaf',   label: 'Inserted' },
    duplicate:       { cls: 'bg-cream-2 text-ink-2',    label: 'Duplicate' },
    no_match:        { cls: 'bg-maple-soft text-maple', label: 'No rule matched' },
    parse_error:     { cls: 'bg-maple-soft text-maple', label: 'Parse error' },
    invalid_secret:  { cls: 'bg-maple-soft text-maple', label: 'Bad secret' },
    rule_disabled:   { cls: 'bg-cream-2 text-ink-2',    label: 'Rule disabled' },
  }
  const p = palette[status] ?? { cls: 'bg-cream-2 text-ink-2', label: status }
  return (
    <span
      title={detail ?? undefined}
      className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${p.cls}`}
    >
      {p.label}
    </span>
  )
}

// ─── Smart suggester ──────────────────────────────────────────────────────

function SmartSuggester({
  onApply,
}: {
  onApply: (suggestion: Awaited<ReturnType<typeof suggestFromSample>>) => void
}) {
  const [open, setOpen] = useState(false)
  const [from, setFrom] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [pending, startSuggest] = useTransition()
  const [notes, setNotes] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  function suggest() {
    setError(null)
    setNotes(null)
    if (!body.trim()) {
      setError('Paste the email body - that’s where the amount and merchant live.')
      bodyRef.current?.focus()
      return
    }
    startSuggest(async () => {
      const result = await suggestFromSample({ from, subject, body })
      onApply(result)
      setNotes(result.notes)
    })
  }

  return (
    <div className="rounded-md border border-leaf bg-leaf-tint p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? 'Collapse Smart suggest' : 'Expand Smart suggest'}
        className="flex min-h-[44px] w-full items-center justify-between text-left"
      >
        <div>
          <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-leaf-deep">
            Smart suggest
          </div>
          <div className="mt-0.5 text-[13px] text-ink-2">
            Paste a real bank-alert email and we&rsquo;ll fill the regex fields for you.
          </div>
        </div>
        <span className="ml-3 shrink-0 text-[18px] text-leaf-deep" aria-hidden>
          {open ? '−' : '+'}
        </span>
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-2.5">
          <FormField label="From (optional)" hint="e.g. alerts@rbc.com">
            <input
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="maple-input font-mono text-[12.5px]"
              placeholder="Bank Alerts <alerts@example-bank.com>"
            />
          </FormField>
          <FormField label="Subject (optional)">
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="maple-input"
              placeholder="Transaction notification"
            />
          </FormField>
          <FormField label="Email body (required)" hint="Plain text - paste as much as you got">
            <textarea
              ref={bodyRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              spellCheck={false}
              className="maple-textarea font-mono text-[12px]"
              placeholder="A debit transaction of $4.20 was processed at LOBLAWS on 2026-04-24…"
            />
          </FormField>

          <div aria-live="polite" role="status">
            {error && (
              <p className="rounded-md bg-maple-soft px-3 py-1.5 text-[12.5px] font-medium text-maple">
                {error}
              </p>
            )}

            {notes && (
              <ul className="rounded-md border border-leaf bg-paper-2 px-3 py-2 text-[12px] leading-relaxed text-ink-2">
                {notes.map((n, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-leaf" aria-hidden>·</span>
                    <span>{n}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => { setBody(''); setSubject(''); setFrom(''); setNotes(null); setError(null) }}
            >
              Clear
            </Button>
            <Button type="button" variant="primary" size="sm" onClick={suggest} disabled={pending}>
              {pending ? 'Analysing…' : 'Suggest from this email'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Layout primitives ────────────────────────────────────────────────────

function Step({
  n,
  title,
  status = 'todo',
  hint,
  children,
}: {
  n: number
  title: string
  status?: StepStatus
  hint?: string
  children: React.ReactNode
}) {
  const done = status === 'done'
  return (
    <section
      className={`rounded-lg border bg-paper p-5 md:p-6 ${
        done ? 'border-leaf' : 'border-hair'
      }`}
    >
      <header className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {/* Number badge flips to a leaf check once the step's done - the check
            glyph is the non-color cue. */}
        <span
          className={`inline-flex h-[22px] w-[22px] items-center justify-center rounded-full font-serif text-[12px] tabular-nums text-paper ${
            done ? 'bg-leaf' : 'bg-ink'
          }`}
          aria-hidden
        >
          {done ? '✓' : n}
        </span>
        <MapleLabel>{title}</MapleLabel>
        <StepStatusBadge status={status} hint={hint} />
      </header>
      {children}
    </section>
  )
}

// Per-step state pill. Carries its own text label so the state reads without
// relying on colour.
function StepStatusBadge({ status, hint }: { status: StepStatus; hint?: string }) {
  if (status === 'done') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-leaf-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-leaf-deep">
        ✓ Done{hint ? ` · ${hint}` : ''}
      </span>
    )
  }
  if (status === 'manual') {
    return (
      <span className="inline-flex items-center rounded-full bg-cream-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-ink-3">
        At your bank
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-cream-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-ink-2">
      To do
    </span>
  )
}
