import sqlite3
import json
import os
import base64
import requests
from flask import Flask, request, jsonify, render_template

def _load_env():
    env_path = os.path.join(os.path.dirname(__file__), '.env')
    if os.path.isfile(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    os.environ.setdefault(k.strip(), v.strip())

_load_env()

app = Flask(__name__)
app.config.setdefault('DB_PATH', 'locations.db')
WIKI_UA = 'Pinbucket/1.0 (personal use; github.com)'

def init_db():
    conn = sqlite3.connect(app.config['DB_PATH'])
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

def _gemini_identify(images):
    """Send images to Gemini Vision and return structured result."""
    from google import genai

    api_key = os.environ.get('GEMINI_API_KEY', '')
    if not api_key:
        return {'error': 'Set GEMINI_API_KEY env var to use this feature.'}

    client = genai.Client(api_key=api_key)

    parts = []
    for img in images:
        parts.append(genai.types.Part.from_bytes(
            data=img['data'],
            mime_type=img['mime'],
        ))

    parts.append(genai.types.Part.from_text(text="""Analyze these screenshots from a social media video of a beautiful location.
Return ONLY a JSON object with these keys and NOTHING ELSE:
{
  "confidence": "high" or "low",
  "name": "specific place name if confidence is high, otherwise null",
  "clues": "2-3 sentences describing the landscape, country/region, vegetation, geological features, or anything distinctive",
  "suggestions": ["search term 1", "search term 2", "search term 3"]
}"""))

    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=parts,
        )
        raw = response.text.strip()
        if raw.startswith('```'):
            raw = raw.split('\n', 1)[1]
            if raw.endswith('```'):
                raw = raw[:-3]
        return json.loads(raw)
    except Exception as e:
        return {'error': str(e)}


@app.route('/api/identify', methods=['POST'])
def identify():
    uploaded = request.files.getlist('images')
    if not uploaded or len(uploaded) == 0:
        return jsonify({'error': 'Upload at least one image.'}), 400
    if len(uploaded) > 5:
        return jsonify({'error': 'Max 5 images.'}), 400

    images = []
    for f in uploaded:
        if not f.content_type or not f.content_type.startswith('image/'):
            continue
        images.append({'data': f.read(), 'mime': f.content_type})

    if not images:
        return jsonify({'error': 'No valid images found.'}), 400

    result = _gemini_identify(images)
    return jsonify(result)


@app.route('/api/locations', methods=['GET', 'POST'])
def locations():
    if request.method == 'GET':
        conn = sqlite3.connect(app.config['DB_PATH'])
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

    conn = sqlite3.connect(app.config['DB_PATH'])
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
        conn = sqlite3.connect(app.config['DB_PATH'])
        c = conn.cursor()
        c.execute('DELETE FROM locations WHERE id = ?', (id,))
        conn.commit()
        conn.close()
        return jsonify({'status': 'ok'})

    data = request.get_json()
    conn = sqlite3.connect(app.config['DB_PATH'])
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

_db_initialized = False

@app.before_request
def _ensure_db():
    global _db_initialized
    if not _db_initialized:
        init_db()
        _db_initialized = True

if __name__ == '__main__':
    init_db()
    app.run("0.0.0.0", debug=True, port=9875)
