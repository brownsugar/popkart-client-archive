export const getOptionalEnv = (name: string): string | undefined => {
  const value = process.env[name]
  if (!value)
    return undefined

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export const getRequiredEnv = (name: string): string => {
  const value = getOptionalEnv(name)
  if (!value)
    throw new Error(`Required environment variable is missing: ${name}`)

  return value
}
