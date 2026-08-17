# Secure referral handoff

A dependency-free GitHub Pages site that turns a validated candidate referral form into an encrypted, compressed share link. Opening that link locally decrypts the data, shows a complete email preview, and launches a prefilled Gmail compose window.

## Flow

1. Candidate completes the form at the repository's GitHub Pages root.
2. The browser converts the data to a compact positional JSON format, compresses it with `deflate`, encrypts it with a fresh AES-256-GCM key, and stores the result plus key in the URL fragment.
3. The candidate sends the generated HTTPS link to Kushagra.
4. `/mail/` validates and previews the referral, then opens Gmail addressed to `refer@smallcase.pyjamahr.com`.

No server, build command, dependency, cookie, analytics, or data store is used. The fragment is not included in HTTP requests, though anyone who receives the complete URL can decrypt its contents.

## Run locally

Web Crypto requires a secure context. `localhost` is treated as secure by browsers:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000/`.

## Deploy

In GitHub: **Settings → Pages → Deploy from a branch → `main` / root**.
