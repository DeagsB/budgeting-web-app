type Category = { id: string; parent_id: string | null; name: string }

export function CategorySelect({
  name,
  categories,
  defaultValue,
}: {
  name: string
  categories: Category[]
  defaultValue?: string
}) {
  const parents = categories.filter((c) => !c.parent_id)
  const childrenOf = (id: string) => categories.filter((c) => c.parent_id === id)

  return (
    <select name={name} defaultValue={defaultValue ?? ''} className="rounded border border-gray-300 px-3 py-2">
      <option value="">— uncategorized —</option>
      {parents.map((p) => {
        const kids = childrenOf(p.id)
        return (
          <optgroup key={p.id} label={p.name}>
            <option value={p.id}>{p.name}</option>
            {kids.map((c) => (
              <option key={c.id} value={c.id}>
                &nbsp;&nbsp;↳ {c.name}
              </option>
            ))}
          </optgroup>
        )
      })}
    </select>
  )
}
