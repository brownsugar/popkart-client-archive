import { describe, it, expect, vi, beforeEach } from 'vitest'
import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { utimes } from 'utimes'
import { validateClientFiles } from '../../src/core/validator'
import * as patcher from '../../src/core/patcher'

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}))

vi.mock('node:fs/promises', () => ({
  rm: vi.fn(),
}))

vi.mock('utimes', () => ({
  utimes: vi.fn(),
}))

vi.mock('../../src/lib/utils', async () => {
  const actual = await vi.importActual('../../src/lib/utils')
  return {
    ...actual,
    clearStdoutLastLine: vi.fn(),
    filetimeToUnix: vi.fn().mockReturnValue(1700000000000),
    concurrentMap: vi.fn(async (items: unknown[], mapper: (item: unknown) => Promise<void>) => {
      for (const item of items)
        await mapper(item)
    }),
  }
})

describe('core/validator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should mark missing files as invalid', async () => {
    vi.mocked(existsSync).mockReturnValue(false)

    const filePair = {
      localFile: {
        path: 'client/missing.bin',
        loadMeta: vi.fn(),
      },
      remoteFile: {
        path: 'missing.bin',
        isTcgMode: () => true,
      },
    }

    const invalid = await validateClientFiles([filePair] as unknown as Parameters<typeof validateClientFiles>[0])

    expect(invalid).toHaveLength(1)
    expect(invalid[0]).toBe(filePair)
  })

  it('should remove corrupted files on hash mismatch', async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.spyOn(patcher, 'getFileHash').mockReturnValue({ local: 'a', remote: 'b' })

    const filePair = {
      localFile: {
        path: 'client/corrupt.bin',
        loadMeta: vi.fn().mockResolvedValue(true),
      },
      remoteFile: {
        path: 'corrupt.bin',
        isTcgMode: () => true,
      },
    }

    const invalid = await validateClientFiles([filePair] as unknown as Parameters<typeof validateClientFiles>[0])

    expect(invalid).toHaveLength(1)
    expect(rm).toHaveBeenCalledWith('client/corrupt.bin', { force: true })
  })

  it('should restore mtime for valid non-tcg files', async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.spyOn(patcher, 'getFileHash').mockReturnValue({ local: 1, remote: 1 })

    const filePair = {
      localFile: {
        path: 'client/ok.bin',
        loadMeta: vi.fn().mockResolvedValue(true),
      },
      remoteFile: {
        path: 'ok.bin',
        isTcgMode: () => false,
        dwHighDateTime: 1,
        dwLowDateTime: 2,
      },
    }

    const invalid = await validateClientFiles([filePair] as unknown as Parameters<typeof validateClientFiles>[0])

    expect(invalid).toHaveLength(0)
    expect(utimes).toHaveBeenCalled()
  })
})
