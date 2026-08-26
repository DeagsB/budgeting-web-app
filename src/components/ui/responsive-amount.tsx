import { Amount } from '@/components/ui/amount'

type Props = Parameters<typeof Amount>[0]

/**
 * Amount that abbreviates on narrow screens ("$12.3K") and shows the full
 * value with cents from `sm` up. Meant for compact stat tiles sitting three
 * abreast on a 375px screen, where a full "$12,345.67" would truncate.
 */
export function ResponsiveAmount(props: Omit<Props, 'compact'>) {
  return (
    <>
      <span className="sm:hidden">
        <Amount {...props} compact />
      </span>
      <span className="hidden sm:inline">
        <Amount {...props} />
      </span>
    </>
  )
}
