import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext, canManageHousehold } from '@/lib/household'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { MapleLabel } from '@/components/ui/label'
import { HouseholdForm } from './household-form'
import { CloseDayForm } from './close-day-form'
import { MembersList } from './members-list'
import { SplitWeightsForm } from './split-weights-form'
import { CategoriesList } from './categories-list'
import { NotificationSettings } from './notifications'
import { BankConnections } from './bank-connections'
import { DEFAULT_PREFS, type NotificationPrefs } from './notification-prefs'

/**
 * Setup - the canonical home for household name, members, and categories.
 * Three cards stacked so it reads like a preferences screen.
 */
export default async function SetupPage() {
  const ctx = await getHouseholdContext()
  if (!ctx) return null
  const supabase = await createClient()

  const [
    { data: household },
    { data: members },
    { data: categories },
    { data: invites },
    { data: plaidItems },
    { data: plaidAccounts },
  ] = await Promise.all([
    supabase.from('households').select('id, name, notification_prefs, settlement_close_day').eq('id', ctx.householdId).single(),
    supabase
      .from('members')
      .select('id, display_name, sort_order, archived_at, user_id, split_weight')
      .eq('household_id', ctx.householdId)
      .order('sort_order'),
    supabase
      .from('categories')
      .select('id, parent_id, name, sort_order, archived_at')
      .eq('household_id', ctx.householdId)
      .order('sort_order'),
    supabase
      .from('household_invitations')
      .select('id, email, role, expires_at')
      .eq('household_id', ctx.householdId)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString()),
    supabase
      .from('plaid_items')
      .select('id, institution_name, status, last_synced_at, needs_account_review')
      .eq('household_id', ctx.householdId)
      .neq('status', 'removed')
      .order('created_at', { ascending: true }),
    supabase
      .from('accounts')
      .select('name, plaid_item_id')
      .eq('household_id', ctx.householdId)
      .not('plaid_item_id', 'is', null)
      .is('archived_at', null)
      .order('name'),
  ])

  return (
    <div className="flex flex-col gap-6 pb-10">
      <PageHeader
        eyebrow="Setup"
        title="Make it yours."
        subtitle="Household name, who’s in it, and how you slice your spending."
      />

      <Card padding="lg">
        <MapleLabel>Household</MapleLabel>
        <HouseholdForm id={household?.id ?? ''} name={household?.name ?? ''} />
        <div className="mt-4 border-t border-hair pt-4">
          <CloseDayForm closeDay={Number(household?.settlement_close_day ?? 28)} />
        </div>
      </Card>

      <Card padding="lg">
        <MapleLabel>Members</MapleLabel>
        <p className="mt-1 text-[13px] text-ink-2">
          Invite someone by email and they create their own login, pick the name the household sees, and bring in their own accounts. Everyone sees their own money, joint accounts, and whatever is shared with them.
        </p>
        <MembersList
          members={(members ?? []).map((m) => ({
            id: m.id,
            name: m.display_name,
            archived: !!m.archived_at,
            linked: !!m.user_id,
            isMe: m.user_id === ctx.userId,
          }))}
          invites={(invites ?? []).map((i) => ({
            id: i.id as string,
            email: i.email as string,
            role: (i.role as string) ?? 'member',
            expiresAt: i.expires_at as string,
          }))}
          canManage={canManageHousehold(ctx)}
          myMemberId={ctx.memberId}
        />
      </Card>

      <Card padding="lg">
        <BankConnections
          items={(plaidItems ?? []).map((it) => ({
            id: it.id as string,
            institutionName: (it.institution_name as string | null) ?? 'Bank',
            status: it.status as string,
            lastSyncedAt: (it.last_synced_at as string | null) ?? null,
            needsAccountReview: it.needs_account_review === true,
            accountNames: (plaidAccounts ?? [])
              .filter((a) => a.plaid_item_id === it.id)
              .map((a) => a.name as string),
          }))}
        />
      </Card>

      <Card padding="lg">
        <MapleLabel>Default split</MapleLabel>
        <SplitWeightsForm
          members={(members ?? [])
            .filter((m) => !m.archived_at)
            .map((m) => ({ id: m.id, name: m.display_name, weight: Number(m.split_weight ?? 1) }))}
        />
      </Card>

      <Card padding="lg">
        <MapleLabel>Categories</MapleLabel>
        <CategoriesList
          categories={(categories ?? []).map((c) => ({
            id: c.id,
            parent_id: c.parent_id,
            name: c.name,
            archived: !!c.archived_at,
          }))}
        />
      </Card>

      <NotificationSettings
        prefs={{
          ...DEFAULT_PREFS,
          ...((household?.notification_prefs as Partial<NotificationPrefs> | null) ?? {}),
        }}
      />
    </div>
  )
}
