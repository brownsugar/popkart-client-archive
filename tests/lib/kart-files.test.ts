import { describe, it, expect } from 'vitest'
import { calculateKartCrc, KartPatchFile, TcgPatchFile } from '../../src/lib/kart-files'
import { resolve } from 'node:path'

describe('kart-files', () => {
  describe('PatchFile.getFileHash', () => {
    it('should return crc for KartPatchFile', () => {
      const file = new KartPatchFile('Data/a.rho', '', 12345, 100, 100, 0, 0, 0, 0, 0, 0, 0)
      expect(file.getFileHash()).toBe(12345)
    })

    it('should return md5 for TcgPatchFile', () => {
      const file = new TcgPatchFile('Data/a.rho', 'Data/a.rho', 'md5-hash', 100)
      expect(file.getFileHash()).toBe('md5-hash')
    })
  })

  describe('calculateKartCrc', () => {
    it('should calculate the CRC for a sample file', async () => {
      const path = resolve(process.cwd(), 'tests', 'fixtures', 'aaa.pk')

      const crc = await calculateKartCrc(path)
      expect(typeof crc).toBe('number')
      expect(crc).toBe(-1097161715)
    })
  })
})
