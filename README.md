# nostr-hll

A zero-dependency JavaScript implementation of the [NIP-45](https://github.com/nostr-protocol/nips/blob/master/45.md) HyperLogLog specification for Nostr. This library is designed to work in both Node.js and browser environments.

This library is a port of the [Go implementation](https://gittr.space/npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6/nostrlib?path=nip45) found in `nostrlib`.

## Installation

```bash
npm install nostr-hll
```

## Usage in Nostr

### For Relays (Server-side)

Relays can use this library to efficiently handle `COUNT` requests that match the NIP-45 criteria (e.g., counting followers or reactions).

```javascript
import { HyperLogLog } from 'nostr-hll/hyperloglog.js'
import { getFilterPubkeyOffset } from 'nostr-hll/nip45.js'

// 1. When receiving a COUNT filter
const filter = { kinds: [3], '#p': ['<target-pubkey>'] }

// 2. Check if the filter is eligible for HLL calculation
const offset = getFilterPubkeyOffset(filter)

if (offset !== -1) {
  // 3. Initialize HLL with the calculated offset
  const hll = new HyperLogLog(offset)

  // 4. Fetch matching events from database (e.g. "SELECT * FROM events WHERE ...")
  const events = fetchEventsFromDB(filter)

  for (const event of events) {
    // 5. Add the *author* of the event (pubkey) to the HLL
    // Note: ensure pubkey is a Uint8Array (32 bytes)
    const pubkeyBytes = hexToBytes(event.pubkey)
    hll.add(pubkeyBytes)
  }

  // 6. Return result
  const count = hll.count()
  // Or const hllData = Buffer.from(hll.getRegisters()).toString('hex')
  const hllData = Array.from(hll.getRegisters()).map(b => b.toString(16).padStart(2, '0')).join('')

  console.log(`Count: ${count}, HLL: ${hllData}`)
}

// Helper: Hex string to Uint8Array
function hexToBytes(hex) {
  return new Uint8Array(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)))
}
```

### For Clients

Clients can use this library to aggregate counts from multiple relays to get a more accurate distinct count (e.g., total unique followers across all relays).

```javascript
import { HyperLogLog } from 'nostr-hll/hyperloglog.js'

const hllTotal = new HyperLogLog(0) // Offset doesn't strictly matter for merging, but should match
let offsetInitialized = false

// Simulate responses from multiple relays for the same COUNT request
const relayResponses = [
  { count: 100, hll: '<hex-string-from-relay-1>' },
  { count: 105, hll: '<hex-string-from-relay-2>' }
]

for (const response of relayResponses) {
  if (response.hll) {
    // Convert hex to Uint8Array (browser-friendly)
    const registers = new Uint8Array(response.hll.match(/.{1,2}/g).map(byte => parseInt(byte, 16)))

    // NIP-45 implies the offset used for adding was deterministic based on the filter.
    // If you merge two HLLs that were created using different offsets, the resulting count will be garbage.
    //
    // Since the client is just acting as a container to hold the registers coming from the relays,
    // and it assumes the relays did their job correctly (using the standard deterministic offset for the filter),
    // it doesn't technically use the offset property in its local object during the merge process.
    // But if it ever wanted to do hllTotal.add(localPubkey) to add a local user to this sum,
    // it'd be in trouble if its offset was wrong
    const relayHll = HyperLogLog.newWithRegisters(registers, 0)

    // Merge into our local accumulator
    hllTotal.merge(relayHll)
  }
}

console.log('Distinct Count across relays:', hllTotal.count())
```

### Ingestion / Indexing

You can use `getEventPubkeyOffsetsAndReferences` to pre-calculate or index which counters an incoming event should contribute to.

```javascript
import { getEventPubkeyOffsetsAndReferences } from 'nostr-hll/nip45.js'

// Incoming event (e.g., Alice follows Bob)
const event = {
  kind: 3,
  pubkey: 'alice_pubkey_hex...',
  tags: [['p', 'bob_pubkey_hex...']]
}

for (const { reference, offset } of getEventPubkeyOffsetsAndReferences(event)) {
  console.log(`This event contributes to the HLL for ${reference} (using offset ${offset})`)

  // You could load the HLL for 'reference' (Bob) and add 'event.pubkey' (Alice) to it, for example:
  // The event.kind distinguishes what metric we are counting (e.g. kind 3 = followers, kind 7 = reactions)
  const hll = await loadHLLFromDB(reference, event.kind, offset)
  hll.add(hexToBytes(event.pubkey))
  await saveHLLToDB(reference, event.kind, hll)
}
```

## Generic HyperLogLog Usage

This library implements a HyperLogLog (HLL) structure with a fixed precision of 8 (256 registers), suitable for estimating cardinality of large sets with low memory footprint (256 bytes per HLL).

The `add` method expects a 32-byte input (like a SHA-256 hash or a Nostr Pubkey). If you want to count arbitrary strings or objects, you must hash them first.

The `offset` parameter determines which 8 bytes of the input are used. For generic usage with robust hashes (like SHA-256), the bytes are uniformly distributed, so using the first 8 bytes (offset `0`) is sufficient.

```javascript
import { HyperLogLog } from 'nostr-hll/hyperloglog.js'
import crypto from 'node:crypto' // or Web Crypto API

// 1. Create a generic HLL
// Offset 0 uses the first 8 bytes of the hash.
const hll = new HyperLogLog(0)

// 2. Data to count
const userIds = ["user_1", "user_2", "user_1", "user_3"]

// 3. Add items
for (const id of userIds) {
  // Hash the input to 32 bytes
  const hash = crypto.createHash('sha256').update(id).digest()

  // Add unique hash to HLL
  hll.add(hash)
}

// 4. Get Estimate
console.log(`Estimated unique users: ${hll.count()}`)
// Should be close to 3
```
