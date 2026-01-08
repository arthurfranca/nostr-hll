import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getEventPubkeyOffsetsAndReferences, getFilterPubkeyOffset } from '../nip45.js'

describe('NIP-45 Helpers', () => {
  describe('getEventPubkeyOffsetsAndReferences', () => {
    it('should handle kind 3 (follows)', () => {
      const hex = 'a'.repeat(64) // 32 chars 'a', index 32 is 'a' -> 10. Offset 18.
      const evt = {
        kind: 3,
        tags: [['p', hex], ['p', 'invalid'], ['e', hex]]
      }

      const results = [...getEventPubkeyOffsetsAndReferences(evt)]
      assert.equal(results.length, 1)
      assert.equal(results[0].reference, hex)
      assert.equal(results[0].offset, 10 + 8)
    })

    it('should handle kind 7 (reactions)', () => {
      const hex1 = '1'.repeat(64) // index 32 is '1' -> 1. Offset 9.
      const hex2 = 'b'.repeat(64) // index 32 is 'b' -> 11. Offset 19.

      // Last 'e' tag counts
      const evt = {
        kind: 7,
        tags: [['e', hex1], ['e', hex2], ['p', hex1]]
      }

      const results = [...getEventPubkeyOffsetsAndReferences(evt)]
      assert.equal(results.length, 1)
      assert.equal(results[0].reference, hex2)
      assert.equal(results[0].offset, 11 + 8)
    })

    it('should handle kind 1111 (comments)', () => {
      const hex = 'c'.repeat(64) // index 32 is 'c' -> 12. Offset 20.

      // First 'E' tag counts (Go: evt.Tags.Find("E"))
      const evt = {
        kind: 1111,
        tags: [['E', hex], ['E', 'other']]
      }

      const results = [...getEventPubkeyOffsetsAndReferences(evt)]
      assert.equal(results.length, 1)
      assert.equal(results[0].reference, hex)
      assert.equal(results[0].offset, 12 + 8)
    })
  })

  describe('getFilterPubkeyOffset', () => {
    it('should return offset for kind 3 and #p', () => {
      const hex = 'd'.repeat(64) // index 32 is 'd' -> 13. Offset 21.
      const filter = {
        kinds: [3],
        '#p': [hex]
      }
      assert.equal(getFilterPubkeyOffset(filter), 13 + 8)
    })

    it('should return -1 for multiple kinds', () => {
      const filter = {
        kinds: [3, 7],
        '#p': ['a'.repeat(64)]
      }
      assert.equal(getFilterPubkeyOffset(filter), -1)
    })

    it('should return -1 for extra tags', () => {
      const filter = {
        kinds: [3],
        '#p': ['a'.repeat(64)],
        '#e': ['b'.repeat(64)]
      }
      assert.equal(getFilterPubkeyOffset(filter), -1)
    })

    it('should return -1 for authors', () => {
      const filter = {
        kinds: [3],
        '#p': ['a'.repeat(64)],
        authors: ['abc']
      }
      assert.equal(getFilterPubkeyOffset(filter), -1)
    })

    it('should return offset for kind 7 and #e', () => {
      const hex = '0'.repeat(64) // index 32 is '0' -> 0. Offset 8.
      const filter = {
        kinds: [7],
        '#e': [hex]
      }
      assert.equal(getFilterPubkeyOffset(filter), 8)
    })

    it('should return offset for kind 1111 and #E', () => {
      const hex = 'f'.repeat(64) // index 32 is 'f' -> 15. Offset 23.
      const filter = {
        kinds: [1111],
        '#E': [hex]
      }
      assert.equal(getFilterPubkeyOffset(filter), 23)
    })
  })
})
