type Category = { id: string; parent_id: string | null; name: string }

/**
 * Maple-styled hierarchical category select. Renders parent categories as
 * optgroup headers with their own selectable option, then indented children.
 *
 * The `compact` prop is used inside split editors and inline row-edit forms
 * where vertical space matters.
 */
export function CategorySelect({
  name,
  categories,
  defaultValue,
  value,
  onChange,
  compact,
  required,
}: {
  name?: string
  categories: Category[]
  defaultValue?: string
  value?: string
  onChange?: (v: string) => void
  compact?: boolean
  required?: boolean
}) {
  const parents = categories.filter((c) => !c.parent_id)
  const childrenOf = (id: string) => categories.filter((c) => c.parent_id === id)

  const common = {
    name,
    required,
    className: compact ? 'maple-select sm' : 'maple-select',
  }

  return (
    <select
      {...common}
      {...(value !== undefined
        ? { value, onChange: (e) => onChange?.(e.target.value) }
        : { defaultValue: defaultValue ?? '' })}
    >
      <option value="">— Uncategorized —</option>
      {parents.map((p) => {
        const kids = childrenOf(p.id)
        return (
          <optgroup key={p.id} label={p.name}>
            <option value={p.id}>{p.name}</option>
            {kids.map((c) => (
              <option key={c.id} value={c.id}>
                {'\u00A0\u00A0↳ '}
                {c.name}
              </option>
            ))}
          </optgroup>
        )
      })}
    </select>
  )
}
