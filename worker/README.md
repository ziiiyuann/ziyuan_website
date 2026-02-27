# Scores Worker (Cloudflare)

This Worker exposes a public endpoint that scrapes the Basketball Reference homepage scores.

## Endpoint

- `GET /scores`

Example response:

```json
{
  "ok": true,
  "source": "https://www.basketball-reference.com/",
  "fetchedAt": "2026-02-28T00:00:00.000Z",
  "gameCount": 3,
  "games": [
    {
      "status": "Final",
      "teams": [
        { "name": "Team A", "points": 112 },
        { "name": "Team B", "points": 106 }
      ],
      "boxscoreUrl": "https://www.basketball-reference.com/boxscores/..."
    }
  ]
}
```

## Deploy

1. Install Wrangler:
   - `npm install -g wrangler`
2. Authenticate:
   - `wrangler login`
3. Deploy from this folder:
   - `cd worker`
   - `wrangler deploy`

Wrangler will output a URL like:
- `https://ziyuan-scores-api.<your-subdomain>.workers.dev/scores`

## Connect Frontend

In `basketballProj.html`, update the button `data-endpoint`:

```html
data-endpoint="https://ziyuan-scores-api.<your-subdomain>.workers.dev/scores"
```

Then refresh your page and click **Fetch Latest Scores**.
