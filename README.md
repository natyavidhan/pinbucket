# Pinbucket

A dead-simple way to save places you find on Instagram Reels. Instead of screenshotting and forgetting, you type the name, Wikipedia fills in the rest, and it lives on a Pinterest-style board.

### Why this exists

Instagram is full of beautiful places — fjords in Norway, mountains in Kazakhstan, villages in Italy — but saving them is a mess. Screenshots, bookmarks, DMs to yourself. Pinbucket gives you one place to collect them. Type a name, get the image and description from Wikipedia, add a note, and you're done.

No accounts. No API keys. No scraping Instagram. Just Wikipedia's free REST API doing the heavy lifting.

### What you get

- **Wikipedia-powered cards** — type a place name, pick from 5 search results, and Wikipedia auto-fills the image, description, and coordinates. Multiple images are pulled from the Wikipedia media gallery so you can flip through them in the modal.
- **Pinterest-style board** — full-image cards with a gradient overlay and place name. Hover to reveal the description and your notes. Pure CSS masonry grid, responsive down to single-column on phones.
- **Tags & references** — tag places with things like "hiking", "norway", "waterfall". Save the Instagram Reel URL (or TikTok, YouTube, whatever) as a reference so you can find it later.
- **Dark mode** — toggle in the header, sticks between sessions.
- **Manual fallback** — if Wikipedia doesn't have your place, fill in the name, image URL, and description yourself.
- **Everything is editable** — click any card to open the full view, then hit Edit to change tags, references, or your note anytime.

### Running it

```bash
pip install flask requests
python app.py
```

Opens on `localhost:9875`.

### Running the tests

```bash
pip install pytest
python -m pytest tests/ -v
```

23 tests covering search, preview, CRUD, tags, references, partial updates, edge cases. No network calls — all Wikipedia requests are mocked.

### Stack

Flask + SQLite + vanilla HTML/CSS/JS. No frameworks, no build step, no npm. Just a couple of Python dependencies and a handful of static files.

### API

| Endpoint | What it does |
|---|---|
| `GET /api/search?q=...` | Wikipedia search, returns 5 candidates |
| `GET /api/preview?title=...` | Wikipedia summary + media gallery for a title |
| `GET /api/locations` | All saved cards |
| `POST /api/locations` | Save a card (with tags, refs, image_urls) |
| `PUT /api/locations/<id>` | Edit tags, references, note, or other fields |
| `DELETE /api/locations/<id>` | Remove a card |
