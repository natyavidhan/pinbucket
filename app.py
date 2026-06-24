import sqlite3
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
        lat REAL,
        lon REAL,
        note TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )''')
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

    return jsonify({
        'title': data.get('title', title),
        'description': data.get('extract', ''),
        'image_url': data.get('thumbnail', {}).get('source', ''),
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
        return jsonify([dict(r) for r in rows])

    data = request.get_json()
    if not data or not data.get('name'):
        return jsonify({'error': 'Name is required'}), 400

    conn = sqlite3.connect(DB)
    c = conn.cursor()
    c.execute('''INSERT INTO locations (name, description, image_url, lat, lon, note)
                 VALUES (?, ?, ?, ?, ?, ?)''',
              (data['name'], data.get('description', ''),
               data.get('image_url', ''), data.get('lat'),
               data.get('lon'), data.get('note', '')))
    conn.commit()
    location_id = c.lastrowid
    conn.close()
    return jsonify({'status': 'ok', 'id': location_id}), 201

@app.route('/api/locations/<int:id>', methods=['DELETE'])
def delete_location(id):
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    c.execute('DELETE FROM locations WHERE id = ?', (id,))
    conn.commit()
    conn.close()
    return jsonify({'status': 'ok'})

@app.route('/')
def index():
    return render_template('index.html')

if __name__ == '__main__':
    init_db()
    app.run(debug=True)
