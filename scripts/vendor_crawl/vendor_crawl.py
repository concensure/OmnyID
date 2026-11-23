"""Reusable vendor-directory crawler. See README.md. Usage: python vendor_crawl.py <command> ..."""
import argparse
import concurrent.futures
import importlib.util
import os
import sys

sys.dont_write_bytecode = True  # keeps job folders and this tool free of __pycache__
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from vc_discover import discover_listing, discover_sitemap, probe  # noqa: E402
from vc_extract import drop_sitewide, extract_page  # noqa: E402
from vc_http import FetchError, Fetcher, load_raw, save_raw  # noqa: E402
from vc_job import Job  # noqa: E402
from vc_report import digest, export_csv, status  # noqa: E402
from vc_sites import run_sites  # noqa: E402

CONFIG_ARGS = ("listing_url", "link_regex", "page_param", "page_template", "first_page",
               "max_pages", "sitemap", "category")


def make_fetcher(args):
    return Fetcher(delay=args.delay, respect_robots=not args.ignore_robots)


def save_config(job, args):
    cfg = job.config()
    cfg.update({k: getattr(args, k) for k in CONFIG_ARGS if getattr(args, k, None) is not None})
    job.write("job.json", cfg)
    return cfg


def cmd_list(args):
    job = Job(args.job)
    cfg = save_config(job, args)
    fetcher = make_fetcher(args)
    if cfg.get("sitemap"):
        discover_sitemap(job, fetcher, cfg)
    if cfg.get("listing_url"):
        discover_listing(job, fetcher, cfg, refresh=args.refresh)
    if not cfg.get("sitemap") and not cfg.get("listing_url"):
        sys.exit("Nothing to list: pass --listing-url and/or --sitemap (or `add` URLs directly).")
    print(f"manifest: {len(job.manifest())} URLs in {job.path('urls.json')}")


def cmd_add(args):
    job = Job(args.job)
    urls = list(args.urls)
    if args.file:
        with open(args.file, encoding="utf-8") as handle:
            urls += [line.strip() for line in handle if line.strip()]
    print(f"added {job.add_urls((u, args.label or '') for u in urls)} of {len(urls)} URLs")


def fetch_one(job, fetcher, key, url):
    path = job.path("raw", key + ".html.gz")
    err_path = job.path("raw", key + ".err")
    try:
        _, body, _ = fetcher.get(url)
    except FetchError as err:
        with open(err_path, "w", encoding="utf-8") as handle:
            handle.write(err.reason)
        return key, f"FAILED {err.reason}"
    save_raw(path, body)
    return key, f"saved {len(body)} bytes"


def cmd_fetch(args):
    job = Job(args.job)
    fetcher = make_fetcher(args)
    if args.retry_errors:
        for key in job.manifest():
            if os.path.exists(job.path("raw", key + ".err")):
                os.remove(job.path("raw", key + ".err"))
    todo = [(k, e["url"]) for k, e in job.manifest().items()
            if not os.path.exists(job.path("raw", k + ".html.gz"))
            and not os.path.exists(job.path("raw", k + ".err"))]
    todo = todo[:args.limit] if args.limit else todo
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        for key, note in pool.map(lambda item: fetch_one(job, fetcher, *item), todo):
            print(f"  {key:40s} {note}")
    print(f"fetched {len(todo)} pages")


def load_profile(job):
    """Optional <job>/profile.py with enrich(key, url, page, data) -> dict for site-specific fields."""
    path = job.path("profile.py")
    if not os.path.exists(path):
        return None
    spec = importlib.util.spec_from_file_location("vc_job_profile", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return getattr(module, "enrich", None)


def cmd_extract(args):
    job = Job(args.job)
    enrich = load_profile(job)
    records = []
    for key, entry in job.manifest().items():
        raw = job.path("raw", key + ".html.gz")
        if not os.path.exists(raw):
            continue
        page = load_raw(raw)
        data, states = extract_page(entry["url"], page)
        data["label"] = entry.get("label", "")
        if enrich:
            data.update(enrich(key, entry["url"], page, data) or {})
        for state_id, blob in states.items():
            with open(job.path("state", f"{key}.{state_id}.json"), "w", encoding="utf-8") as handle:
                handle.write(blob)
        records.append((key, data))
    drop_sitewide([data for _, data in records])
    for key, data in records:
        job.write(f"data/{key}.json", data)
    print(f"extracted {len(records)} pages into {job.path('data')}")


def cmd_sites(args):
    job = Job(args.job)
    keys = args.only or [k for k in job.manifest() if os.path.exists(job.path("data", k + ".json"))]
    print(f"crawled {run_sites(job, make_fetcher(args), keys, refetch=args.refetch)} own sites")


def cmd_run(args):
    for step in (cmd_list, cmd_fetch, cmd_extract, cmd_sites):
        step(args)
    status(Job(args.job))


def build_parser():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    net = argparse.ArgumentParser(add_help=False)
    net.add_argument("--delay", type=float, default=1.0, help="seconds between requests per host")
    net.add_argument("--ignore-robots", action="store_true",
                     help="only with the site owner's permission; default respects robots.txt")
    disc = argparse.ArgumentParser(add_help=False)
    disc.add_argument("--listing-url", dest="listing_url")
    disc.add_argument("--link-regex", dest="link_regex", help="regex a detail-page URL must match")
    disc.add_argument("--page-param", dest="page_param", help="query param for page number")
    disc.add_argument("--page-template", dest="page_template", help="URL with {n}")
    disc.add_argument("--first-page", dest="first_page", type=int)
    disc.add_argument("--max-pages", dest="max_pages", type=int)
    disc.add_argument("--sitemap")
    disc.add_argument("--category")
    disc.add_argument("--refresh", action="store_true", help="re-download cached listing pages")

    p = sub.add_parser("probe", parents=[net], help="report how a site exposes data")
    p.add_argument("url")
    p.set_defaults(func=lambda a: probe(make_fetcher(a), a.url))
    for name, func, helptext in (("list", cmd_list, "discover detail-page URLs"),
                                 ("run", cmd_run, "list + fetch + extract + sites + status")):
        p = sub.add_parser(name, parents=[net, disc], help=helptext)
        p.add_argument("job")
        p.set_defaults(func=func)
        if name == "run":
            p.add_argument("--workers", type=int, default=3)
            p.add_argument("--limit", type=int)
            p.add_argument("--retry-errors", action="store_true")
            p.add_argument("--only", nargs="*")
            p.add_argument("--refetch", action="store_true")
    p = sub.add_parser("add", help="add URLs to the manifest by hand")
    p.add_argument("job")
    p.add_argument("urls", nargs="*")
    p.add_argument("--file")
    p.add_argument("--label")
    p.set_defaults(func=cmd_add)
    p = sub.add_parser("fetch", parents=[net], help="download listed pages (resumable)")
    p.add_argument("job")
    p.add_argument("--workers", type=int, default=3)
    p.add_argument("--limit", type=int)
    p.add_argument("--retry-errors", action="store_true")
    p.set_defaults(func=cmd_fetch)
    p = sub.add_parser("extract", help="parse fetched pages offline into data/*.json")
    p.add_argument("job")
    p.set_defaults(func=cmd_extract)
    p = sub.add_parser("sites", parents=[net], help="crawl each vendor's own website")
    p.add_argument("job")
    p.add_argument("--only", nargs="*", help="keys to (re)crawl")
    p.add_argument("--refetch", action="store_true")
    p.set_defaults(func=cmd_sites)
    p = sub.add_parser("status", help="counts and gaps")
    p.add_argument("job")
    p.set_defaults(func=lambda a: status(Job(a.job)))
    p = sub.add_parser("digest", help="compact reading digest for curation")
    p.add_argument("job")
    p.add_argument("keys", nargs="*")
    p.add_argument("--todo", type=int, default=5, help="when no keys: next N uncurated")
    p.add_argument("--chars", type=int, default=900)
    p.set_defaults(func=lambda a: digest(Job(a.job), a.keys, a.todo, a.chars))
    p = sub.add_parser("export", help="write a flat CSV of every vendor")
    p.add_argument("job")
    p.add_argument("--out")
    p.set_defaults(func=lambda a: print(
        f"wrote {export_csv(Job(a.job), a.out or Job(a.job).path('export.csv'))} rows"))
    return parser


def main():
    args = build_parser().parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
