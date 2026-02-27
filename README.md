# Portfolio Website

Simple static portfolio site deployable with GitHub Pages.

## Files

- `index.html`
- `styles.css`
- `script.js`

## Deploy To GitHub Pages

1. Create a new public GitHub repository.
2. In this `portfolio` folder, run:

```powershell
git add .
git commit -m "Initial portfolio site"
git remote add origin https://github.com/<YOUR_USERNAME>/<REPO_NAME>.git
git push -u origin main
```

3. On GitHub, open `Settings -> Pages` and set Source to `GitHub Actions` if not already selected.
4. Wait for the `Deploy static content to Pages` workflow to finish.

Your site URL will be:

- `https://<YOUR_USERNAME>.github.io/<REPO_NAME>/`

If repository name is exactly `<YOUR_USERNAME>.github.io`, your URL is:

- `https://<YOUR_USERNAME>.github.io/`
