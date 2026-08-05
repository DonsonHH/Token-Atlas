export function formatTokens(value: number, digits = 1) {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(digits)}B`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(digits)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(digits)}K`
  return value.toLocaleString("zh-CN")
}

/** Formats a token total as an exact whole number with digit grouping. */
export function formatExactTokens(value: number) {
  return Math.round(value).toLocaleString("zh-CN", {
    maximumFractionDigits: 0,
  })
}

/** Formats Recharts values that are stored in millions of tokens. */
export function formatTokenMillions(value: number) {
  return formatTokens(value * 1_000_000, 0)
}

export function formatCost(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(value)
}

export function formatDate(value: string | null) {
  if (!value) return "暂无活动记录"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat("zh-CN", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  }).format(date)
}

export function formatShortDate(value: string) {
  const pieces = value.split("-")
  return pieces.length === 3 ? `${Number(pieces[1])}/${Number(pieces[2])}` : value
}

export function formatProject(value: string | null) {
  if (!value) return "未归类"
  const parts = value.split(/[\\/]/).filter(Boolean)
  return parts.at(-1) ?? value
}
