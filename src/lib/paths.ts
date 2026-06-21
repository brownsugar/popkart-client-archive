import { resolve } from 'node:path'

export const DIR_NAMES = {
  client: 'client',
  archives: 'archives',
  temp: 'temp',
  tempFullClient: 'temp_full_client',
} as const

export const FILE_NAMES = {
  meta: 'meta.json',
} as const

export const resolveClientDir = (): string => resolve(process.cwd(), DIR_NAMES.client)

export const resolveClientTempDir = (): string =>
  resolve(resolveClientDir(), DIR_NAMES.temp)

export const resolveClientFullTempDir = (): string =>
  resolve(resolveClientDir(), DIR_NAMES.tempFullClient)

export const resolveArchivesDir = (): string => resolve(process.cwd(), DIR_NAMES.archives)

export const resolveMetaPath = (): string => resolve(process.cwd(), FILE_NAMES.meta)
