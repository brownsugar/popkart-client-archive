import { resolve } from 'node:path'
import { rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { consola } from 'consola'
import { setOutput, setFailed } from '@actions/core'
import EasyDl from 'easydl'
import { move } from 'fs-extra'
import { extract, Zip } from 'zip-lib'
import { KartNfo2, KartTxf, KartLocalFile, TcgLocalFile } from './lib/kart-files'
import {
  removeDirectory,
  createDirectory,
  resolveUrl,
  clearStdoutLastLine,
  ungzip,
  filetimeToUnix,
  getArgs,
} from './lib/utils'
import packageJson from '../package.json'
import meta from '../meta.json'
import type { KartPatchServerInfo } from './lib/kart-patch'
import type { KartPatchFile, TcgPatchFile } from './lib/kart-files'

type archiveType = 'patch' | 'full'

const run = async () => {
  const t0 = performance.now()
  const getPerformanceResult = () => {
    const t1 = performance.now()
    return ((t1 - t0) / 1000).toFixed(2)
  }
  try {
    consola.box(`PopKart Client archiver v${packageJson.version}`)

    consola.start('Retrieving patch info...')
    const args = getArgs()
    if (!args.endpoint || !args.id || !args.version || !args.mode)
      throw new Error('Patch info not properly provided.')
    const patchInfo: KartPatchServerInfo = {
      endpoint: args.endpoint,
      id: args.id,
      version: Number(args.version),
      mode: args.mode as KartPatchServerInfo['mode'],
    }
    consola.success('Patch info retrieved.\n', patchInfo)

    consola.start('Loading client files...')
    let remoteBaseUrl = ''
    let patchFileList: KartPatchFile[] | TcgPatchFile[] = []
    if (patchInfo.mode === 'tcg') {
      remoteBaseUrl = patchInfo.endpoint
      const txf = new KartTxf(remoteBaseUrl)
      consola.log('TXF URL:', txf.url)
      patchFileList = await txf.load()
    } else {
      remoteBaseUrl = resolveUrl(patchInfo.version.toString(), patchInfo.endpoint)
      const nfo2 = new KartNfo2(remoteBaseUrl)
      consola.log('NFO2 URL:', nfo2.url)
      patchFileList = await nfo2.load()
    }
    const rootDir = process.cwd()
    const clientDir = resolve(rootDir, 'client')
    const tempDir = resolve(clientDir, 'temp')
    const clientFiles = patchFileList
      .map((patchFile: KartPatchFile | TcgPatchFile) => ({
        localFile: patchInfo.mode === 'tcg'
          ? new TcgLocalFile(clientDir, patchFile.path, tempDir)
          : new KartLocalFile(clientDir, patchFile.path, tempDir),
        patchFile,
      }))
    const clientFileCount = clientFiles.length
    consola.success(`Client files loaded. (${clientFileCount} files)`)

    const isHashMatched = (localFile: KartLocalFile | TcgLocalFile, patchFile: KartPatchFile | TcgPatchFile) => {
      const value1 = localFile.isTcgMode()
        ? localFile.md5
        : localFile.crc
      const value2 = patchFile.isTcgMode()
        ? patchFile.md5
        : patchFile.crc
      return value1 === value2
    }

    consola.start('Filtering client files...')
    const patchFiles: typeof clientFiles = []
    for (const { localFile, patchFile } of clientFiles) {
      const succeed = await localFile.loadMeta()
      if (succeed && isHashMatched(localFile, patchFile))
        continue
      patchFiles.push({ localFile, patchFile })
    }
    const patchFileCount = patchFiles.length
    consola.success(`Client files filtered. (${patchFileCount} files to download)`)

    let downloadNeeded = true
    if (patchFileCount === clientFileCount) {
      consola.info('No client cache found, downloading full client...')
      const clientArchiveUrl = process.env.CLIENT_ARCHIVE_URL
      if (!clientArchiveUrl)
        throw new Error('Client archive URL not provided.')
      const clientArchivePath = resolve(rootDir, 'PopKart_Client.zip')
      const downloader = new EasyDl(
        clientArchiveUrl,
        clientArchivePath,
        {
          existBehavior: 'overwrite',
        },
      )
      await downloader.wait()
      consola.success('Full client downloaded.')

      consola.info('Extracing full client...')
      await extract(clientArchivePath, clientDir)
      consola.success('Full client extracted. The archiver will be re-run.')
      run()
      return
    } else if (patchFileCount === 0) {
      consola.info('Nothing to download.')
      downloadNeeded = false
      setOutput('noClientCache', true)
    }

    const eachFile = async (type: archiveType, cb: (
      i: number,
      localFile: KartLocalFile | TcgLocalFile,
      patchFile: KartPatchFile | TcgPatchFile,
      fileCount: number
    ) => Promise<void>) => {
      const baseFiles = type === 'patch'
        ? patchFiles
        : clientFiles
      const fileCount = baseFiles.length
      for (const _i in baseFiles) {
        const i = Number(_i)
        const { localFile, patchFile } = baseFiles[i]
        await cb(i, localFile, patchFile, fileCount)
      }
    }

    if (downloadNeeded) {
      consola.start('Downloading client files...')
      await removeDirectory(tempDir)
      await eachFile('patch', async (i, localFile, patchFile, fileCount) => {
        consola.log(`Downloading file ${i + 1} of ${fileCount}: ${patchFile.path}...`)
        const localPath = localFile.getDownloadPath()
        await createDirectory(localPath)

        const downloader = new EasyDl(
          resolveUrl(localFile.getRawFilePath(), remoteBaseUrl),
          localPath,
          {
            connections: 8,
            maxRetry: 5,
          },
        )
        await downloader.wait()
        clearStdoutLastLine()
      })
      consola.success(`Client files downloaded.`)

      if (patchInfo.mode === 'kart') {
        consola.start('Extracing client files...')
        await eachFile('patch', async (i, localFile, patchFile, fileCount) => {
          consola.log(`Extracing file ${i + 1} of ${fileCount}: ${patchFile.path}...`)

          const path = localFile.getDownloadPath()
          await ungzip(path)
          await rm(path)
          if (!localFile.isTcgMode())
            localFile.extracted = true
          await move(localFile.getDownloadPath(), localFile.getDestinationPath(), {
            overwrite: true,
          })
          clearStdoutLastLine()
        })
        await removeDirectory(tempDir)
        consola.success('Client files extracted.')
      }
    }

    consola.start('Validating client files...')
    await eachFile('full', async (i, localFile, patchFile, fileCount) => {
      consola.log(`Validating file ${i + 1} of ${fileCount}: ${patchFile.path}...`)

      if (!existsSync(localFile.path))
        throw new Error('File not found: ' + localFile.filePath)

      // Check file hash
      await localFile.loadMeta()
      if (!isHashMatched(localFile, patchFile))
        throw new Error('File hash mismatch: ' + localFile.filePath)

      // Restore file modification time
      if (!patchFile.isTcgMode()) {
        const { utimes } = require('utimes')
        await utimes(localFile.path, {
          mtime: filetimeToUnix(patchFile.dwHighDateTime, patchFile.dwLowDateTime),
        })
      }

      clearStdoutLastLine()
    })
    consola.success('Client files validated.')

    consola.start('Archiving client files...')
    interface ChunkFile {
      srcPath: string
      filePath: string
    }
    interface archiveFile {
      type: archiveType
      chunks: ChunkFile[][]
    }
    const archiveFiles: archiveFile[] = [
      {
        type: 'patch',
        chunks: [],
      },
      {
        type: 'full',
        chunks: [],
      },
    ]
    const archivesPath = resolve(rootDir, 'archives')
    await removeDirectory(archivesPath)
    const zipChunkSize = 2 * 1024 * 1024 * 1024 // 2GB
    for (const archive of archiveFiles) {
      consola.info(`Archiving ${archive.type} files...`)
      let zipChunkFiles: ChunkFile[] = []
      let zipSize = 0
      await eachFile(archive.type, async (i, localFile, patchFile, fileCount) => {
        zipChunkFiles.push({
          srcPath: localFile.path,
          filePath: patchFile.path,
        })
        zipSize += patchFile.size
        if (zipSize >= zipChunkSize) {
          const file = zipChunkFiles.pop()
          archive.chunks.push(zipChunkFiles)
          zipSize = patchFile.size
          zipChunkFiles = [file]
        }
        if (i === fileCount - 1)
          archive.chunks.push(zipChunkFiles)
      })
      for (const _i in archive.chunks) {
        const i = Number(_i)
        const files = archive.chunks[i]
        let zipName = 'PopKart_'
        if (archive.type === 'full')
          zipName += `Client`
        else
          zipName += `Patch_P${meta.version}`
        zipName += `_P${patchInfo.version}_${(i + 1).toString().padStart(2, '0')}.zip`
        const destPath = resolve(archivesPath, zipName)
        consola.log(`Archiving chunk ${i + 1} of ${archive.chunks.length}: ${destPath}`)
        const zip = new Zip()
        files.forEach(file => {
          zip.addFile(file.srcPath, file.filePath)
        })
        await zip.archive(destPath)
      }
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
  } catch (e) {
    consola.log(`Done with an error occurred in ${getPerformanceResult()}s.`)
    setFailed(e)
  } finally {
    consola.success(`Done in ${getPerformanceResult()}s.`)
  }
}
run()
