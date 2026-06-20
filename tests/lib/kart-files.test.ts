import { describe, it, expect } from 'vitest'
import { calculateKartCrc } from '../../src/lib/kart-files'
import { resolve } from 'node:path'

describe('kart-files', () => {
  describe('calculateKartCrc', () => {
    it('should calculate the CRC for a sample file', async () => {
      const path = resolve(process.cwd(), 'tests', 'fixtures', 'aaa.pk')

      const crc = await calculateKartCrc(path)
      expect(typeof crc).toBe('number')
      expect(crc).toBe(-1097161715)
    })
  })
})
