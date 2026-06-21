import { resolve } from 'node:path'
import { consola } from 'consola'
import { Zip } from 'zip-lib'
import { removeDirectory } from '../lib/utils'
import { resolveArchivesDir } from '../lib/paths'
import type { ClientFilePair, KartPatchServerInfo } from './types'
import meta from '../../meta.json'

const ZIP_CHUNK_SIZE_BYTES = 2 * 1024 * 1024 * 1024 // 2GB

interface ChunkFile {
  srcPath: string
  metaPath: string
}

export const archiveClientFiles = async (
  clientFiles: ClientFilePair[],
  patchFiles: ClientFilePair[],
  patchInfo: KartPatchServerInfo,
): Promise<void> => {
  consola.start('Start archiving client files...')

  const archivesPath = resolveArchivesDir()
  await removeDirectory(archivesPath)

  const archiveSet = [
    { type: 'patch', files: patchFiles },
    { type: 'full', files: clientFiles },
  ] as const

  for (const { type, files } of archiveSet) {
    if (files.length === 0) continue

    consola.info(`Archiving ${type} files...`)

    const chunks: ChunkFile[][] = []
    let currentChunk: ChunkFile[] = []
    let currentSize = 0

    for (let i = 0; i < files.length; i++) {
      const { localFile, remoteFile } = files[i]
      currentChunk.push({
        srcPath: localFile.path,
        metaPath: remoteFile.path,
      })
      currentSize += remoteFile.size

      if (currentSize >= ZIP_CHUNK_SIZE_BYTES || i === files.length - 1) {
        if (currentSize >= ZIP_CHUNK_SIZE_BYTES && i !== files.length - 1) {
          const lastFile = currentChunk.pop()!
          chunks.push(currentChunk)
          currentChunk = [lastFile]
          currentSize = remoteFile.size
        } else {
          chunks.push(currentChunk)
          currentChunk = []
          currentSize = 0
        }
      }
    }

    for (let i = 0; i < chunks.length; i++) {
      const chunkFiles = chunks[i]
      let zipName = 'PopKart_'
      if (type === 'full')
        zipName += `Client`
      else
        zipName += `Patch_P${meta.version}`

      zipName += `_P${patchInfo.version}_${(i + 1).toString().padStart(2, '0')}.zip`

      const destPath = resolve(archivesPath, zipName)
      consola.log(`Archiving chunk ${i + 1} of ${chunks.length}: ${destPath}`)

      const zip = new Zip()
      chunkFiles.forEach(file => {
        zip.addFile(file.srcPath, file.metaPath)
      })
      await zip.archive(destPath)
    }
  }

  consola.success('Client files archived.')
}
