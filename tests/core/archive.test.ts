import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setOutput } from '@actions/core'
import { getPatchDiff, removeRemovedClientFiles } from '../../src/core/patcher'
import { downloadFullClient, downloadPatchFiles } from '../../src/core/downloader'
import { validateClientFiles } from '../../src/core/validator'
import { archiveClientFiles } from '../../src/core/archiver'
import { buildFromArchives } from '../../src/core/cache'
import type { ClientFilePair, PatchDiff } from '../../src/core/types'

const makeClientFilePair = (path: string): ClientFilePair => {
  return {
    localFile: {} as ClientFilePair['localFile'],
    remoteFile: { path } as ClientFilePair['remoteFile'],
  }
}

const makePatchDiff = (input: Partial<PatchDiff>): PatchDiff => {
  return {
    clientFiles: [],
    patchFiles: [],
    newFiles: [],
    changedFiles: [],
    removedFiles: [],
    addedCount: 0,
    updatedCount: 0,
    removedCount: 0,
    sizeDelta: 0,
    remoteBaseUrl: 'http://example.com',
    ...input,
  }
}

const mockActionCore = vi.hoisted(() => ({
  setFailed: vi.fn(),
  setOutput: vi.fn(),
}))

const mockFs = vi.hoisted(() => ({
  writeFile: vi.fn(),
}))

vi.mock('@actions/core', () => ({
  setOutput: mockActionCore.setOutput,
  setFailed: mockActionCore.setFailed,
}))

vi.mock('node:fs/promises', () => ({
  writeFile: mockFs.writeFile,
}))

vi.mock('../../src/core/patcher', () => ({
  getPatchDiff: vi.fn(),
  removeRemovedClientFiles: vi.fn(),
}))

vi.mock('../../src/core/downloader', () => ({
  downloadFullClient: vi.fn(),
  downloadPatchFiles: vi.fn(),
}))

vi.mock('../../src/core/validator', () => ({
  validateClientFiles: vi.fn(),
}))

vi.mock('../../src/core/archiver', () => ({
  archiveClientFiles: vi.fn(),
}))

vi.mock('../../src/core/cache', () => ({
  buildFromArchives: vi.fn(),
}))

describe('main entrypoint argument validation', () => {
  let originalArgv: string[]
  let originalNodeEnv: string | undefined
  let originalVitestEnv: string | undefined

  beforeEach(() => {
    vi.resetModules()
    mockActionCore.setFailed.mockReset()
    originalArgv = [...process.argv]
    originalNodeEnv = process.env.NODE_ENV
    originalVitestEnv = process.env.VITEST
    vi.mocked(getPatchDiff).mockReset()
    vi.mocked(removeRemovedClientFiles).mockReset()
    vi.mocked(downloadFullClient).mockReset()
    vi.mocked(downloadPatchFiles).mockReset()
    vi.mocked(validateClientFiles).mockReset()
    vi.mocked(archiveClientFiles).mockReset()
    vi.mocked(buildFromArchives).mockReset()
    mockFs.writeFile.mockReset()
    vi.mocked(setOutput).mockReset()
  })

  afterEach(() => {
    process.argv = originalArgv
    process.env.NODE_ENV = originalNodeEnv
    process.env.VITEST = originalVitestEnv
  })

  it('should fail when mode is invalid', async () => {
    process.argv = [
      'node',
      'src/archive.ts',
      '--endpoint=http://example.com',
      '--id=ABCDEFGHIJKLMNO',
      '--version=123',
      '--mode=invalid',
    ]

    await import('../../src/archive.js')

    await vi.waitFor(() => {
      expect(mockActionCore.setFailed).toHaveBeenCalledTimes(1)
      const error = mockActionCore.setFailed.mock.calls[0][0] as Error
      expect(error).toBeInstanceOf(Error)
      expect(error.message).toContain('Invalid patch mode: invalid')
    })
  })

  it('should fail when version is not a positive integer', async () => {
    process.argv = [
      'node',
      'src/archive.ts',
      '--endpoint=http://example.com',
      '--id=ABCDEFGHIJKLMNO',
      '--version=NaN',
      '--mode=kart',
    ]

    await import('../../src/archive.js')

    await vi.waitFor(() => {
      expect(mockActionCore.setFailed).toHaveBeenCalledTimes(1)
      const error = mockActionCore.setFailed.mock.calls[0][0] as Error
      expect(error).toBeInstanceOf(Error)
      expect(error.message).toContain('Invalid patch version: NaN')
    })
  })

  it('should download full client when validation marks all files invalid', async () => {
    process.argv = [
      'node',
      'src/archive.ts',
      '--endpoint=http://example.com',
      '--id=ABCDEFGHIJKLMNO',
      '--version=3502',
      '--mode=kart',
    ]

    const clientFiles = [
      makeClientFilePair('Data/a.rho'),
      makeClientFilePair('Data/b.rho'),
    ]

    vi.mocked(getPatchDiff).mockResolvedValue(makePatchDiff({
      clientFiles,
      patchFiles: [],
    }))
    vi.mocked(validateClientFiles)
      .mockResolvedValueOnce(clientFiles)
      .mockResolvedValueOnce([])

    await import('../../src/archive.js')

    await vi.waitFor(() => {
      expect(downloadFullClient).toHaveBeenCalledTimes(1)
      expect(getPatchDiff).toHaveBeenCalledTimes(1)
      expect(validateClientFiles).toHaveBeenCalledTimes(2)
      expect(removeRemovedClientFiles).toHaveBeenCalledWith([])
      expect(downloadPatchFiles).not.toHaveBeenCalled()
      expect(archiveClientFiles).not.toHaveBeenCalled()
    })
  })

  it('should set noClientCache output when no downloads and no removals are needed', async () => {
    process.argv = [
      'node',
      'src/archive.ts',
      '--endpoint=http://example.com',
      '--id=ABCDEFGHIJKLMNO',
      '--version=3502',
      '--mode=kart',
    ]

    vi.mocked(getPatchDiff).mockResolvedValue(makePatchDiff({
      clientFiles: [
        makeClientFilePair('Data/a.rho'),
      ],
      patchFiles: [],
    }))

    vi.mocked(validateClientFiles).mockResolvedValue([])

    await import('../../src/archive.js')

    await vi.waitFor(() => {
      expect(setOutput).toHaveBeenCalledWith('noClientCache', true)
      expect(removeRemovedClientFiles).toHaveBeenCalledWith([])
      expect(downloadFullClient).not.toHaveBeenCalled()
      expect(downloadPatchFiles).not.toHaveBeenCalled()
    })
  })

  it('should remove removed files in step 2 before validation', async () => {
    process.argv = [
      'node',
      'src/archive.ts',
      '--endpoint=http://example.com',
      '--id=ABCDEFGHIJKLMNO',
      '--version=3502',
      '--mode=kart',
    ]

    vi.mocked(getPatchDiff).mockResolvedValue(makePatchDiff({
      clientFiles: [
        makeClientFilePair('Data/a.rho'),
        makeClientFilePair('Data/b.rho'),
      ],
      patchFiles: [
        makeClientFilePair('Data/a.rho'),
      ],
      changedFiles: ['Data/a.rho'],
      removedFiles: ['Data/removed.rho'],
    }))

    vi.mocked(validateClientFiles).mockResolvedValue([])

    await import('../../src/archive.js')

    await vi.waitFor(() => {
      expect(removeRemovedClientFiles).toHaveBeenCalledWith(['Data/removed.rho'])
      expect(validateClientFiles).toHaveBeenCalled()

      const removeOrder = vi.mocked(removeRemovedClientFiles).mock.invocationCallOrder[0]
      const validateOrder = vi.mocked(validateClientFiles).mock.invocationCallOrder[0]
      expect(removeOrder).toBeLessThan(validateOrder)
    })
  })

  it('should set noFullClientCache output when cache builder finds no full archives', async () => {
    process.env.NODE_ENV = 'production'
    process.env.VITEST = 'false'
    process.argv = [
      'node',
      'src/archive.ts',
      '--endpoint=http://example.com',
      '--id=ABCDEFGHIJKLMNO',
      '--version=3502',
      '--mode=kart',
    ]

    vi.mocked(getPatchDiff).mockResolvedValue(makePatchDiff({
      clientFiles: [
        makeClientFilePair('Data/a.rho'),
      ],
      patchFiles: [],
    }))
    vi.mocked(validateClientFiles).mockResolvedValue([])
    vi.mocked(buildFromArchives).mockResolvedValue(false)

    await import('../../src/archive.js')

    await vi.waitFor(() => {
      expect(buildFromArchives).toHaveBeenCalledTimes(1)
      expect(setOutput).toHaveBeenCalledWith('noFullClientCache', true)
    })
  })
})
