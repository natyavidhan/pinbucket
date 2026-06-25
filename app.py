import sqlite3
import json
import requests
from flask import Flask, request, jsonify, render_template

app = Flask(__name__)
DB = 'locations.db'
WIKI_UA = 'Pinbucket/1.0 (personal use; github.com)'

def init_db():
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS locations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        image_url TEXT,
        image_urls TEXT,
        lat REAL,
        lon REAL,
        note TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )''')
    try:
        c.execute('ALTER TABLE locations ADD COLUMN image_urls TEXT')
    except sqlite3.OperationalError:
        pass
    try:
        c.execute('ALTER TABLE locations ADD COLUMN tags TEXT')
    except sqlite3.OperationalError:
        pass
    try:
        c.execute('ALTER TABLE locations ADD COLUMN refs TEXT')
    except sqlite3.OperationalError:
        pass
    conn.commit()
    conn.close()

@app.route('/api/search')
def search():
    q = request.args.get('q', '').strip()
    if not q:
        return jsonify([])

    resp = requests.get('https://en.wikipedia.org/w/api.php', params={
        'action': 'query',
        'list': 'search',
        'srsearch': q,
        'format': 'json',
        'srlimit': 5,
    }, headers={'User-Agent': WIKI_UA}, timeout=10)
    resp.raise_for_status()
    data = resp.json()

    results = []
    for r in data.get('query', {}).get('search', []):
        results.append({
            'title': r['title'],
            'snippet': r.get('snippet', ''),
            'pageid': r.get('pageid'),
        })
    return jsonify(results)

@app.route('/api/preview')
def preview():
    title = request.args.get('title', '').strip()
    if not title:
        return jsonify({'error': 'No title provided'}), 400

    resp = requests.get(
        f'https://en.wikipedia.org/api/rest_v1/page/summary/{title}',
        headers={'User-Agent': WIKI_UA}, timeout=10
    )

    if resp.status_code != 200:
        return jsonify({'error': 'Page not found'}), 404

    data = resp.json()

    image_urls = []
    try:
        media_resp = requests.get(
            f'https://en.wikipedia.org/api/rest_v1/page/media-list/{title}',
            headers={'User-Agent': WIKI_UA}, timeout=10
        )
        if media_resp.status_code == 200:
            media_data = media_resp.json()
            for item in media_data.get('items', []):
                if item.get('type') == 'image' and item.get('showInGallery', True):
                    srcset = item.get('srcset', [])
                    if srcset:
                        url = 'https:' + srcset[0]['src']
                        if url not in image_urls:
                            image_urls.append(url)
    except Exception:
        pass

    return jsonify({
        'title': data.get('title', title),
        'description': data.get('extract', ''),
        'image_url': data.get('thumbnail', {}).get('source', ''),
        'image_urls': image_urls,
        'lat': data.get('coordinates', {}).get('lat'),
        'lon': data.get('coordinates', {}).get('lon'),
    })

@app.route('/api/locations', methods=['GET', 'POST'])
def locations():
    if request.method == 'GET':
        conn = sqlite3.connect(DB)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute('SELECT * FROM locations ORDER BY created_at DESC')
        rows = c.fetchall()
        conn.close()
        results = []
        for r in rows:
            d = dict(r)
            d['image_urls'] = _parse_json(d.get('image_urls'), [])
            d['tags'] = _parse_json(d.get('tags'), [])
            d['refs'] = _parse_json(d.get('refs'), [])
            results.append(d)
        return jsonify(results)

    data = request.get_json()
    if not data or not data.get('name'):
        return jsonify({'error': 'Name is required'}), 400

    conn = sqlite3.connect(DB)
    c = conn.cursor()
    urls = data.get('image_urls', [])
    tags = data.get('tags', [])
    refs = data.get('refs', [])
    c.execute('''INSERT INTO locations (name, description, image_url, image_urls, tags, refs, lat, lon, note)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)''',
              (data['name'], data.get('description', ''),
               data.get('image_url', ''), json.dumps(urls),
               json.dumps(tags), json.dumps(refs),
               data.get('lat'), data.get('lon'), data.get('note', '')))
    conn.commit()
    location_id = c.lastrowid
    conn.close()
    return jsonify({'status': 'ok', 'id': location_id}), 201

@app.route('/api/locations/<int:id>', methods=['DELETE', 'PUT'])
def single_location(id):
    if request.method == 'DELETE':
        conn = sqlite3.connect(DB)
        c = conn.cursor()
        c.execute('DELETE FROM locations WHERE id = ?', (id,))
        conn.commit()
        conn.close()
        return jsonify({'status': 'ok'})

    data = request.get_json()
    conn = sqlite3.connect(DB)
    c = conn.cursor()

    updates = []
    values = []

    for field in ['name', 'description', 'image_url', 'note']:
        if field in data:
            updates.append(f'{field} = ?')
            values.append(data[field])

    for field in ['image_urls', 'tags', 'refs']:
        if field in data:
            updates.append(f'{field} = ?')
            values.append(json.dumps(data[field]))

    if 'lat' in data:
        updates.append('lat = ?')
        values.append(data['lat'])
    if 'lon' in data:
        updates.append('lon = ?')
        values.append(data['lon'])

    if updates:
        values.append(id)
        c.execute(f"UPDATE locations SET {', '.join(updates)} WHERE id = ?", values)
        conn.commit()

    conn.close()
    return jsonify({'status': 'ok'})


def _parse_json(val, default):
    if not val:
        return default
    try:
        return json.loads(val)
    except (json.JSONDecodeError, TypeError):
        return default

@app.route('/')
def index():
    return render_template('index.html')

if __name__ == '__main__':
    init_db()
    app.run("0.0.0.0", debug=True, port=9875)
