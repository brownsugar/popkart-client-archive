import { resolve } from 'node:path'
import { rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { consola } from 'consola'
import EasyDl from 'easydl'
import { move } from 'fs-extra'
import { Zip } from 'zip-lib'
import KartPatchSocket from './lib/kart-patch-socket'
import { KartNfo2, LocalFile } from './lib/kart-files'
import {
  emptyDirectory,
  createDirectory,
  resolveUrl,
  clearStdoutLastLine,
  ungzip,
  filetimeToUnix,
} from './lib/utils'
import packageJson from '../package.json'
import server from '../server.json'
import meta from '../meta.json'
import type { PatchFile } from './lib/kart-files'

const run = async () => {
  const t0 = performance.now()
  const getPerformanceResult = () => {
    const t1 = performance.now()
    return ((t1 - t0) / 1000).toFixed(2)
  }
  try {
    consola.box(`PopKart Client archiver v${packageJson.version}`)

    consola.start('Loading patch info...')
    const socket = new KartPatchSocket()
    const patchInfo = await socket.connect(server.host, server.port)
    consola.success('Patch info loaded.\n', patchInfo)

    consola.start('Checking version...')
    if (meta.version && meta.version >= patchInfo.version) {
      consola.success(`Client is up-to-date, nothing to do. Current version: ${meta.version}.`)
      return
    }
    consola.success(`New version found, previous version: ${meta.version}, latest version: ${patchInfo.version}.`)

    consola.start('Loading client files...')
    const remoteBaseUrl = resolveUrl(patchInfo.version.toString(), patchInfo.endpoint)
    const nfo2 = new KartNfo2(remoteBaseUrl)
    consola.log('NFO2 URL:', nfo2.url)
    const rootDir = process.cwd()
    const baseDir = resolve(rootDir, 'client')
    const tempDir = resolve(baseDir, 'temp')
    const clientFiles = (await nfo2.load())
      .map(patchFile => ({
        localFile: new LocalFile(baseDir, patchFile.path, tempDir),
        patchFile,
      }))
    const clientFileCount = clientFiles.length
    consola.success(`Client files loaded. (${clientFileCount} files)`)

    const eachClientFiles = async (cb: (i: number, localFile: LocalFile, patchFile: PatchFile) => Promise<void>) => {
      for (const _i in clientFiles) {
        const i = Number(_i)
        const { localFile, patchFile } = clientFiles[i]
        await cb(i, localFile, patchFile)
      }
    }

    consola.start('Downloading client files...')
    await emptyDirectory(tempDir)
    await eachClientFiles(async (i, localFile, patchFile) => {
      consola.log(`Downloading file ${i + 1} of ${clientFileCount}: ${patchFile.path}...`)
      const localPath = localFile.getDownloadPath()
      await createDirectory(localPath)

      const downloader = new EasyDl(
        resolveUrl(localFile.getRawFilePath(), remoteBaseUrl),
        localPath,
        {
          connections: 8,
          maxRetry: 5,
        }
      )
      await downloader.wait()
      clearStdoutLastLine()
    })
    consola.success(`Client files downloaded.`)

    consola.start('Extracing client files...')
    await eachClientFiles(async (i, localFile, patchFile) => {
      consola.log(`Extracing file ${i + 1} of ${clientFileCount}: ${patchFile.path}...`)

      const path = localFile.getDownloadPath()
      await ungzip(path)
      await rm(path)
      localFile.extracted = true
      await move(localFile.getDownloadPath(), localFile.getDestinationPath(), {
        overwrite: true,
      })
      clearStdoutLastLine()
    })
    await emptyDirectory(tempDir)
    consola.success('Client files extracted.')

    consola.start('Validating client files...')
    await eachClientFiles(async (i, localFile, patchFile) => {
      consola.log(`Validating file ${i + 1} of ${clientFileCount}: ${patchFile.path}...`)

      if (!existsSync(localFile.path))
        throw new Error('File not found: ' + localFile.filePath)

      // Check file CRC
      await localFile.loadMeta()
      if (localFile.crc !== patchFile.crc)
        throw new Error('File CRC mismatch: ' + localFile.filePath)

      // Restore file modification time
      const { utimes } = require('utimes')
      await utimes(localFile.path, {
        mtime: filetimeToUnix(patchFile.dwHighDateTime, patchFile.dwLowDateTime),
      })
      clearStdoutLastLine()
    })
    consola.success('Client files validated.')

    consola.start('Archiving client files...')
    interface ChunkFile {
      srcPath: string
      filePath: string
    }
    const zipChunks: ChunkFile[][] = []
    const zipChunkSize = 2 * 1024 * 1024 * 1024 // 2GB
    let zipChunkFiles: ChunkFile[] = []
    let zipSize = 0
    await eachClientFiles(async (i, localFile, patchFile) => {
      zipChunkFiles.push({
        srcPath: localFile.path,
        filePath: patchFile.path,
      })
      zipSize += patchFile.size
      if (zipSize >= zipChunkSize || i === clientFileCount - 1) {
        zipChunks.push(zipChunkFiles)
        zipSize = 0
        zipChunkFiles = []
      }
    })
    const archivesPath = resolve(rootDir, 'archives')
    await emptyDirectory(archivesPath)
    for (const _i in zipChunks) {
      const i = Number(_i)
      const files = zipChunks[i]
      const zipName = `PopKart_Client_P${patchInfo.version}_${(i + 1).toString().padStart(2, '0')}.zip`
      const destPath = resolve(archivesPath, zipName)
      consola.log(`Archiving chunk ${i + 1} of ${zipChunks.length}: ${destPath}`)
      const zip = new Zip()
      files.forEach(file => {
        zip.addFile(file.srcPath, file.filePath)
      })
      await zip.archive(destPath)
    }
    consola.success('Client files archived.')

    consola.start('Updating meta file...')
    meta.id = patchInfo.id
    meta.version = patchInfo.version
    meta.timestamp = Date.now()
    const metaPath = resolve(rootDir, 'meta.json')
    await writeFile(metaPath, JSON.stringify(meta, null, 2), {
      flag: 'w',
    })
    consola.success('Meta file updated.')
    consola.success(`Done in ${getPerformanceResult()}s.`)
  } catch (e) {
    consola.fatal('An error occurred.', e)
    consola.log(`Done in ${getPerformanceResult()}s.`)
    process.exit(1)
  }
}
run()
