# Recorded npm query outcomes

Captured with npm 11.12.1 on 2026-10-12, with a private HOME, empty user config
and private cache. No credentials were supplied. Only status, signal, stdout
and spawn error are used by the archive validator; stderr is not an input.

- success: `npm view @sessionbus/dsh@0.1.0 dist.integrity --json`
- not-found: `npm view @sessionbus/dsh@0.1.1 dist.integrity --json`
- unreachable: the success query against `http://127.0.0.1:9/`

Acquisition controls used no retries and explicit fetch bounds. The raw
stdout in each JSON is unchanged. Decision tests replay those actual outcomes.
The CLI equal-path test substitutes only the success response's integrity with
the hash of its private test archive; it tests subprocess plumbing and outputs,
not a claim about that archive existing on the registry. The mismatch path
uses the unchanged published integrity. The malformed control deliberately
damages a recorded success response; it is not claimed as native npm output.
