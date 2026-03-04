# Movie Dataset

Place your CSV file here for the movie recommender page.

Default file path used by the site:

- `assets/data/top-rated-movies-2026.csv`

Your current CSV schema is supported directly:

- `title`
- `year`
- `certificate`
- `duration`
- `genre`
- `rating`
- `description`
- `stars`
- `votes`

The parser also auto-detects common equivalents (for example `runtime`, `genres`,
`overview`, `cast`, `No_of_Votes`, etc.), and ignores accidental repeated header
rows inside the file.
