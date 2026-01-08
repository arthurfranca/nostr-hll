/**
 * @typedef {Object} Event
 * @property {number} kind
 * @property {Array<Array<string>>} tags
 * @property {string} content
 * @property {string} pubkey
 * @property {string} id
 * @property {number} created_at
 * @property {string} [sig]
 */

/**
 * @typedef {Object} Filter
 * @property {Array<string>} [ids]
 * @property {Array<string>} [authors]
 * @property {Array<number>} [kinds]
 * @property {number} [since]
 * @property {number} [until]
 * @property {number} [limit]
 * @property {string} [search]
 * @property {Object.<string, Array<string>>} [tags] - Keys should be "#p", "#e" etc if adhering to JSON spec, or mixed. We check keys starting with "#".
 */

/**
 * Checks if a string is a valid 32-byte hex string.
 * @param {string} str
 * @returns {boolean}
 */
export function isValid32ByteHex (str) {
  return typeof str === 'string' && str.length === 64 && /^[0-9a-fA-F]+$/.test(str)
}

/**
 * Yields references and their calculated offsets for HLL.
 * @param {Event} evt
 * @returns {Generator<{reference: string, offset: number}, void, unknown>}
 */
export function * getEventPubkeyOffsetsAndReferences (evt) {
  if (evt.kind === 3) {
    // follower counts
    for (const tag of evt.tags) {
      if (tag.length >= 2 && tag[0] === 'p' && isValid32ByteHex(tag[1])) {
        // 32th nibble of each "p" tag
        const p = parseInt(tag[1][32], 16)
        yield { reference: tag[1], offset: p + 8 }
      }
    }
  } else if (evt.kind === 7) {
    // reaction counts: only last "e" tag
    let lastE = null
    for (let i = evt.tags.length - 1; i >= 0; i--) {
      if (evt.tags[i][0] === 'e') {
        lastE = evt.tags[i]
        break
      }
    }

    if (lastE) {
      const v = lastE[1]
      if (isValid32ByteHex(v)) {
        const p = parseInt(v[32], 16)
        yield { reference: v, offset: p + 8 }
      }
    }
  } else if (evt.kind === 1111) {
    // comment counts
    const e = evt.tags.find(t => t[0] === 'E') // Find first "E"
    if (e) {
      const v = e[1]
      if (isValid32ByteHex(v)) {
        const p = parseInt(v[32], 16)
        yield { reference: v, offset: p + 8 }
      }
    }
  }
}

/**
 * Returns the deterministic pubkey offset for a filter.
 * Returns -1 if not eligible.
 * @param {Filter} filter - Expects standard JSON filter object (tags keys start with #)
 * @returns {number}
 */
export function getFilterPubkeyOffset (filter) {
  // Check constraints:
  // ids, since, until, authors must be empty/undefined/null/zero?
  // Go: filter.IDs != nil (slice) -> check length > 0
  if (filter.ids && filter.ids.length > 0) return -1
  if (filter.authors && filter.authors.length > 0) return -1
  if (filter.since) return -1
  if (filter.until) return -1
  if (filter.search) return -1

  // len(filter.Kinds) != 1
  if (!filter.kinds || filter.kinds.length !== 1) return -1

  // len(filter.Tags) != 1
  // Filter tags are keys starting with #
  const tagKeys = Object.keys(filter).filter(k => k.startsWith('#'))
  if (tagKeys.length !== 1) return -1

  const tagKey = tagKeys[0]
  const tagValues = filter[tagKey]

  if (!tagValues || tagValues.length !== 1 || !isValid32ByteHex(tagValues[0])) return -1

  const kind = filter.kinds[0]

  if (tagKey === '#p') {
    if (kind === 3) {
      const p = parseInt(tagValues[0][32], 16)
      if (Number.isNaN(p)) return -1
      return p + 8
    }
  } else if (tagKey === '#e') {
    if (kind === 7) {
      const p = parseInt(tagValues[0][32], 16)
      if (Number.isNaN(p)) return -1
      return p + 8
    }
  } else if (tagKey === '#E') {
    if (kind === 1111) {
      const p = parseInt(tagValues[0][32], 16)
      if (Number.isNaN(p)) return -1
      return p + 8
    }
  }

  return -1
}
