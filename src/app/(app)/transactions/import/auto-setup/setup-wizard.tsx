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
  type RotateSecretState,
  type RuleFormState,
  type TestEmailState,
} from './actions'

type Account = { id: string; name: string }
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
    label: 'Generic — “transaction of $X.XX at MERCHANT”',
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
    label: 'RBC — debit / credit card alerts',
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
    label: 'TD — EasyWeb alerts',
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
  accounts,
  members,
  categories,
  rules,
  log,
}: {
  webhookUrl: string
  hasSecret: boolean
  accounts: Account[]
  members: Member[]
  categories: Category[]
  rules: Rule[]
  log: LogEntry[]
}) {
  const [editingRule, setEditingRule] = useState<Rule | 'new' | null>(null)

  return (
    <div className="flex flex-col gap-5">
      <Step n={1} title="Generate your private webhook">
        <SecretCard webhookUrl={webhookUrl} hasSecret={hasSecret} />
      </Step>

      <Step n={2} title="Turn on transaction alerts at your bank">
        <BankAlertHelp />
      </Step>

      <Step n={3} title="Install the Gmail Apps Script">
        <GmailScriptCard webhookUrl={webhookUrl} />
      </Step>

      <Step n={4} title="Define how each email becomes a transaction">
        <RulesSection
          rules={rules}
          accounts={accounts}
          members={members}
          categories={categories}
          editing={editingRule}
          onEdit={setEditingRule}
        />
      </Step>

      <Step n={5} title="Watch alerts arrive">
        <VerifyLog log={log} />
      </Step>
    </div>
  )
}

// ─── Step 1 — Secret ──────────────────────────────────────────────────────

function SecretCard({ webhookUrl, hasSecret }: { webhookUrl: string; hasSecret: boolean }) {
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

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13.5px] leading-relaxed text-[var(--color-ink-2)]">
        Your webhook URL is fixed — your secret rotates each time you press the button.
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
            label="Your new secret — copy now"
            value={newlyMintedSecret}
            copied={copied === 'secret'}
            onCopy={() => copy(newlyMintedSecret, 'secret')}
            tone="warn"
          />
        ) : (
          <div
            className="rounded-[12px] border border-[var(--color-hair)] px-4 py-3"
            style={{ background: hasSecret ? 'var(--color-leaf-tint)' : 'var(--color-cream-2)' }}
          >
            <div
              className="text-[10.5px] font-bold uppercase tracking-[0.08em]"
              style={{ color: hasSecret ? 'var(--color-leaf)' : 'var(--color-ink-3)' }}
            >
              Secret
            </div>
            <div className="mt-1 text-[13px] text-[var(--color-ink-2)]">
              {hasSecret
                ? 'A secret is set. Press the button to rotate it (you’ll need to update the Gmail script if you do).'
                : 'No secret yet — press the button to generate one.'}
            </div>
          </div>
        )}
      </div>

      <form action={formAction}>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-5 py-3 text-[13.5px] font-semibold text-[var(--color-paper)] transition-all active:scale-[0.98] disabled:opacity-50"
        >
          {pending ? 'Generating…' : hasSecret ? 'Rotate secret' : 'Generate secret'}
          {!pending && <span aria-hidden>→</span>}
        </button>
      </form>

      {state && 'error' in state && state.error && (
        <p
          className="rounded-[10px] px-3 py-1.5 text-[12.5px] font-medium"
          style={{ background: 'var(--color-maple-soft)', color: 'var(--color-maple)' }}
        >
          {state.error}
        </p>
      )}
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
      className="flex flex-col gap-1.5 rounded-[12px] border px-4 py-3"
      style={{
        borderColor: isWarn ? 'var(--color-honey)' : 'var(--color-hair)',
        background: isWarn ? 'var(--color-paper-2)' : 'var(--color-paper)',
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
          {label}
        </span>
        <button
          type="button"
          onClick={onCopy}
          className="text-[11.5px] font-semibold text-[var(--color-ink-2)] underline-offset-2 hover:text-[var(--color-ink)] hover:underline"
        >
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
      </div>
      <code className="block break-all font-mono text-[12px] text-[var(--color-ink)]">{value}</code>
    </div>
  )
}

// ─── Step 2 — Bank instructions ───────────────────────────────────────────

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
      <p className="text-[13.5px] leading-relaxed text-[var(--color-ink-2)]">
        Set the alert threshold to <b>$0.01</b> so every transaction triggers an email.
        These usually arrive within 30 seconds of the swipe / tap / e-transfer.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {banks.map((b) => (
          <div
            key={b.name}
            className="rounded-[12px] border border-[var(--color-hair)] bg-[var(--color-paper)] px-4 py-3"
          >
            <div className="font-serif text-[15px] tracking-[-0.01em] text-[var(--color-ink)]">
              {b.name}
            </div>
            <div className="mt-1 text-[12.5px] leading-relaxed text-[var(--color-ink-2)]">
              {b.steps}
            </div>
          </div>
        ))}
      </div>
      <div
        className="rounded-[12px] px-4 py-3 text-[12.5px] leading-relaxed text-[var(--color-ink-2)]"
        style={{ background: 'var(--color-cream-2)' }}
      >
        <b className="text-[var(--color-ink)]">Tip:</b> create a Gmail filter that
        labels these alerts (e.g. <code className="rounded bg-[var(--color-paper)] px-1.5 py-0.5 font-mono text-[11.5px]">label:bank-alerts</code>) so the
        Apps Script in step 3 only sees them.
      </div>
    </div>
  )
}

// ─── Step 3 — Gmail Apps Script ───────────────────────────────────────────

function GmailScriptCard({ webhookUrl }: { webhookUrl: string }) {
  const [copied, setCopied] = useState(false)
  const code = appsScriptCode(webhookUrl)

  function copy() {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <ol className="ml-5 list-decimal space-y-1 text-[13.5px] leading-relaxed text-[var(--color-ink-2)]">
        <li>
          Open{' '}
          <a
            href="https://script.google.com/home"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-[var(--color-ink)] underline-offset-2 hover:underline"
          >
            script.google.com
          </a>
          {' '}and click <b>New project</b>.
        </li>
        <li>Replace the contents of <code className="rounded bg-[var(--color-cream-2)] px-1.5 py-0.5 font-mono text-[11.5px]">Code.gs</code> with the script below.</li>
        <li>
          Set <code className="rounded bg-[var(--color-cream-2)] px-1.5 py-0.5 font-mono text-[11.5px]">SECRET</code> in <b>Project Settings → Script properties</b>
          {' '}to the secret you copied in step 1.
        </li>
        <li>
          Click <b>Triggers</b> (clock icon) → <b>Add trigger</b>: function
          {' '}<code className="rounded bg-[var(--color-cream-2)] px-1.5 py-0.5 font-mono text-[11.5px]">forwardBankAlerts</code>, time-driven, every 5 minutes.
        </li>
        <li>Run it once manually to authorize Gmail access.</li>
      </ol>

      <div className="overflow-hidden rounded-[14px] border border-[var(--color-hair)]">
        <div
          className="flex items-center justify-between border-b border-[var(--color-hair)] px-4 py-2"
          style={{ background: 'var(--color-cream-2)' }}
        >
          <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
            Code.gs
          </span>
          <button
            type="button"
            onClick={copy}
            className="text-[11.5px] font-semibold text-[var(--color-ink-2)] underline-offset-2 hover:text-[var(--color-ink)] hover:underline"
          >
            {copied ? 'Copied ✓' : 'Copy'}
          </button>
        </div>
        <pre
          className="overflow-x-auto px-4 py-3 font-mono text-[11.5px] leading-relaxed text-[var(--color-ink)]"
          style={{ background: 'var(--color-paper)' }}
        >
{code}
        </pre>
      </div>
    </div>
  )
}

function appsScriptCode(webhookUrl: string): string {
  return `// Forwards Gmail messages labelled "bank-alerts" to Maple.
// Set the script properties: SECRET (from step 1) and optionally
// LABEL_NAME (defaults to "bank-alerts").

const WEBHOOK_URL = '${webhookUrl}';

function forwardBankAlerts() {
  const props = PropertiesService.getScriptProperties();
  const secret = props.getProperty('SECRET');
  if (!secret) throw new Error('Set the SECRET script property first.');
  const labelName = props.getProperty('LABEL_NAME') || 'bank-alerts';

  const label = GmailApp.getUserLabelByName(labelName);
  if (!label) throw new Error('Gmail label "' + labelName + '" not found.');
  const processed = GmailApp.getUserLabelByName('maple-imported')
    || GmailApp.createLabel('maple-imported');

  const threads = label.getThreads(0, 20);
  for (const thread of threads) {
    for (const msg of thread.getMessages()) {
      if (msg.getLabels().some((l) => l.getName() === 'maple-imported')) continue;

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
      const status = res.getResponseCode();
      if (status === 200 || status === 401) {
        // 200 = handled (inserted/duplicate/no_match). 401 = bad secret —
        // we still mark to stop spamming; user must fix and rotate.
        thread.addLabel(processed);
      }
    }
  }
}
`
}

// ─── Step 4 — Rules ───────────────────────────────────────────────────────

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
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13.5px] leading-relaxed text-[var(--color-ink-2)]">
        Each rule says: <i>“when an email matches X, pull amount Y and merchant Z out of
        it.”</i> Start with the generic template and tweak it once you see real alerts
        arrive in step 5.
      </p>

      {rules.length > 0 && (
        <ul className="flex flex-col gap-2">
          {rules.map((r) => (
            <li
              key={r.id}
              className="flex flex-col gap-2 rounded-[12px] border border-[var(--color-hair)] bg-[var(--color-paper)] p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-serif text-[15.5px] tracking-[-0.01em] text-[var(--color-ink)]">
                    {r.name}
                  </span>
                  {!r.enabled && (
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]"
                      style={{ background: 'var(--color-cream-2)', color: 'var(--color-ink-3)' }}
                    >
                      Disabled
                    </span>
                  )}
                </div>
                <div className="mt-0.5 truncate font-mono text-[11.5px] text-[var(--color-ink-3)]">
                  {[r.match_from, r.match_subject].filter(Boolean).join(' · ') || 'Matches every email'}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => onEdit(r)}
                  className="rounded-full border border-[var(--color-hair)] bg-[var(--color-paper-2)] px-3 py-1.5 text-[12px] font-semibold text-[var(--color-ink)]"
                >
                  Edit
                </button>
                <form
                  action={(fd) => startTransition(() => deleteRule(fd))}
                  onSubmit={(e) => {
                    if (!confirm(`Delete rule "${r.name}"?`)) e.preventDefault()
                  }}
                >
                  <input type="hidden" name="id" value={r.id} />
                  <button
                    type="submit"
                    disabled={pending}
                    className="rounded-full px-3 py-1.5 text-[12px] font-semibold text-[var(--color-maple)] hover:bg-[var(--color-maple-soft)]"
                  >
                    Delete
                  </button>
                </form>
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
          className="self-start rounded-full border border-dashed border-[var(--color-hair)] bg-[var(--color-cream-2)] px-4 py-2.5 text-[12.5px] font-semibold text-[var(--color-ink-2)] hover:bg-[var(--color-paper-2)] hover:text-[var(--color-ink)]"
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
      className="flex flex-col gap-4 rounded-[16px] border border-[var(--color-hair)] bg-[var(--color-paper-2)] p-4 md:p-5"
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
              <option value="">Blank — fill it in manually</option>
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
          <label className="inline-flex items-center gap-2 pt-1.5 text-[13.5px] text-[var(--color-ink)]">
            <input
              type="checkbox"
              name="enabled"
              checked={draft.enabled ?? true}
              onChange={(e) => field('enabled', e.target.checked)}
              className="h-4 w-4 accent-[var(--color-leaf)]"
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
            <option value="auto">Auto — use inflow regex below</option>
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
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <FormField label="Default account (required)">
          <select
            name="default_account_id"
            required
            value={draft.default_account_id ?? ''}
            onChange={(e) => field('default_account_id', e.target.value)}
            className="maple-select"
          >
            <option value="">Choose…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
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

      {state && 'error' in state && state.error && (
        <p
          className="rounded-[10px] px-3 py-1.5 text-[12.5px] font-medium"
          style={{ background: 'var(--color-maple-soft)', color: 'var(--color-maple)' }}
        >
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full px-4 py-2.5 text-[12.5px] font-semibold text-[var(--color-ink-2)] hover:text-[var(--color-ink)]"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-5 py-2.5 text-[12.5px] font-semibold text-[var(--color-paper)] active:scale-[0.98] disabled:opacity-50"
        >
          {pending ? 'Saving…' : initial ? 'Save changes' : 'Add rule'}
        </button>
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
      <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
        {label}
      </span>
      {children}
      {hint && <span className="text-[11px] text-[var(--color-ink-3)]">{hint}</span>}
    </label>
  )
}

// ─── Step 5 — Verify ──────────────────────────────────────────────────────

function VerifyLog({ log: initial }: { log: LogEntry[] }) {
  const [log, setLog] = useState<LogEntry[]>(initial)
  const [polling, setPolling] = useState(true)
  const [testState, setTestState] = useState<TestEmailState>(undefined)
  const [testPending, startTest] = useTransition()

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
        /* swallow — next tick will retry */
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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-[var(--color-hair)] bg-[var(--color-cream-2)] px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
            Test the pipeline now
          </div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--color-ink-2)]">
            Sends a fake bank-alert email through the webhook so you can see
            ingestion + parsing + insert work end-to-end without waiting on a
            real bank.
          </p>
          {testState && 'ok' in testState && testState.ok && (
            <p className="mt-1.5 text-[12px] font-medium text-[var(--color-leaf-deep)]">
              Webhook responded with <b>{testState.status}</b>
              {testState.transaction_id ? ` — transaction ${testState.transaction_id.slice(0, 8)}…` : ''}.
              {testState.status === 'inserted' && ' Check Activity to see it.'}
              {testState.status === 'no_match' && ' Add a matching rule above so the engine can find your test email.'}
            </p>
          )}
          {testState && 'error' in testState && testState.error && (
            <p className="mt-1.5 text-[12px] font-medium text-[var(--color-maple)]">
              {testState.error}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[11.5px] text-[var(--color-ink-2)]">
            <input
              type="checkbox"
              checked={polling}
              onChange={(e) => setPolling(e.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--color-leaf)]"
            />
            Live
          </label>
          <button
            type="button"
            onClick={fireTest}
            disabled={testPending}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-4 py-2 text-[12.5px] font-semibold text-[var(--color-paper)] active:scale-[0.98] disabled:opacity-50"
          >
            {testPending ? 'Sending…' : 'Send test email'}
          </button>
        </div>
      </div>

      {log.length === 0 ? (
        <p className="rounded-[12px] border border-dashed border-[var(--color-hair)] bg-[var(--color-paper)] px-4 py-6 text-center text-[13px] text-[var(--color-ink-2)]">
          No alerts yet. Send a test above, or wait for your Gmail script to fire — entries appear here within seconds.
        </p>
      ) : (
        <div className="overflow-hidden rounded-[14px] border border-[var(--color-hair)]">
          <table className="w-full min-w-[640px] text-[12.5px]">
            <thead
              className="text-left text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--color-ink-3)]"
              style={{ background: 'var(--color-cream-2)' }}
            >
              <tr>
                <th className="px-4 py-2.5 font-bold">When</th>
                <th className="px-4 py-2.5 font-bold">From</th>
                <th className="px-4 py-2.5 font-bold">Subject</th>
                <th className="px-4 py-2.5 font-bold">Status</th>
              </tr>
            </thead>
            <tbody>
              {log.map((l) => (
                <tr key={l.id} className="border-t border-[var(--color-hair)]">
                  <td className="px-4 py-2 tabular-nums text-[var(--color-ink-2)]">
                    {formatDate(l.received_at.slice(0, 10))}
                  </td>
                  <td className="max-w-[200px] truncate px-4 py-2 text-[var(--color-ink-2)]">
                    {l.from_address ?? '—'}
                  </td>
                  <td className="max-w-[280px] truncate px-4 py-2 text-[var(--color-ink)]">
                    {l.subject ?? '—'}
                  </td>
                  <td className="px-4 py-2">
                    <StatusPill status={l.status} detail={l.error_detail} />
                    {l.transaction_id && (
                      <Link
                        href="/transactions"
                        className="ml-2 text-[11px] font-semibold text-[var(--color-ink-2)] underline-offset-2 hover:text-[var(--color-ink)] hover:underline"
                      >
                        view
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function StatusPill({ status, detail }: { status: string; detail: string | null }) {
  const palette: Record<string, { bg: string; fg: string; label: string }> = {
    inserted:        { bg: 'var(--color-leaf-soft)',  fg: 'var(--color-leaf)',  label: 'Inserted' },
    duplicate:       { bg: 'var(--color-cream-2)',     fg: 'var(--color-ink-2)', label: 'Duplicate' },
    no_match:        { bg: 'var(--color-maple-soft)',  fg: 'var(--color-maple)', label: 'No rule matched' },
    parse_error:     { bg: 'var(--color-maple-soft)',  fg: 'var(--color-maple)', label: 'Parse error' },
    invalid_secret:  { bg: 'var(--color-maple-soft)',  fg: 'var(--color-maple)', label: 'Bad secret' },
    rule_disabled:   { bg: 'var(--color-cream-2)',     fg: 'var(--color-ink-2)', label: 'Rule disabled' },
  }
  const p = palette[status] ?? { bg: 'var(--color-cream-2)', fg: 'var(--color-ink-2)', label: status }
  return (
    <span
      title={detail ?? undefined}
      className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
      style={{ background: p.bg, color: p.fg }}
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
      setError('Paste the email body — that’s where the amount and merchant live.')
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
    <div
      className="rounded-[14px] border p-4"
      style={{ borderColor: 'var(--color-leaf)', background: 'var(--color-leaf-tint)' }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <div>
          <div
            className="text-[10.5px] font-bold uppercase tracking-[0.08em]"
            style={{ color: 'var(--color-leaf-deep)' }}
          >
            Smart suggest
          </div>
          <div className="mt-0.5 text-[13px] text-[var(--color-ink-2)]">
            Paste a real bank-alert email and we&rsquo;ll fill the regex fields for you.
          </div>
        </div>
        <span className="ml-3 shrink-0 text-[18px] text-[var(--color-leaf-deep)]" aria-hidden>
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
          <FormField label="Email body (required)" hint="Plain text — paste as much as you got">
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

          {error && (
            <p
              className="rounded-[10px] px-3 py-1.5 text-[12.5px] font-medium"
              style={{ background: 'var(--color-maple-soft)', color: 'var(--color-maple)' }}
            >
              {error}
            </p>
          )}

          {notes && (
            <ul
              className="rounded-[10px] border px-3 py-2 text-[12px] leading-relaxed text-[var(--color-ink-2)]"
              style={{ borderColor: 'var(--color-leaf)', background: 'var(--color-paper-2)' }}
            >
              {notes.map((n, i) => (
                <li key={i} className="flex gap-2">
                  <span style={{ color: 'var(--color-leaf)' }} aria-hidden>·</span>
                  <span>{n}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => { setBody(''); setSubject(''); setFrom(''); setNotes(null); setError(null) }}
              className="rounded-full px-3 py-1.5 text-[12px] font-semibold text-[var(--color-ink-2)] hover:text-[var(--color-ink)]"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={suggest}
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--color-leaf)] px-4 py-2 text-[12.5px] font-semibold text-[var(--color-paper)] active:scale-[0.98] disabled:opacity-50"
            >
              {pending ? 'Analysing…' : 'Suggest from this email'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Layout primitives ────────────────────────────────────────────────────

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[20px] border border-[var(--color-hair)] bg-[var(--color-paper)] p-5 md:p-6">
      <header className="mb-4 flex items-baseline gap-3">
        <span
          className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full font-serif text-[12px] tabular-nums"
          style={{ background: 'var(--color-ink)', color: 'var(--color-paper)' }}
        >
          {n}
        </span>
        <MapleLabel>{title}</MapleLabel>
      </header>
      {children}
    </section>
  )
}
