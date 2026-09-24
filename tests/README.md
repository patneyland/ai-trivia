# Local regression checks

Run from the repository root:

```sh
npm run build
node tests/socket-flow.cjs
```

The check uses the built socket handlers, three independent Socket.IO clients,
and in-process fixed questions. It makes no AI requests and requires no secrets.
It covers room defaults and custom count, trimmed interests, duplicate start
requests, answer visibility and acknowledgments, duplicate/stale/invalid answers,
scoring once, timer expiry, host advancement, results, and replay.

For manual browser checks, run `node tests/socket-flow.cjs --serve` and
`npm run dev --workspace=client` in separate terminals. The test server binds
to loopback port 3000. Do not run the normal server at the same time. Host and
join a game at the Vite URL using separate tabs. The fixture supplies the chosen
number of simple questions; the interest `Generation failure` simulates a failed
generation. Stop the fixture server after testing. Production code has no fixture
mode or test endpoint.
