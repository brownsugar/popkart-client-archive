import { copyFile, mkdir, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { resolveArchivesDir, resolveCacheDir } from '../lib/paths'
import { removeDirectory } from '../lib/utils'

export const buildFromArchives = async (): Promise<boolean> => {
  const archivesDir = resolveArchivesDir()

  let archiveNames: string[]
  try {
    archiveNames = await readdir(archivesDir)
  } catch {
    return false
  }

  const fullClientArchives = archiveNames
    .filter(name => name.startsWith('PopKart_Client') && name.toLowerCase().endsWith('.zip'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

  if (fullClientArchives.length === 0)
    return false

  const cacheDir = resolveCacheDir()
  await removeDirectory(cacheDir)
  await mkdir(cacheDir, { recursive: true })

  for (let index = 0; index < fullClientArchives.length; index++) {
    const sourceName = fullClientArchives[index]
    const sourcePath = resolve(archivesDir, sourceName)
    const targetPath = resolve(cacheDir, `PopKart_Client_${index + 1}.zip`)
    await copyFile(sourcePath, targetPath)
  }

  return true
}
