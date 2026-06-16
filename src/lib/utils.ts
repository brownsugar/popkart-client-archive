import { dirname } from 'node:path'
import { mkdir, rm } from 'node:fs/promises'
import { createReadStream, createWriteStream } from 'node:fs'
import { createGunzip } from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import crypto from 'node:crypto'

export type CliArgsMap = Partial<Record<string, string>>

export const resolveUrl = (input: string, base: string) => {
  return input
    ? base.replace(/\/+$/, '') + '/' + input.replace(/^\/+/, '')
    : base
}

export const createDirectory = (path: string) => {
  const dir = dirname(path)
  return mkdir(dir, {
    recursive: true,
  })
}

export const removeDirectory = (path: string) => {
  return rm(path, {
    recursive: true,
    force: true,
  })
}

export const ungzip = async (path: string) => {
  const destinationPath = path.replace(/\.gz$/i, '')
  await pipeline(
    createReadStream(path),
    createGunzip(),
    createWriteStream(destinationPath),
  )
}

export const generateMd5 = (path: string) => {
  return new Promise<string>((resolve, reject) => {
    const hash = crypto.createHash('md5')
    const stream = createReadStream(path)
    stream.on('data', data => {
      const chunk = typeof data === 'string'
        ? new TextEncoder().encode(data)
        : new Uint8Array(data)
      hash.update(chunk)
    })
    stream.on('end', () => {
      resolve(hash.digest('hex'))
    })
    stream.on('error', e => {
      reject(e)
    })
  })
}

export const filetimeToUnix = (high: number, low: number) => {
  // Diff between Windows epoch 1601-01-01 00:00:00 & Unix epoch 1970-01-01 00:00:00
  const diff = 11644473600000n
  const filetime = (BigInt(high >>> 0) << 32n) + BigInt(low >>> 0)
  const timestamp = filetime / 10000n - diff
  return Number(timestamp)
}

export const getElapsedSeconds = (startTime: number) => {
  return ((performance.now() - startTime) / 1000).toFixed(2)
}

export const getArgs = (): CliArgsMap => {
  const argv = process.argv ?? []
  return argv
    .reduce((result, string) => {
      if (string.startsWith('--')) {
        const [key, ...value] = string.slice(2).split('=')
        result[key] = value.join('=')
      }
      return result
    }, {} as CliArgsMap)
}

export const clearStdoutLastLine = () => {
  if (process.stdout.isTTY) {
    process.stdout.moveCursor(0, -1)
    process.stdout.clearLine(1)
  }
}

export const concurrentMap = async <T, R>(
  items: T[],
  mapper: (item: T, index: number, array: T[]) => Promise<R>,
  concurrency: number,
): Promise<R[]> => {
  const results: R[] = new Array(items.length)
  let currentIndex = 0

  const worker = async () => {
    while (currentIndex < items.length) {
      const index = currentIndex++
      results[index] = await mapper(items[index], index, items)
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, worker)
  await Promise.all(workers)
  return results
}

export const withRetry = async <T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 1000,
): Promise<T> => {
  try {
    return await fn()
  } catch (e) {
    if (retries <= 0) throw e
    await new Promise(resolve => setTimeout(resolve, delay))
    return withRetry(fn, retries - 1, delay * 2)
  }
}
