import json
import pytest


# ---- Search ----

def test_search_returns_results(client):
    resp = client.get("/api/search?q=Trolltunga")
    data = resp.get_json()
    assert resp.status_code == 200
    assert len(data) == 2
    assert data[0]["title"] == "Trolltunga"
    assert data[1]["title"] == "Tian Shan"


def test_search_empty_query_returns_empty(client):
    resp = client.get("/api/search?q=")
    assert resp.status_code == 200
    assert resp.get_json() == []


def test_search_missing_q_returns_empty(client):
    resp = client.get("/api/search")
    assert resp.status_code == 200
    assert resp.get_json() == []


# ---- Preview ----

def test_preview_full_data(client):
    resp = client.get("/api/preview?title=Trolltunga")
    data = resp.get_json()
    assert resp.status_code == 200
    assert data["title"] == "Trolltunga"
    assert "Trolltunga is a rock formation" in data["description"]
    assert data["image_url"] == "https://upload.wikimedia.org/trolltunga.jpg"
    assert data["lat"] == 60.133
    assert data["lon"] == 6.754
    assert len(data["image_urls"]) == 2
    assert any("a.jpg" in u for u in data["image_urls"])


def test_preview_missing_returns_404(client):
    resp = client.get("/api/preview?title=MissingPlace")
    assert resp.status_code == 404


def test_preview_no_title_returns_400(client):
    resp = client.get("/api/preview")
    assert resp.status_code == 400


def test_preview_no_coordinates(client):
    resp = client.get("/api/preview?title=NoCoords")
    data = resp.get_json()
    assert resp.status_code == 200
    assert data["lat"] is None
    assert data["lon"] is None
    assert data["image_url"] == ""


# ---- Locations CRUD ----

def test_get_empty_locations(client):
    resp = client.get("/api/locations")
    assert resp.status_code == 200
    assert resp.get_json() == []


def test_create_location_minimal(client):
    resp = client.post("/api/locations",
                       data=json.dumps({"name": "Trolltunga"}),
                       content_type="application/json")
    assert resp.status_code == 201
    assert resp.get_json()["id"] == 1


def test_create_location_full(client):
    resp = client.post("/api/locations", data=json.dumps({
        "name": "Trolltunga",
        "description": "Rock formation in Norway.",
        "image_url": "https://example.com/img.jpg",
        "image_urls": ["https://example.com/a.jpg", "https://example.com/b.jpg"],
        "lat": 60.133,
        "lon": 6.754,
        "note": "Hike 2026",
    }), content_type="application/json")
    assert resp.status_code == 201
    lid = resp.get_json()["id"]

    resp2 = client.get("/api/locations")
    locs = resp2.get_json()
    assert len(locs) == 1
    loc = locs[0]
    assert loc["name"] == "Trolltunga"
    assert loc["lat"] == 60.133
    assert loc["lon"] == 6.754
    assert loc["note"] == "Hike 2026"
    assert len(loc["image_urls"]) == 2


def test_create_location_missing_name_returns_400(client):
    resp = client.post("/api/locations",
                       data=json.dumps({"description": "no name"}),
                       content_type="application/json")
    assert resp.status_code == 400


def test_create_location_no_body_returns_400(client):
    resp = client.post("/api/locations",
                       data="",
                       content_type="application/json")
    assert resp.status_code == 400


# ---- Tags ----

def test_create_with_tags(client):
    resp = client.post("/api/locations", data=json.dumps({
        "name": "Trolltunga",
        "tags": ["hiking", "norway", "waterfall"],
    }), content_type="application/json")
    assert resp.status_code == 201

    locs = client.get("/api/locations").get_json()
    assert locs[0]["tags"] == ["hiking", "norway", "waterfall"]


def test_create_with_empty_tags(client):
    resp = client.post("/api/locations", data=json.dumps({
        "name": "Somewhere", "tags": [],
    }), content_type="application/json")
    assert resp.status_code == 201
    locs = client.get("/api/locations").get_json()
    assert locs[0]["tags"] == []


# ---- References ----

def test_create_with_refs(client):
    resp = client.post("/api/locations", data=json.dumps({
        "name": "Trolltunga",
        "refs": ["https://instagram.com/reel/abc", "https://tiktok.com/v/123"],
    }), content_type="application/json")
    assert resp.status_code == 201

    locs = client.get("/api/locations").get_json()
    assert len(locs[0]["refs"]) == 2
    assert "instagram.com" in locs[0]["refs"][0]


# ---- PUT (update) ----

def test_update_tags_and_refs(client):
    client.post("/api/locations", data=json.dumps({
        "name": "Trolltunga",
        "tags": ["hiking"],
        "refs": ["https://old-link.com"],
        "note": "old note",
    }), content_type="application/json")

    resp = client.put("/api/locations/1", data=json.dumps({
        "tags": ["hiking", "fjord", "europe"],
        "refs": ["https://new-link.com"],
        "note": "updated note!",
    }), content_type="application/json")
    assert resp.status_code == 200

    loc = client.get("/api/locations").get_json()[0]
    assert loc["tags"] == ["hiking", "fjord", "europe"]
    assert loc["refs"] == ["https://new-link.com"]
    assert loc["note"] == "updated note!"


def test_update_partial_fields(client):
    client.post("/api/locations", data=json.dumps({
        "name": "Trolltunga",
        "tags": ["original"],
        "note": "original note",
    }), content_type="application/json")

    resp = client.put("/api/locations/1", data=json.dumps({
        "note": "only note changed",
    }), content_type="application/json")
    assert resp.status_code == 200

    loc = client.get("/api/locations").get_json()[0]
    assert loc["tags"] == ["original"]
    assert loc["note"] == "only note changed"


def test_update_nonexistent_does_not_crash(client):
    resp = client.put("/api/locations/999", data=json.dumps({
        "tags": ["test"],
    }), content_type="application/json")
    assert resp.status_code == 200


# ---- DELETE ----

def test_delete_location(client):
    client.post("/api/locations", data=json.dumps({"name": "Trolltunga"}),
                content_type="application/json")

    resp = client.delete("/api/locations/1")
    assert resp.status_code == 200

    resp2 = client.get("/api/locations")
    assert resp2.get_json() == []


def test_delete_nonexistent_returns_ok(client):
    resp = client.delete("/api/locations/999")
    assert resp.status_code == 200


# ---- Board page ----

def test_board_page_loads(client):
    resp = client.get("/")
    assert resp.status_code == 200
    assert b"Pinbucket" in resp.data
    assert b"masonry" in resp.data


# ---- Multiple locations ordering ----

def test_locations_ordered_by_created_desc(client):
    import time
    for name in ["A", "B", "C"]:
        client.post("/api/locations", data=json.dumps({"name": name}),
                    content_type="application/json")
        time.sleep(1.1)

    locs = client.get("/api/locations").get_json()
    assert [l["name"] for l in locs] == ["C", "B", "A"]


# ---- PUT updates name and description ----

def test_update_name_and_description(client):
    client.post("/api/locations", data=json.dumps({
        "name": "Old Name", "description": "Old desc",
    }), content_type="application/json")

    client.put("/api/locations/1", data=json.dumps({
        "name": "New Name", "description": "New desc",
    }), content_type="application/json")

    loc = client.get("/api/locations").get_json()[0]
    assert loc["name"] == "New Name"
    assert loc["description"] == "New desc"
