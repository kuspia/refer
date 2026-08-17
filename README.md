# Secure referral handoff

A GitHub Pages site with a small Cloudflare Worker that turns a validated candidate referral form into an encrypted, compressed share link. On Kushagra's configured device, opening that link locally decrypts the data and launches a prefilled Gmail compose window.

## Flow

1. Candidate completes the form at the repository's GitHub Pages root.
   The role must be selected from the live official PyjamaHR careers response returned through the Worker.
2. The browser converts the data to a compact positional JSON format, compresses it with `deflate`, encrypts it with a fresh AES-256-GCM key, and stores the result plus key in the URL fragment.
3. The candidate sends the generated HTTPS link to Kushagra.
4. `/mail/` first requires the private-device local-storage key. It then fetches the live roles again, verifies the exact Job ID/title pair, and opens Gmail addressed to `refer@smallcase.pyjamahr.com`.

No candidate data, link, or URL fragment is sent to the Worker. The fragment is not included in HTTP requests, though anyone who receives the complete URL can technically decrypt its contents outside this UI.

## Private Android counter setup

The public counter is stored in the single `data/counter.json` file on `main`. When Kushagra opens a referral in the Android email app, the browser uses GitHub's Contents API to read that file and upload the incremented value with its current SHA. No referral link, hash, candidate data, or job data is stored. Each successful button click increments the counter, including repeated clicks for the same referral.

1. Sign in to GitHub as the repository-owner account `kuspia`, then create a fine-grained personal access token. GitHub does not currently support fine-grained tokens for a personal repository where the token owner is only an outside/repository collaborator.
2. Limit repository access to `kuspia/refer` only.
3. Grant repository permission **Contents: Read and write**.
4. Give it a short expiry.
5. On the Android phone, open `https://kuspia.github.io/refer/?setup=1`, paste the token, and select **Verify & save**.

The token remains in that browser's local storage. Repeat setup after changing phones, browsers, clearing site data, or rotating the token. Anyone with access to the unlocked browser profile may be able to retrieve it, so revoke it immediately if the device is lost.

## Run locally

Web Crypto requires a secure context. `localhost` is treated as secure by browsers:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000/`.

## Live official roles

PyjamaHR does not allow direct browser requests from GitHub Pages. The Cloudflare Worker fetches every paginated jobs page server-side and returns only the active role IDs and titles. Its public response is never cached by the site, so roles are loaded when the form opens and checked again before link generation and before Gmail is revealed.

Deploy Worker changes from `worker/` with:

```sh
npx --yes --package node@22 --package wrangler --call 'wrangler deploy'
```

## Deploy

In GitHub: **Settings → Pages → Deploy from a branch → `main` / root**.
