"""A crawl job is one folder: job.json (config), urls.json (manifest) and per-step output dirs."""
import hashlib
import json
import os
import re
import urllib.parse

SUBDIRS = ("raw", "listing", "data", "state", "web", "curated")
TRACKING = re.compile(r"^(utm_|fbclid|gclid|mc_)", re.I)


def clean_url(url):
    parts = urllib.parse.urlparse(url.strip())
    query = [(k, v) for k, v in urllib.parse.parse_qsl(parts.query) if not TRACKING.match(k)]
    return urllib.parse.urlunparse(parts._replace(fragment="", query=urllib.parse.urlencode(query)))


def make_key(url, taken):
    parts = urllib.parse.urlparse(url)
    segments = [s for s in parts.path.split("/") if s]
    base = segments[-1] if segments else parts.netloc
    base = re.sub(r"\.(html?|php|aspx?)$", "", base, flags=re.I)
    base = re.sub(r"[^A-Za-z0-9._-]+", "-", base).strip("-")[:80] or "page"
    if base in taken and taken[base]["url"] != url:
        base += "-" + hashlib.sha1(url.encode()).hexdigest()[:6]
    return base


class Job:
    def __init__(self, root):
        self.root = os.path.abspath(root)
        os.makedirs(self.root, exist_ok=True)
        for sub in SUBDIRS:
            os.makedirs(self.path(sub), exist_ok=True)

    def path(self, *parts):
        return os.path.join(self.root, *parts)

    def read(self, rel, default=None):
        full = self.path(rel)
        if not os.path.exists(full):
            return {} if default is None else default
        with open(full, encoding="utf-8") as handle:
            return json.load(handle)

    def write(self, rel, obj):
        full = self.path(rel)
        tmp = full + ".tmp"
        with open(tmp, "w", encoding="utf-8") as handle:
            json.dump(obj, handle, ensure_ascii=False, indent=1)
        os.replace(tmp, full)

    def config(self):
        return self.read("job.json")

    def manifest(self):
        return self.read("urls.json")

    def add_urls(self, items):
        """items: iterable of (url, label). Returns the number of new manifest entries."""
        manifest = self.manifest()
        known = {entry["url"] for entry in manifest.values()}
        added = 0
        for url, label in items:
            url = clean_url(url)
            if url in known:
                continue
            manifest[make_key(url, manifest)] = {"url": url, "label": label}
            known.add(url)
            added += 1
        self.write("urls.json", manifest)
        return added

    def curated(self):
        """All curated/*.json merged: {key: entry}. Agents write own-words entries here."""
        merged = {}
        folder = self.path("curated")
        for name in sorted(os.listdir(folder)):
            if name.endswith(".json"):
                merged.update(self.read(os.path.join("curated", name)))
        return merged
