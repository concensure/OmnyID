"""Polite, resumable HTTP for vendor crawls: per-host delay, retries, robots.txt, gzip cache."""
import gzip
import os
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
import zlib

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36"
MAX_BYTES = 3_000_000


class FetchError(Exception):
    def __init__(self, url, reason, status=None):
        super().__init__(f"{url}: {reason}")
        self.reason = reason
        self.status = status


def decode(body, content_type=""):
    charset = None
    found = re.search(r"charset=([\w-]+)", content_type or "", flags=re.I)
    if found:
        charset = found.group(1)
    else:
        found = re.search(rb"<meta[^>]+charset=[\"']?([\w-]+)", body[:4096], flags=re.I)
        if found:
            charset = found.group(1).decode("ascii", "ignore")
    try:
        return body.decode(charset or "utf-8")
    except (UnicodeDecodeError, LookupError):
        # Sites often mislabel Windows-1252 pages as UTF-8; curly quotes then show as U+FFFD.
        return body.decode("cp1252", "replace")


class Fetcher:
    """Thread-safe. The delay is per host, so different hosts still run in parallel."""

    def __init__(self, delay=1.0, timeout=30, retries=3, respect_robots=True):
        self.delay = delay
        self.timeout = timeout
        self.retries = retries
        self.respect_robots = respect_robots
        self._next_slot = {}
        self._robots = {}
        self._lock = threading.Lock()

    def _wait(self, host):
        with self._lock:
            now = time.monotonic()
            slot = max(now, self._next_slot.get(host, 0))
            self._next_slot[host] = slot + self.delay
        time.sleep(max(0, slot - now))

    def _request(self, url):
        headers = {"User-Agent": UA, "Accept-Language": "en-AU,en;q=0.9", "Accept-Encoding": "gzip"}
        try:
            with urllib.request.urlopen(
                urllib.request.Request(url, headers=headers), timeout=self.timeout
            ) as res:
                body = res.read(MAX_BYTES)
                if res.headers.get("Content-Encoding") == "gzip":
                    body = zlib.decompressobj(16 + zlib.MAX_WBITS).decompress(body)
                return res.geturl(), body, res.headers.get("Content-Type", "")
        except urllib.error.HTTPError as err:
            raise FetchError(url, f"HTTP {err.code}", err.code) from err
        except (urllib.error.URLError, OSError, zlib.error) as err:
            raise FetchError(url, f"{type(err).__name__}: {err}") from err

    def robots(self, origin):
        with self._lock:
            parser = self._robots.get(origin)
        if parser is not None:
            return parser
        parser = urllib.robotparser.RobotFileParser()
        try:
            _, body, _ = self._request(origin + "/robots.txt")
            parser.parse(decode(body).splitlines())
        except FetchError:
            # No readable robots.txt means no published restrictions.
            parser.allow_all = True
        with self._lock:
            self._robots[origin] = parser
        return parser

    def allowed(self, url):
        if not self.respect_robots:
            return True
        parts = urllib.parse.urlparse(url)
        return self.robots(f"{parts.scheme}://{parts.netloc}").can_fetch(UA, url)

    def get(self, url):
        """Returns (final_url, body_bytes, content_type) or raises FetchError."""
        if not self.allowed(url):
            raise FetchError(url, "disallowed by robots.txt; skip it or get permission", 0)
        host = urllib.parse.urlparse(url).netloc
        last = None
        for attempt in range(self.retries):
            self._wait(host)
            try:
                return self._request(url)
            except FetchError as err:
                last = err
                if err.status and err.status < 500 and err.status != 429:
                    break
                time.sleep(2 * (attempt + 1))
        raise last

    def get_text(self, url):
        final, body, ctype = self.get(url)
        return final, decode(body, ctype)


def save_raw(path, body):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with gzip.open(path, "wb") as handle:
        handle.write(body)


def load_raw(path):
    with gzip.open(path, "rb") as handle:
        return decode(handle.read())
