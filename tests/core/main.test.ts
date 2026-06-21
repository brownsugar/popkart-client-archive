import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setOutput } from '@actions/core'
import { getPatchDiff, removeRemovedClientFiles } from '../../src/core/patcher'
import { downloadFullClient, downloadPatchFiles } from '../../src/core/downloader'
import { validateClientFiles } from '../../src/core/validator'
import { archiveClientFiles } from '../../src/core/archiver'
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
    remoteBaseUrl: 'http://example.com',
    ...input,
  }
}

const mockActionCore = vi.hoisted(() => ({
  setFailed: vi.fn(),
  setOutput: vi.fn(),
}))

vi.mock('@actions/core', () => ({
  setOutput: mockActionCore.setOutput,
  setFailed: mockActionCore.setFailed,
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

describe('main entrypoint argument validation', () => {
  let originalArgv: string[]

  beforeEach(() => {
    vi.resetModules()
    mockActionCore.setFailed.mockReset()
    originalArgv = [...process.argv]
    vi.mocked(getPatchDiff).mockReset()
    vi.mocked(removeRemovedClientFiles).mockReset()
    vi.mocked(downloadFullClient).mockReset()
    vi.mocked(downloadPatchFiles).mockReset()
    vi.mocked(validateClientFiles).mockReset()
    vi.mocked(archiveClientFiles).mockReset()
    vi.mocked(setOutput).mockReset()
  })

  afterEach(() => {
    process.argv = originalArgv
  })

  it('should fail when mode is invalid', async () => {
    process.argv = [
      'node',
      'src/main.ts',
      '--endpoint=http://example.com',
      '--id=ABCDEFGHIJKLMNO',
      '--version=123',
      '--mode=invalid',
    ]

    await import('../../src/main.js')

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
      'src/main.ts',
      '--endpoint=http://example.com',
      '--id=ABCDEFGHIJKLMNO',
      '--version=NaN',
      '--mode=kart',
    ]

    await import('../../src/main.js')

    await vi.waitFor(() => {
      expect(mockActionCore.setFailed).toHaveBeenCalledTimes(1)
      const error = mockActionCore.setFailed.mock.calls[0][0] as Error
      expect(error).toBeInstanceOf(Error)
      expect(error.message).toContain('Invalid patch version: NaN')
    })
  })

  it('should download full client and recompute diff when all files are missing', async () => {
    process.argv = [
      'node',
      'src/main.ts',
      '--endpoint=http://example.com',
      '--id=ABCDEFGHIJKLMNO',
      '--version=3502',
      '--mode=kart',
    ]

    vi.mocked(getPatchDiff)
      .mockResolvedValueOnce(makePatchDiff({
        clientFiles: [
          makeClientFilePair('Data/a.rho'),
          makeClientFilePair('Data/b.rho'),
        ],
        patchFiles: [
          makeClientFilePair('Data/a.rho'),
          makeClientFilePair('Data/b.rho'),
        ],
        newFiles: ['Data/a.rho', 'Data/b.rho'],
      }))
      .mockResolvedValueOnce(makePatchDiff({
        clientFiles: [
          makeClientFilePair('Data/a.rho'),
          makeClientFilePair('Data/b.rho'),
        ],
        patchFiles: [],
      }))

    vi.mocked(validateClientFiles).mockResolvedValue([])

    await import('../../src/main.js')

    await vi.waitFor(() => {
      expect(downloadFullClient).toHaveBeenCalledTimes(1)
      expect(getPatchDiff).toHaveBeenCalledTimes(2)
      expect(removeRemovedClientFiles).toHaveBeenCalledWith([])
      expect(downloadPatchFiles).not.toHaveBeenCalled()
      expect(archiveClientFiles).not.toHaveBeenCalled()
    })
  })

  it('should set noClientCache output when no downloads and no removals are needed', async () => {
    process.argv = [
      'node',
      'src/main.ts',
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

    await import('../../src/main.js')

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
      'src/main.ts',
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

    await import('../../src/main.js')

    await vi.waitFor(() => {
      expect(removeRemovedClientFiles).toHaveBeenCalledWith(['Data/removed.rho'])
      expect(validateClientFiles).toHaveBeenCalled()

      const removeOrder = vi.mocked(removeRemovedClientFiles).mock.invocationCallOrder[0]
      const validateOrder = vi.mocked(validateClientFiles).mock.invocationCallOrder[0]
      expect(removeOrder).toBeLessThan(validateOrder)
    })
  })
})
