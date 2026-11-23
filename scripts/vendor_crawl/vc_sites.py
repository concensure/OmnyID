"""Crawls each vendor's own website (home + wedding/contact-style pages) for contacts and reading text."""
import concurrent.futures
import re
import urllib.parse

from vc_extract import anchors, emails_in, image_urls, phones_in, render_hint, social_links
from vc_extract import strip_tags
from vc_http import FetchError

PAGE_HINTS = ("wedding", "contact", "enquir", "inquir", "function", "event", "venue", "faq",
              "package", "pricing", "about", "booking", "service", "portfolio")
SKIP_FILES = re.compile(r"\.(jpg|jpeg|png|gif|pdf|webp|svg|css|js|ico|zip|mp4)(\?|$)", re.I)
MAX_PAGES = 8
MAX_ATTEMPTS = 2


def bare_host(url):
    return urllib.parse.urlparse(url).netloc.lower().removeprefix("www.")


def same_site(a, b):
    return bare_host(a) == bare_host(b)


def related_links(base, page):
    out = []
    for link in anchors(base, page):
        url = link["url"]
        if not same_site(url, base) or SKIP_FILES.search(url) or "/feed" in url or "wp-json" in url:
            continue
        if any(h in url.lower() for h in PAGE_HINTS) and url not in out:
            out.append(url)
    return out


def crawl_site(fetcher, site):
    try:
        base, home = fetcher.get_text(site)
    except FetchError as err:
        return {"fetch_error": err.reason[:160]}
    pages = [(base, home)]
    for url in related_links(base, home)[:30]:
        if len(pages) >= MAX_PAGES:
            break
        if url.rstrip("/") == base.rstrip("/"):
            continue
        try:
            pages.append(fetcher.get_text(url))
        except FetchError:
            continue
    emails, phones, texts, images, links = [], [], [], [], []
    for url, body in pages:
        text = strip_tags(body)
        emails += [e for e in emails_in(body) if e not in emails]
        phones += [p for p in phones_in(body, text) if p not in phones]
        images += [i for i in image_urls(url, body) if i not in images]
        links += anchors(url, body)
        texts.append({"url": url, "text": re.sub(r"\s+", " ", text)[:2000]})
    return {
        "site_pages": [u for u, _ in pages],
        "emails": emails[:8],
        "phones": phones[:6],
        "social": social_links(links),
        "images": images[:20],
        "site_text": texts[:6],
        "render": render_hint(home, strip_tags(home)),
    }


def pick_site(job, key, overrides):
    """Manual websites.json beats whatever the directory page exposed."""
    if overrides.get(key):
        return overrides[key]
    return job.read(f"data/{key}.json").get("website", "")


def run_sites(job, fetcher, keys, refetch=False, workers=6):
    overrides = job.read("websites.json")
    todo = []
    for key in keys:
        site = pick_site(job, key, overrides)
        previous = job.read(f"web/{key}.json")
        done = previous.get("fetched") or previous.get("attempts", 0) >= MAX_ATTEMPTS
        if site and (refetch or not done or previous.get("website") != site):
            todo.append((key, site, previous))

    def work(item):
        key, site, previous = item
        result = crawl_site(fetcher, site)
        record = {"website": site, **result}
        record["fetched"] = "fetch_error" not in result
        record["attempts"] = 0 if record["fetched"] else previous.get("attempts", 0) + 1
        job.write(f"web/{key}.json", record)
        return key, site, record

    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        for key, site, record in pool.map(work, todo):
            note = record.get("fetch_error") or f"emails={record['emails']} render={record['render']}"
            print(f"  {key:40s} {site}  {note}")
    return len(todo)
