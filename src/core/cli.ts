import type { KartPatchServerInfo } from './types'
import type { CliArgsMap } from '../lib/utils'

export const parseCliArgs = (args: CliArgsMap): KartPatchServerInfo => {
  if (!args.endpoint || !args.id || !args.version || !args.mode)
    throw new Error('Patch info not properly provided. Received: ' + JSON.stringify(args))

  const version = Number(args.version)
  if (!Number.isFinite(version) || !Number.isInteger(version) || version <= 0)
    throw new Error(`Invalid patch version: ${args.version}`)

  if (args.mode !== 'kart' && args.mode !== 'tcg')
    throw new Error(`Invalid patch mode: ${args.mode}`)

  return {
    endpoint: args.endpoint,
    id: args.id,
    version,
    mode: args.mode,
  }
}
