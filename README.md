# Secure referral handoff

A dependency-free GitHub Pages site that turns a validated candidate referral form into an encrypted, compressed share link. Opening that link locally decrypts the data, shows a complete email preview, and launches a prefilled Gmail compose window.

## Flow

1. Candidate completes the form at the repository's GitHub Pages root.
2. The browser converts the data to a compact positional JSON format, compresses it with `deflate`, encrypts it with a fresh AES-256-GCM key, and stores the result plus key in the URL fragment.
3. The candidate sends the generated HTTPS link to Kushagra.
4. `/mail/` validates and previews the referral, then opens Gmail addressed to `refer@smallcase.pyjamahr.com`.

No application server, build command, dependency, cookie, or analytics is used. The fragment is not included in HTTP requests, though anyone who receives the complete URL can decrypt its contents.

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

## Deploy

In GitHub: **Settings → Pages → Deploy from a branch → `main` / root**.
