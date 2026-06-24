# Pinbucket

A dead-simple way to save places you find on Instagram Reels. Instead of screenshotting and forgetting, you type the name, Wikipedia fills in the rest, and it lives on a Pinterest-style board.

### Why this exists

Instagram is full of beautiful places — fjords in Norway, mountains in Kazakhstan, villages in Italy — but saving them is a mess. Screenshots, bookmarks, DMs to yourself. Pinbucket gives you one place to collect them. Type a name, get the image and description from Wikipedia, add a note, and you're done.

No accounts. No API keys. No scraping Instagram. Just Wikipedia's free REST API doing the heavy lifting.

### How it works

1. Type the name of a place (e.g. "Trolltunga Norway")
2. Pick from a dropdown of Wikipedia matches
3. Wikipedia auto-fills the image, description, and coordinates
4. Add a personal note if you want ("saw this in June 2026")
5. Save — it lands on your board

If Wikipedia doesn't have the place, there's a manual fallback where you can paste a name, image URL, and description yourself.

### Running it

```bash
pip install flask requests
python app.py
```

Opens on `localhost:5000`. That's it.

### Stack

Flask + SQLite + vanilla HTML/CSS/JS. No frameworks, no build step, no npm. Just a couple of Python dependencies and a handful of static files.
