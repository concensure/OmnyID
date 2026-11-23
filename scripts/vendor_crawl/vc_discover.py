"""Finds vendor detail-page URLs from paginated listings or sitemaps, and probes a site for structure."""
import collections
import gzip
import os
import re
import urllib.parse

from vc_extract import anchors, embedded_state, jsonld_nodes, node_types, strip_tags
from vc_extract import emails_in, phones_in
from vc_http import FetchError, decode, load_raw, save_raw


def page_url(cfg, number):
    first = cfg.get("first_page", 1)
    base = cfg["listing_url"]
    if number == first and not cfg.get("page_template"):
        return base
    if cfg.get("page_template"):
        return cfg["page_template"].format(n=number)
    sep = "&" if "?" in base else "?"
    return f"{base}{sep}{cfg.get('page_param', 'page')}={number}"


def cached_get(job, fetcher, url, name, refresh):
    path = job.path("listing", name + ".html.gz")
    if os.path.exists(path) and not refresh:
        return url, load_raw(path)
    final, body, ctype = fetcher.get(url)
    save_raw(path, body)
    return final, decode(body, ctype)


def suggest_patterns(links, host):
    """Groups same-host links by path prefix so the detail-page pattern is obvious in one look."""
    groups = collections.defaultdict(list)
    for link in links:
        parts = urllib.parse.urlparse(link["url"])
        if parts.netloc != host:
            continue
        segments = [s for s in parts.path.split("/") if s]
        if segments:
            groups["/" + "/".join(segments[:-1]) + "/*"].append(link["url"])
    ranked = sorted(groups.items(), key=lambda item: -len(item[1]))[:8]
    lines = []
    for pattern, urls in ranked:
        prefix = pattern[:-1]
        regex = "^https?://" + re.escape(host) + re.escape(prefix) + "[^/?#]+/?$"
        lines.append(f"  {len(urls):4d}  {pattern:45s} e.g. {urls[0]}\n        --link-regex '{regex}'")
    return "\n".join(lines)


def discover_listing(job, fetcher, cfg, refresh=False):
    regex = cfg.get("link_regex")
    host = urllib.parse.urlparse(cfg["listing_url"]).netloc
    seen, total_new = set(), 0
    for number in range(cfg.get("first_page", 1), cfg.get("first_page", 1) + cfg.get("max_pages", 30)):
        url = page_url(cfg, number)
        try:
            final, body = cached_get(job, fetcher, url, f"page-{number}", refresh)
        except FetchError as err:
            print(f"  page {number}: stopped ({err.reason})")
            break
        links = anchors(final, body)
        if not regex:
            print(f"No --link-regex given. Link groups on {url}:\n{suggest_patterns(links, host)}")
            return 0
        fresh = {}
        for link in links:
            if re.search(regex, link["url"]) and link["url"] not in seen:
                fresh.setdefault(link["url"], link["text"])
        fresh = list(fresh.items())
        seen.update(u for u, _ in fresh)
        total_new += job.add_urls(fresh)
        print(f"  page {number}: {len(fresh)} links ({total_new} new in manifest so far)")
        if not fresh:
            break
    return total_new


def sitemap_urls(fetcher, url, depth=0):
    final, body, _ = fetcher.get(url)
    if body[:2] == b"\x1f\x8b":
        body = gzip.decompress(body)
    text = decode(body)
    locs = re.findall(r"<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)", text)
    if "<sitemapindex" in text and depth < 2:
        out = []
        for child in locs[:25]:
            try:
                out += sitemap_urls(fetcher, child, depth + 1)
            except FetchError as err:
                print(f"  sitemap {child}: skipped ({err.reason})")
        return out
    return locs


def discover_sitemap(job, fetcher, cfg):
    regex = cfg.get("link_regex")
    if not regex:
        print("Sitemaps need --link-regex (they list every page on the site).")
        return 0
    urls = [u for u in sitemap_urls(fetcher, cfg["sitemap"]) if re.search(regex, u)]
    added = job.add_urls((u, "") for u in urls)
    print(f"  sitemap: {len(urls)} matching URLs, {added} new")
    return added


def probe(fetcher, url):
    """One-shot report on how a site exposes data, so no parser is written blind."""
    final, body, ctype = fetcher.get(url)
    page = decode(body, ctype)
    text = strip_tags(page)
    parts = urllib.parse.urlparse(final)
    nodes = jsonld_nodes(page)
    robots = fetcher.robots(f"{parts.scheme}://{parts.netloc}")
    sitemaps = (robots.site_maps() or []) if hasattr(robots, "site_maps") else []
    links = anchors(final, page)
    api_hints = sorted(set(re.findall(r"[\"'](/(?:api|wp-json|graphql)[^\"'\s]{0,60})", page)))[:8]
    print(f"url        {final}  ({len(body)} bytes, {ctype})")
    print(f"robots     {'allows' if fetcher.allowed(final) else 'DISALLOWS'} this path; sitemaps: {sitemaps or 'none listed'}")
    print(f"json-ld    {sorted({t for n in nodes for t in node_types(n)}) or 'none'}")
    print(f"state      {list(embedded_state(page)) or 'none'}   next.js: {'__NEXT_DATA__' in page}")
    print(f"api hints  {api_hints or 'none'}")
    print(f"text       {len(text)} chars visible -> {'server-rendered' if len(text) >= 400 else 'likely JS-rendered (needs a browser)'}")
    print(f"contacts   emails={emails_in(page)[:3]} phones={phones_in(page, text)[:3]}")
    print(f"links      {len(links)} total")
    print(suggest_patterns(links, parts.netloc) or "  (no same-host links)")
