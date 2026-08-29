/** Plaid item / sync-log status as a small tone-coded pill. Server-safe. */
export function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    active: { label: 'Connected', cls: 'bg-leaf-soft text-leaf-deep' },
    ok: { label: 'OK', cls: 'bg-leaf-soft text-leaf-deep' },
    login_required: { label: 'Needs reconnecting', cls: 'bg-paper-2 text-down' },
    pending_disconnect: { label: 'Disconnecting soon', cls: 'bg-paper-2 text-down' },
    revoked: { label: 'Disconnected', cls: 'bg-maple-soft text-maple' },
    transient: { label: 'Bank busy', cls: 'bg-paper-2 text-ink-3' },
    skipped_locked: { label: 'Already running', cls: 'bg-paper-2 text-ink-3' },
    error: { label: 'Sync error', cls: 'bg-maple-soft text-maple' },
    webhook_rejected: { label: 'Rejected', cls: 'bg-maple-soft text-maple' },
    new_accounts: { label: 'New accounts', cls: 'bg-paper-2 text-down' },
  }
  const s = map[status] ?? { label: status, cls: 'bg-paper-2 text-ink-3' }
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ${s.cls}`}>
      {s.label}
    </span>
  )
}
