import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { MapleLabel } from '@/components/ui/label'
import { HouseholdForm } from './household-form'
import { MembersList } from './members-list'
import { CategoriesList } from './categories-list'
import { NotificationSettings } from './notifications'
import { DEFAULT_PREFS, type NotificationPrefs } from './notification-prefs'

/**
 * Setup — the canonical home for household name, members, and categories.
 * Three cards stacked so it reads like a preferences screen.
 */
export default async function SetupPage() {
  const ctx = await getHouseholdContext()
  if (!ctx) return null
  const supabase = await createClient()

  const [{ data: household }, { data: members }, { data: categories }] = await Promise.all([
    supabase.from('households').select('id, name, notification_prefs').eq('id', ctx.householdId).single(),
    supabase
      .from('members')
      .select('id, display_name, sort_order, archived_at')
      .eq('household_id', ctx.householdId)
      .order('sort_order'),
    supabase
      .from('categories')
      .select('id, parent_id, name, rollover_enabled, sort_order, archived_at')
      .eq('household_id', ctx.householdId)
      .order('sort_order'),
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
      </Card>

      <Card padding="lg">
        <MapleLabel>Members</MapleLabel>
        <MembersList
          members={(members ?? []).map((m) => ({
            id: m.id,
            name: m.display_name,
            archived: !!m.archived_at,
          }))}
        />
      </Card>

      <Card padding="lg">
        <MapleLabel>Categories</MapleLabel>
        <CategoriesList
          categories={(categories ?? []).map((c) => ({
            id: c.id,
            parent_id: c.parent_id,
            name: c.name,
            rollover: !!c.rollover_enabled,
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
