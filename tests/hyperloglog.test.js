import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { HyperLogLog } from '../hyperloglog.js'

describe('HyperLogLog', () => {
  it('should estimate count from registers (test vector from Go tests)', () => {
    const hex = '0100000101000000000000040000000001020000000002000000000200000003000002040000000101020001010000000000000007000004010000000200040000020400000000000102000002000004010000010000000301000102030002000301000300010000070000000001000004000102010000000400010002000000000103000100010001000001040100020001000000000000010000020000000000030100000001000400010000000000000901010100000000040000000b030000010100010000010000010000000003000000000000010003000100020000000000010000010100000100000104000200030001000300000001000101000102'

    if (hex.length !== 512) {
      throw new Error('Invalid hex string length')
    }

    const registers = new Uint8Array(256)
    for (let i = 0; i < 256; i++) {
      registers[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16)
    }

    const hll = HyperLogLog.newWithRegisters(registers, 0)
    // The test vector from Go at https://gittr.space/npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6/nostrlib?file=envelopes_test.go#L63-L66
    // has Count: 42 in the JSON envelope, but the HLL blob
    // actually corresponds to ~121 items. The Go test checks envelope parsing, not HLL math consistency.
    // Verified by running the original Go implementation against this hex string
    // on 2026-01-08 using a temporary Go program. The result was exactly 121.
    assert.equal(hll.count(), 121)
  })

  it('should estimate count from registers (test vector from Rust implementation)', () => {
    // Test vector from https://github.com/mikedilger/pocket/blob/master/pocket-types/src/hll8.rs
    const hex = '0607070505060806050508060707070706090d080b0605090607070b07090606060b0705070709050807080805080407060906080707080507070805060509040a0b06060704060405070706080607050907070b08060808080b080607090a06060805060604070908050607060805050d05060906090809080807050e0705070507060907060606070708080b0807070708080706060609080705060604060409070a0808050a0506050b0810060a0908070709080b0a07050806060508060607080606080707050806080c0a0707070a080808050608080f070506070706070a0908090c080708080806090508060606090906060d07050708080405070708'

    const registers = new Uint8Array(256)
    for (let i = 0; i < 256; i++) {
      registers[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16)
    }

    const hll = HyperLogLog.newWithRegisters(registers, 0)
    // Verified by running the original Rust implementation against this hex string
    // on 2026-01-08 using a temporary Rust program. The result was exactly 15070.
    assert.equal(hll.count(), 15070)
  })

  it('should add items and estimate count', () => {
    const hll = new HyperLogLog(0)

    // Add one item
    const item1 = new Uint8Array(32).fill(1)
    hll.add(item1)
    assert.equal(hll.count(), 1)

    // Add same item
    hll.add(item1)
    assert.equal(hll.count(), 1)

    // Add another item
    const item2 = new Uint8Array(32).fill(2)
    hll.add(item2)
    assert.equal(hll.count(), 2)
  })

  it('should work with offset', () => {
    const offset = 4
    const hll = new HyperLogLog(offset)

    const pubkey = new Uint8Array(32).fill(0)

    // Set byte at offset to 10 (Target Register 10)
    pubkey[offset] = 10

    hll.add(pubkey)

    // Register 10 should be updated.
    assert.ok(hll.getRegisters()[10] > 0)

    // Register 0 should stay 0.
    assert.equal(hll.getRegisters()[0], 0)
  })

  it('NewWithRegisters with invalid size', () => {
    assert.throws(() => {
      HyperLogLog.newWithRegisters(new Uint8Array(100), 0)
    }, /invalid number of registers/)
  })

  it('New with invalid offset', () => {
    assert.throws(() => {
      // eslint-disable-next-line no-new
      new HyperLogLog(100)
    }, /invalid offset/)
  })

  it('Clear', () => {
    const hll = new HyperLogLog(0)
    hll.add(new Uint8Array(32).fill(1))
    assert.equal(hll.count(), 1)
    hll.clear()
    assert.equal(hll.count(), 0)
    hll.getRegisters().forEach(r => assert.equal(r, 0))
  })

  it('Merge', () => {
    const h1 = new HyperLogLog(0)
    const h2 = new HyperLogLog(0)

    const item1 = new Uint8Array(32).fill(1)
    const item2 = new Uint8Array(32).fill(2)

    h1.add(item1)
    h2.add(item2)

    h1.merge(h2)

    assert.equal(h1.count(), 2)
  })
})
