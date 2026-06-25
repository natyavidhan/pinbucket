import os
import pytest

WIKI_SEARCH = {
    "query": {"search": [
        {"pageid": 1, "title": "Trolltunga",
         "snippet": "Rock formation in <span class=\"searchmatch\">Norway</span>"},
        {"pageid": 2, "title": "Tian Shan",
         "snippet": "Mountain range in <span class=\"searchmatch\">Central Asia</span>"},
    ]}
}

WIKI_SUMMARY = {
    "title": "Trolltunga",
    "extract": "Trolltunga is a rock formation situated at 1,126 metres above sea level in Norway.",
    "thumbnail": {"source": "https://upload.wikimedia.org/trolltunga.jpg"},
    "coordinates": {"lat": 60.133, "lon": 6.754},
}

WIKI_SUMMARY_NOCOORDS = {
    "title": "Some Place",
    "extract": "A nice place.",
    "thumbnail": {},
}

WIKI_MEDIA = {
    "items": [
        {"type": "image", "showInGallery": True,
         "srcset": [{"src": "//upload.wikimedia.org/a.jpg"}]},
        {"type": "image", "showInGallery": True,
         "srcset": [{"src": "//upload.wikimedia.org/b.jpg"}]},
    ]
}


class FakeResp:
    def __init__(self, status, data):
        self.status_code = status
        self._data = data

    def json(self):
        return self._data

    def raise_for_status(self):
        if self.status_code >= 400:
            raise Exception(f"HTTP {self.status_code}")


def fake_get(url, **kwargs):
    if "api.php" in url:
        return FakeResp(200, WIKI_SEARCH)
    if "summary/MissingPlace" in url:
        return FakeResp(404, {})
    if "summary/NoCoords" in url:
        return FakeResp(200, WIKI_SUMMARY_NOCOORDS)
    if "summary" in url:
        return FakeResp(200, WIKI_SUMMARY)
    if "media-list" in url:
        return FakeResp(200, WIKI_MEDIA)
    return FakeResp(404, {})


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr("app.requests.get", fake_get)

    db_path = os.path.join(tmp_path, "test.db")

    import app as _app
    _app.app.config["DB_PATH"] = db_path
    _app._db_initialized = False
    _app.init_db()
    _app._db_initialized = True

    return _app.app.test_client()
