"""Site-agnostic page extraction: JSON-LD, OpenGraph, contacts, website/social links, images, text."""
import html as htmllib
import json
import re
import urllib.parse

EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}")
JUNK_EMAIL = (
    "sentry", "wixpress", "example.", "domain.com", "email.com", "yourname", "u002f", ".png",
    ".jpg", ".webp", "godaddy", "wordpress", "your@", "name@", "user@", "@2x", "privacy@",
)
PHONE_AU = re.compile(
    r"(?:\+?61[\s-]?\(?0?\d\)?|\(0\d\)|\b0\d|\b1[38]00)[\s-]?[\d\s()-]{6,12}\d"
)
PRICE = re.compile(
    r"\$\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:-|to)\s?\$?\s?\d[\d,]*)?"
    r"(?:\s?(?:pp|per\s+(?:head|person|hour|guest))|\+)?",
    re.I,
)
SOCIAL_HOSTS = (
    "facebook.com", "instagram.com", "tiktok.com", "pinterest.", "youtube.com", "youtu.be",
    "linkedin.com", "twitter.com", "x.com",
)
SKIP_HOSTS = SOCIAL_HOSTS + (
    "google.", "gstatic.", "googleapis.", "apple.com", "schema.org", "w3.org", "cloudflare",
    "doubleclick", "wp.com", "wordpress.", "gravatar", "mailchimp", "bing.com", "maps.",
    "goo.gl", "g.page", "play.google", "jquery", "bootstrap", "fontawesome", "cookie", "trustpilot",
)
SKIP_ENTITY_TYPES = {
    "WebSite", "WebPage", "BreadcrumbList", "FAQPage", "ImageObject", "SearchAction", "ListItem",
    "Review", "Question", "Answer", "ItemList", "SiteNavigationElement", "CollectionPage",
}
WEBSITE_HINT = re.compile(r"web\s*site|visit|official|view\s+site|www\.", re.I)
JUNK_IMAGE = re.compile(r"logo|icon|sprite|avatar|pixel|1x1|favicon|badge|spinner|blank|placeholder", re.I)
SECOND_LEVEL = {"com", "net", "org", "gov", "edu", "co"}


def strip_tags(fragment):
    text = re.sub(r"<script.*?</script>|<style.*?</style>|<noscript.*?</noscript>", " ", fragment, flags=re.S | re.I)
    text = re.sub(r"<br\s*/?>|</p>|</div>|</li>|</h\d>|</tr>", "\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = htmllib.unescape(text).replace("\xa0", " ")
    text = re.sub(r"[ \t\r]+", " ", text)
    return re.sub(r"\n\s*\n+", "\n", text).strip()


def registered_domain(host):
    labels = host.lower().split(":")[0].removeprefix("www.").split(".")
    if len(labels) >= 3 and labels[-2] in SECOND_LEVEL:
        return ".".join(labels[-3:])
    return ".".join(labels[-2:])


def page_base(url, page):
    """Relative links resolve against <base href> when the page declares one."""
    declared = re.search(r"<base\b[^>]*href=[\"']([^\"']+)", page, flags=re.I)
    return urllib.parse.urljoin(url, htmllib.unescape(declared.group(1))) if declared else url


def anchors(base, page):
    base = page_base(base, page)
    out = []
    pattern = r"<a\b([^>]*?)href=[\"']([^\"'#][^\"']*)[\"']([^>]*)>(.*?)</a>"
    for match in re.finditer(pattern, page, flags=re.S | re.I):
        href = htmllib.unescape(match.group(2)).strip()
        if href.startswith(("javascript:", "mailto:", "tel:", "data:")):
            continue
        out.append({
            "url": urllib.parse.urljoin(base, href),
            "text": re.sub(r"\s+", " ", strip_tags(match.group(4))).strip()[:80],
            "attrs": (match.group(1) + " " + match.group(3)).lower(),
        })
    return out


def decode_cfemail(hexstr):
    """Cloudflare hides emails as hex where byte 0 is the XOR key for the rest."""
    try:
        raw = bytes.fromhex(hexstr)
        return bytes(b ^ raw[0] for b in raw[1:]).decode("utf-8")
    except (ValueError, IndexError):
        return ""


def emails_in(page):
    found = []
    candidates = [urllib.parse.unquote(m) for m in re.findall(r'href=["\']mailto:([^"\'?>\s]+)', page, flags=re.I)]
    candidates += [decode_cfemail(h) for h in re.findall(r'data-cfemail="([0-9a-f]+)"', page)]
    candidates += EMAIL.findall(htmllib.unescape(page))
    for email in candidates:
        email = email.strip(" .;,").lower()
        if EMAIL.fullmatch(email) and not any(j in email for j in JUNK_EMAIL) and email not in found:
            found.append(email)
    return found


def phones_in(page, text):
    found, seen = [], set()
    candidates = [urllib.parse.unquote(m) for m in re.findall(r'href=["\']tel:([^"\'>]+)', page, flags=re.I)]
    candidates += PHONE_AU.findall(text)
    for phone in candidates:
        phone = re.sub(r"\s+", " ", phone).strip(" -")
        digits = re.sub(r"\D", "", phone)
        if 8 <= len(digits) <= 12 and digits not in seen:
            seen.add(digits)
            found.append(phone)
    return found


def jsonld_nodes(page):
    nodes = []

    def walk(item):
        if isinstance(item, list):
            for sub in item:
                walk(sub)
        elif isinstance(item, dict):
            if "@graph" in item:
                walk(item["@graph"])
            nodes.append(item)

    pattern = r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>'
    for match in re.finditer(pattern, page, flags=re.S | re.I):
        try:
            walk(json.loads(match.group(1), strict=False))
        except ValueError:
            continue
    return nodes


def as_str(value):
    if isinstance(value, str):
        return htmllib.unescape(value).strip()
    if isinstance(value, dict):
        return as_str(value.get("name") or value.get("url") or value.get("@id") or "")
    if isinstance(value, list):
        return as_str(value[0]) if value else ""
    return "" if value is None else str(value)


def node_types(node):
    kind = node.get("@type", [])
    return [kind] if isinstance(kind, str) else list(kind)


def entity_of(nodes):
    best, best_score = None, 0
    for node in nodes:
        if not node.get("name") or set(node_types(node)) <= SKIP_ENTITY_TYPES:
            continue
        score = 1 + 2 * bool(node.get("telephone")) + 2 * bool(node.get("address"))
        score += bool(node.get("aggregateRating")) + bool(node.get("description"))
        if score > best_score:
            best, best_score = node, score
    if not best:
        return {}
    addr = best.get("address") or {}
    addr = addr[0] if isinstance(addr, list) and addr else addr
    addr = {"streetAddress": addr} if isinstance(addr, str) else (addr or {})
    rating = best.get("aggregateRating") or {}
    images = best.get("image") or []
    images = [images] if not isinstance(images, list) else images
    return {
        "type": node_types(best),
        "name": as_str(best.get("name")),
        "description": as_str(best.get("description")),
        "phone": as_str(best.get("telephone")),
        "email": as_str(best.get("email")),
        "url": as_str(best.get("url")),
        "street": as_str(addr.get("streetAddress")),
        "suburb": as_str(addr.get("addressLocality")),
        "region": as_str(addr.get("addressRegion")),
        "postcode": as_str(addr.get("postalCode")),
        "geo": best.get("geo") or {},
        "price_range": as_str(best.get("priceRange")),
        "rating": as_str(rating.get("ratingValue")),
        "review_count": as_str(rating.get("reviewCount") or rating.get("ratingCount")),
        "images": [as_str(i) for i in images if as_str(i)],
        "same_as": [as_str(s) for s in (best.get("sameAs") or []) if isinstance(s, str)],
    }


def faq_of(nodes):
    pairs = []
    for node in nodes:
        for item in node.get("mainEntity", []) if "FAQPage" in node_types(node) else []:
            answer = item.get("acceptedAnswer") or {}
            answer = answer[0] if isinstance(answer, list) and answer else answer
            pairs.append({
                "q": as_str(item.get("name")),
                "a": strip_tags(htmllib.unescape(as_str((answer or {}).get("text")))),
            })
    return pairs


def meta(page, *names):
    for name in names:
        for pattern in (
            rf'<meta[^>]+(?:property|name)=["\']{name}["\'][^>]+content=["\']([^"\']*)',
            rf'<meta[^>]+content=["\']([^"\']*)["\'][^>]+(?:property|name)=["\']{name}["\']',
        ):
            found = re.search(pattern, page, flags=re.I)
            if found:
                return htmllib.unescape(found.group(1)).strip()
    return ""


def is_social(url):
    parts = urllib.parse.urlparse(url)
    host = parts.netloc.lower()
    if not any(h in host for h in SOCIAL_HOSTS):
        return False
    return not re.search(r"sharer|share\?|intent/|/share|/embed|plugins", url, flags=re.I) and \
        parts.path.strip("/") != ""


def social_links(links):
    out = []
    for link in links:
        url = link["url"].split("?")[0].rstrip("/")
        if is_social(link["url"]) and url not in out:
            out.append(url)
    return out[:8]


def website_candidates(page_url, links):
    home = registered_domain(urllib.parse.urlparse(page_url).netloc)
    scored = {}
    for link in links:
        parts = urllib.parse.urlparse(link["url"])
        host = parts.netloc.lower()
        if parts.scheme not in ("http", "https") or not host or registered_domain(host) == home:
            continue
        if any(skip in host for skip in SKIP_HOSTS):
            continue
        score = 3 if WEBSITE_HINT.search(link["text"] + " " + link["attrs"]) else 0
        score += 1 if "_blank" in link["attrs"] or "nofollow" in link["attrs"] else 0
        root = f"{parts.scheme}://{host}{parts.path}".rstrip("/")
        if score > scored.get(root, {}).get("score", -1):
            scored[root] = {"url": root, "text": link["text"], "score": score}
    return sorted(scored.values(), key=lambda c: -c["score"])[:5]


def image_urls(page_url, page, extra=()):
    found = []
    page_url = page_base(page_url, page)
    sources = [meta(page, "og:image"), *extra]
    sources += re.findall(r'<img[^>]+(?:data-src|data-lazy-src|src)=["\']([^"\']+)', page, flags=re.I)
    for src in sources:
        src = htmllib.unescape(src or "").strip()
        if not src or src.startswith("data:") or JUNK_IMAGE.search(src):
            continue
        url = urllib.parse.urljoin(page_url, src)
        if re.search(r"\.(svg|gif)(\?|$)", url, flags=re.I) or url in found:
            continue
        found.append(url)
    return found[:30]


def embedded_state(page):
    """JSON blobs frameworks embed (Next.js etc.); often the full data set, so worth saving."""
    states = {}
    pattern = r'<script[^>]+id=["\']([\w-]+)["\'][^>]+type=["\']application/json["\'][^>]*>(.*?)</script>'
    for match in re.finditer(pattern, page, flags=re.S | re.I):
        if len(match.group(2)) >= 1500:
            states[match.group(1)] = match.group(2)
    return states


def main_text(page):
    for tag in ("main", "article"):
        found = re.search(rf"<{tag}\b[^>]*>(.*?)</{tag}>", page, flags=re.S | re.I)
        if found and len(strip_tags(found.group(1))) >= 500:
            return strip_tags(found.group(1))
    body = re.sub(r"<(nav|header|footer|aside)\b.*?</\1>", " ", page, flags=re.S | re.I)
    return strip_tags(body)


def display_name(page, entity):
    """JSON-LD name, else the first <h1>, else the page title minus its ' | Site' suffix."""
    if entity.get("name"):
        return entity["name"]
    h1 = re.search(r"<h1[^>]*>(.*?)</h1>", page, flags=re.S | re.I)
    if h1 and strip_tags(h1.group(1)):
        return re.sub(r"\s+", " ", strip_tags(h1.group(1)))
    return re.split(r"\s[|–-]\s", meta(page, "og:title"))[0].strip()


def price_snippets(text):
    out = []
    for match in PRICE.finditer(text):
        amount = re.search(r"\d[\d,]*", match.group(0)).group(0).replace(",", "")
        if int(amount) < 5:
            continue
        snippet = re.sub(r"\s+", " ", text[max(0, match.start() - 50):match.end() + 40]).strip()
        if snippet not in out:
            out.append(snippet)
    return out[:8]


def render_hint(page, text):
    if len(text) >= 400:
        return "ok"
    spa = re.search(r'id=["\'](?:root|app|__next|__nuxt)["\']', page)
    return "spa" if spa else "thin"


def drop_sitewide(records, fields=("social", "images")):
    """Removes values repeated on most pages (directory footer socials, banners) from each record."""
    if len(records) < 5:
        return
    for field in fields:
        counts = {}
        for record in records:
            for value in set(record.get(field, [])):
                counts[value] = counts.get(value, 0) + 1
        common = {v for v, n in counts.items() if n >= max(3, 0.4 * len(records))}
        for record in records:
            record[field] = [v for v in record.get(field, []) if v not in common]


def extract_page(url, page):
    """Returns (data, states). data is plain JSON; states maps blob id to raw JSON text."""
    nodes = jsonld_nodes(page)
    entity = entity_of(nodes)
    links = anchors(url, page)
    text = main_text(page)
    candidates = website_candidates(url, links)
    own = entity.get("url", "")
    own_site = own if own and registered_domain(urllib.parse.urlparse(own).netloc) != \
        registered_domain(urllib.parse.urlparse(url).netloc) else ""
    website = own_site or (candidates[0]["url"] if candidates and candidates[0]["score"] >= 3 else "")
    emails = emails_in(page)
    states = embedded_state(page)
    title = re.search(r"<title[^>]*>(.*?)</title>", page, flags=re.S | re.I)
    data = {
        "url": url,
        "title": re.sub(r"\s+", " ", htmllib.unescape(title.group(1))).strip() if title else "",
        "name": display_name(page, entity),
        "meta_description": meta(page, "og:description", "description"),
        "entity": entity,
        "phones": phones_in(page, strip_tags(page)),
        "emails": emails,
        "website": website,
        "website_candidates": candidates,
        "social": social_links(links) or entity.get("same_as", [])[:8],
        "images": image_urls(url, page, entity.get("images", [])),
        "headings": [
            re.sub(r"\s+", " ", strip_tags(h)).strip()
            for h in re.findall(r"<h[1-3][^>]*>(.*?)</h[1-3]>", page, flags=re.S | re.I)
        ][:25],
        "faq": faq_of(nodes),
        "price_snippets": price_snippets(text),
        "text": text[:8000],
        "render": render_hint(page, text),
        "jsonld_types": sorted({t for n in nodes for t in node_types(n)}),
        "embedded_state": {k: len(v) for k, v in states.items()},
    }
    return data, states
