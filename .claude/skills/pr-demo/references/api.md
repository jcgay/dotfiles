# Capture an API change

Replay real requests with `curl` against the running app. No video.

For each request of the scenario:

```bash
curl -sS -o <capture dir>/req-<i>.body -w '%{http_code}' '<URL>' > <capture dir>/req-<i>.status
```

- SOAP or any request with a body: add `-X POST -H 'Content-Type: …' -d @<file>`
  and show the body sent in the comment.

- Keep the exact `curl` command you ran, with the local URL. Replace any
  secret (token, licence key, password) with `<redacted>` in the comment.
- A body over 40 lines: keep the part the PR changes, with 3 lines of context,
  and write `…` where you cut. Pretty-print first: `jq .` for JSON,
  `xmllint --format -` for XML.

## --compare

Run each request on the base app, then on the PR app, and show both. Use a
comparison tool only if the `## Demo` section names one and says how to read
its result for one request.

## Capture block

One block per request:

````
**<what this request shows>**
```bash
curl '<URL>'
```
<details><summary><HTTP status> · response</summary>

```json
<trimmed body>
```
</details>
````

With `--compare`: two `<details>`, `Base · <status>` then `PR · <status>`.
