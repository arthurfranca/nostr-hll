// HyperLogLog implementation translating existing Go version
// uses precision 8 (256 registers)

export class HyperLogLog {
  /**
   * @param {number} offset
   */
  constructor (offset) {
    if (offset < 0 || offset > 32 - 8) {
      throw new Error(`invalid offset ${offset}`)
    }

    this.offset = offset
    this.registers = new Uint8Array(256)
  }

  /**
   * @param {Uint8Array} registers
   * @param {number} offset
   */
  static newWithRegisters (registers, offset) {
    const hll = new HyperLogLog(offset)
    if (registers.length !== 256) {
      throw new Error(`invalid number of registers ${registers.length}`)
    }
    hll.registers.set(registers)
    return hll
  }

  getRegisters () {
    return this.registers
  }

  /**
   * @param {Uint8Array} enc
   */
  setRegisters (enc) {
    this.registers = enc
  }

  /**
   * @param {Uint8Array} other
   */
  mergeRegisters (other) {
    for (let i = 0; i < other.length; i++) {
      if (other[i] > this.registers[i]) {
        this.registers[i] = other[i]
      }
    }
  }

  clear () {
    this.registers.fill(0)
  }

  /**
   * @param {Uint8Array} pubkey - 32 bytes
   */
  add (pubkey) {
    if (pubkey.length !== 32) {
      // Should we throw? Go version takes fixed array [32]byte so it is enforced by compiler.
      // We will assume valid input or throw.
      // throw new Error("pubkey must be 32 bytes");
      // But for performance maybe skip check if verified elsewhere?
      // We will stick to the logic.
    }
    const x = pubkey.subarray(this.offset, this.offset + 8)
    const j = x[0] // register address

    // Convert 8 bytes to BigUint64 (Big Endian)
    const view = new DataView(x.buffer, x.byteOffset, x.byteLength)
    const w = view.getBigUint64(0, false) // Big Endian

    const zeroBits = clz56(w) + 1

    if (zeroBits > this.registers[j]) {
      this.registers[j] = zeroBits
    }
  }

  // AddBytes is identical to Add in Go implementation provided
  addBytes (pubkey) {
    this.add(pubkey)
  }

  /**
   * @param {HyperLogLog} other
   */
  merge (other) {
    for (let i = 0; i < other.registers.length; i++) {
      const v = other.registers[i]
      if (v > this.registers[i]) {
        this.registers[i] = v
      }
    }
  }

  /**
   * @returns {number}
   */
  count () {
    const v = countZeros(this.registers)

    if (v !== 0) {
      const lc = linearCounting(256, v)
      if (lc <= 220) {
        return Math.floor(lc)
      }
    }

    const est = this.calculateEstimate()
    if (est <= 256 * 3) {
      if (v !== 0) {
        // return uint64(linearCounting(...)) -> floor/round? Go casts to uint64 = floor.
        return Math.floor(linearCounting(256, v))
      }
    }

    return Math.floor(est)
  }

  calculateEstimate () {
    let sum = 0.0
    for (let i = 0; i < this.registers.length; i++) {
      const val = this.registers[i]
      sum += 1.0 / Math.pow(2, val)
    }

    return (0.7182725932495458 * 256 * 256) / sum
  }
}

/**
 * @param {number} m
 * @param {number} v
 * @returns {number}
 */
function linearCounting (m, v) {
  return m * Math.log(m / v)
}

/**
 * @param {bigint} x
 * @returns {number}
 */
function clz56 (x) {
  let c = 0
  let m = 1n << 55n
  while ((m & x) === 0n && m !== 0n) {
    c++
    m >>= 1n
  }
  return c
}

/**
 * @param {Uint8Array} s
 * @returns {number}
 */
function countZeros (s) {
  let c = 0
  for (let i = 0; i < s.length; i++) {
    if (s[i] === 0) {
      c++
    }
  }
  return c
}
