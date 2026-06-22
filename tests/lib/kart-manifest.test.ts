import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadKartNfo2, loadTcgTxf } from '../../src/lib/kart-manifest'

let fetchMocker: {
  enableMocks: () => void
  resetMocks: () => void
  mockResponseOnce: (body: string) => void
  requests: () => { url: string }[]
}

describe('kart-manifest', () => {
  beforeEach(async () => {
    if (!fetchMocker) {
      const mod = await import('vitest-fetch-mock')
      fetchMocker = mod.default(vi)
      fetchMocker.enableMocks()
    }

    fetchMocker.resetMocks()
  })

  describe('loadKartNfo2', () => {
    it('should correctly parse an NFO2 response', async () => {
      const nfo2Mock = readFileSync(resolve(process.cwd(), 'tests/fixtures/files.nfo2'), 'utf-8')
      fetchMocker.mockResponseOnce(nfo2Mock)

      const endpoint = 'http://kartupdate.tiancity.cn'
      const parsedFiles = await loadKartNfo2(endpoint)

      expect(fetchMocker.requests().length).toBe(1)
      expect(fetchMocker.requests()[0].url).toBe('http://kartupdate.tiancity.cn/files.nfo2')

      expect(parsedFiles.length).toBeGreaterThan(0)
      expect(parsedFiles[0].path).toBe('Data/aaa.pk')
      expect(parsedFiles[0].size).toBe(55991)
      expect(parsedFiles[0].sizeGzipped).toBe(56029)
    })

    it('should throw an error on invalid NFO2 header', async () => {
      fetchMocker.mockResponseOnce('INVALID HEADER\n"fake","fake"')

      await expect(loadKartNfo2('http://kartupdate.tiancity.cn')).rejects.toThrow(/\[KartManifest\]\[NFO2\] Invalid nfo2 file/)
    })

    it('should throw an error when NFO2 fetch returns non-OK status', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response)

      try {
        await expect(loadKartNfo2('http://kartupdate.tiancity.cn')).rejects.toThrow(/\[KartManifest\]\[NFO2\] Failed to fetch nfo2 file: 404 Not Found/)
      } finally {
        fetchSpy.mockRestore()
      }
    })
  })

  describe('loadTcgTxf', () => {
    it('should correctly parse a TXF response', async () => {
      const txfMock = readFileSync(resolve(process.cwd(), 'tests/fixtures/NT.txf'), 'utf-8')
      fetchMocker.mockResponseOnce(txfMock)

      const endpoint = 'http://kartupdate.tiancity.cn'
      const parsedFiles = await loadTcgTxf(endpoint)

      expect(fetchMocker.requests().length).toBe(1)
      expect(fetchMocker.requests()[0].url).toBe('http://kartupdate.tiancity.cn/NT.txf')

      expect(parsedFiles.length).toBeGreaterThan(0)
      expect(parsedFiles[0].path).toBe('Data/aaa.pk')
      expect(parsedFiles[0].size).toBe(55991)
      expect(parsedFiles[0].md5).toBe('1c029f8454edbe834b5dd21d82468c5e')
    })

    it('should throw an error on invalid TXF content', async () => {
      fetchMocker.mockResponseOnce('Invalid Content\nNo colons here')
      await expect(loadTcgTxf('http://kartupdate.tiancity.cn')).rejects.toThrow(/\[KartManifest\]\[TXF\] Invalid txf file/)
    })

    it('should throw an error when TXF fetch returns non-OK status', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Server Error',
      } as Response)

      try {
        await expect(loadTcgTxf('http://kartupdate.tiancity.cn')).rejects.toThrow(/\[KartManifest\]\[TXF\] Failed to fetch txf file: 500 Server Error/)
      } finally {
        fetchSpy.mockRestore()
      }
    })
  })
})
