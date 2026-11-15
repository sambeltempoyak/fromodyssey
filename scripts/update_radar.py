#!/usr/bin/env python3
"""Robot harian fromodyssey: membaca feed RSS/Atom publik tentang PhD berdana, hibah dan fellowship,
menyaring yang relevan untuk antropologi / masyarakat adat / dst., lalu menulis data/opportunities.json.

Hanya pustaka standar (jalan di GitHub Actions tanpa instalasi). Satu feed rusak tidak pernah menghentikan yang lain.

Pemakaian:
  python3 scripts/update_radar.py [--root .]
  python3 scripts/update_radar.py --test-feed contoh.xml [--root .]   # uji parser + saringan secara offline
"""
import argparse, datetime as dt, email.utils, hashlib, html, json, re, sys, time
import urllib.request, urllib.parse
import xml.etree.ElementTree as ET
from pathlib import Path

UA = "Mozilla/5.0 (compatible; FromodysseyRadar/2.0; personal research-funding alert reader)"
MONTHS = {
    "jan": 1, "januari": 1, "january": 1, "feb": 2, "februari": 2, "february": 2, "mar": 3, "maret": 3, "march": 3,
    "apr": 4, "april": 4, "may": 5, "mei": 5, "jun": 6, "juni": 6, "june": 6, "jul": 7, "juli": 7, "july": 7,
    "aug": 8, "agu": 8, "agt": 8, "ags": 8, "agustus": 8, "august": 8, "sep": 9, "sept": 9, "september": 9,
    "oct": 10, "okt": 10, "oktober": 10, "october": 10, "nov": 11, "november": 11, "dec": 12, "des": 12, "desember": 12, "december": 12,
}
MON_RE = r"(january|february|march|april|may|june|july|august|september|october|november|december|januari|februari|maret|mei|juni|juli|agustus|oktober|desember|jan|feb|mar|apr|jun|jul|aug|agu|agt|ags|sept|sep|oct|okt|nov|dec|des)"
DL_KEY = r"(?:closing date|closes|close on|deadline|apply by|due (?:date|by)|applications? (?:close|due|accepted until)|submission deadline|batas (?:akhir|waktu)(?: pendaftaran| pengajuan)?|tenggat|ditutup|paling lambat|selambat-lambatnya|pendaftaran (?:dibuka )?(?:hingga|sampai))"


def fetch(url, timeout=25):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read()
        enc = r.headers.get_content_charset() or "utf-8"
    for e in (enc, "utf-8", "iso-8859-1"):
        try:
            return raw.decode(e)
        except Exception:
            continue
    return raw.decode("utf-8", "replace")


def strip_html(s):
    s = re.sub(r"(?is)<(script|style).*?</\1>", " ", s or "")
    s = re.sub(r"(?s)<[^>]+>", " ", s)
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


def _mk(y, mo, d):
    try:
        return dt.date(int(y), int(mo), int(d))
    except (ValueError, TypeError):
        return None


def parse_date(text, ref=None):
    """Cari tanggal penutupan/tenggat di teks bebas (Inggris + Indonesia). Hasil: ISO date atau None."""
    ref = ref or dt.date.today()
    t = text or ""
    for km in re.finditer(DL_KEY, t, re.I):
        seg = t[km.end(): km.end() + 90]
        # 15 January 2027 / 15 Januari 2027 / Monday, 5th March
        m = re.search(r"(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?" + MON_RE + r"\.?,?\s*(\d{4})?", seg, re.I)
        if m:
            mo = MONTHS.get(m.group(2).lower()) or MONTHS.get(m.group(2)[:3].lower())
            y = int(m.group(3)) if m.group(3) else ref.year
            d = _mk(y, mo, m.group(1))
            if d and not m.group(3) and d < ref - dt.timedelta(days=30):
                d = _mk(y + 1, mo, m.group(1))
            if d:
                return d.isoformat()
        # January 15, 2027
        m = re.search(MON_RE + r"\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})", seg, re.I)
        if m:
            mo = MONTHS.get(m.group(1).lower()) or MONTHS.get(m.group(1)[:3].lower())
            d = _mk(m.group(3), mo, m.group(2))
            if d:
                return d.isoformat()
        # 15/01/2027 (hari/bulan/tahun) atau 2027-01-15
        m = re.search(r"(\d{4})-(\d{2})-(\d{2})", seg)
        if m:
            d = _mk(*m.groups())
            if d:
                return d.isoformat()
        m = re.search(r"(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})", seg)
        if m:
            dd, mo, y = map(int, m.groups())
            y = y + 2000 if y < 100 else y
            d = _mk(y, mo, dd)
            if d:
                return d.isoformat()
    return None


def parse_pub(s):
    if not s:
        return None
    s = s.strip()
    try:
        return email.utils.parsedate_to_datetime(s).date().isoformat()
    except Exception:
        pass
    m = re.match(r"(\d{4}-\d{2}-\d{2})", s)
    return m.group(1) if m else None


def local(tag):
    return tag.rsplit("}", 1)[-1].lower()


def parse_feed(text):
    """Daftar dict {title, link, summary, published}. RSS 2.0, RSS 1.0 (RDF) dan Atom; cadangan regex untuk feed agak rusak."""
    items = []
    try:
        clean = re.sub(r"^\s*<\?xml[^>]*\?>", "", text.strip())
        root = ET.fromstring(clean)
        for el in root.iter():
            if local(el.tag) not in ("item", "entry"):
                continue
            rec = {"title": "", "link": "", "summary": "", "published": None}
            for ch in el:
                n = local(ch.tag)
                val = (ch.text or "").strip()
                if n == "title":
                    rec["title"] = strip_html(val)
                elif n == "link":
                    href = ch.attrib.get("href")
                    rel = ch.attrib.get("rel", "alternate")
                    if href and rel == "alternate":
                        rec["link"] = href
                    elif val and not rec["link"]:
                        rec["link"] = val
                    elif href and not rec["link"]:
                        rec["link"] = href
                elif n in ("description", "summary", "content", "encoded") and len(val) > len(rec["summary"]):
                    rec["summary"] = val
                elif n in ("pubdate", "published", "updated", "date") and not rec["published"]:
                    rec["published"] = parse_pub(val)
                elif n == "guid" and not rec["link"] and val.startswith("http"):
                    rec["link"] = val
            if rec["title"] and rec["link"]:
                items.append(rec)
        return items
    except ET.ParseError:
        pass
    for block in re.findall(r"(?is)<(?:item|entry)\b.*?</(?:item|entry)>", text):
        def grab(tag):
            m = re.search(rf"(?is)<{tag}\b[^>]*>(.*?)</{tag}>", block)
            if not m:
                return ""
            v = m.group(1).strip()
            return re.sub(r"(?s)^<!\[CDATA\[(.*)\]\]>$", r"\1", v)
        link = strip_html(grab("link")) or strip_html(grab("guid"))
        if not link:
            m = re.search(r'(?is)<link\b[^>]*href=["\']([^"\']+)', block)
            link = m.group(1) if m else ""
        rec = {"title": strip_html(grab("title")), "link": html.unescape(link), "summary": grab("description") or grab("summary") or grab("content"),
               "published": parse_pub(strip_html(grab("pubDate") or grab("published") or grab("updated")))}
        if rec["title"] and rec["link"]:
            items.append(rec)
    return items


def guess_type(title, summary):
    t = title.lower()
    a = (title + " " + summary[:600]).lower()
    if re.search(r"\b(phd|ph\.d|doctoral|doctorate|dphil|promovend|studentship|program doktor)\b", t):
        return "phd"
    if re.search(r"\bfellowship|\bresidenc(y|ies)\b|\bvisiting (scholar|researcher)", t):
        return "fellowship"
    if re.search(r"\b(grant|hibah|award|funding|call for (proposals|applications)|fund)\b", t):
        return "grant"
    if re.search(r"\b(summer school|winter school|course|kursus|workshop|training|pelatihan)\b", t):
        return "course"
    if re.search(r"\b(phd|doctoral)\b", a):
        return "phd"
    if "fellowship" in a:
        return "fellowship"
    return "grant"


INTL_POS = r"international (students|applicants|candidates|scholars|researchers)|all nationalities|any nationality|regardless of (nationality|citizenship)|open to (all|international)|global south|developing countr|low[- ] (and|or) middle[- ]income|\blmics?\b|southeast asia|asia[- ]pacific|indonesia|\bwni\b|warga negara indonesia"
INTL_NEG = r"(us|u\.s\.|eu|uk|home|domestic|australian|canadian) (citizens?|nationals?|students?|residents?)[^.]{0,20}only|only (open|available) to (us|uk|eu|home|domestic)|not (open|available) to international|international (students|applicants) (are )?not eligible|must be a (us|u\.s\.|uk|australian|canadian) citizen"


def intl_flag(text):
    pos = re.search(INTL_POS, text, re.I)
    neg = re.search(INTL_NEG, text, re.I)
    if neg and not pos:
        return False
    if pos and not neg:
        return True
    return None


ORG_RE = r"\b(organi[sz]ations?|ngos?|csos?|civil society|non-?profits?|charit(y|ies)|community[- ]based|grassroots|lembaga|yayasan|komunitas|organisasi|lsm|legal entit|badan hukum)\b"
IND_RE = r"\b(individuals?|perorangan|individu|researchers?|scholars?|students?|early[- ]career)\b"


def applicant_guess(kind, text):
    if kind in ("phd", "course"):
        return "individu"
    org = re.search(ORG_RE, text, re.I)
    ind = re.search(IND_RE, text, re.I) or kind == "fellowship"
    if org and ind:
        return "keduanya"
    if org:
        return "lembaga"
    if ind:
        return "individu"
    return None


AMOUNT_RE = r"(?:USD|US\$|\$|€|EUR|£|GBP|AUD|A\$|Rp\.?|IDR)\s?\d[\d.,]*(?:\s?(?:k|million|juta|miliar)\b)?|\d[\d.,]*\s?(?:USD|EUR|euros?|AUD|juta rupiah|rupiah)\b"


def find_amount(text):
    m = re.search(r"(?:grants?|awards?|hibah|dana|funding|up to|hingga|sampai|maksimal|maximum|stipend|salary)[^.\n]{0,50}?(" + AMOUNT_RE + ")", text, re.I)
    if not m:
        m2 = re.search(AMOUNT_RE, text)
        return m2.group(0).strip(" .,;") if m2 else ""
    return m.group(1).strip(" .,;")


def find_org(title, summary, default):
    m = re.search(r"(University of [A-Z][\w' -]+?|Universiteit [A-Z][\w ]+?|Universitas [A-Z][\w ]+?|[A-Z][\w']+ University|[A-Z][\w']+ Foundation|Yayasan [A-Z][\w ]+?|[A-Z][\w']+ Institute)\b", title + " " + summary[:400])
    return m.group(1).strip() if m else default


def build_relevance(words):
    """Cocok di AWAL kata: 'anthropolog' cocok 'anthropology', 'adat' tidak cocok 'kadat'."""
    ws = [w.strip().lower() for w in words if w and w.strip()]
    return re.compile(r"\b(?:" + "|".join(re.escape(w) for w in sorted(ws, key=len, reverse=True)) + ")", re.I) if ws else None


def is_relevant(title, summary, rx, loose=False):
    """Simpan bila ada kata kunci di JUDUL, atau dua kata kunci BERBEDA di isi (loose: satu saja cukup)."""
    if rx is None:
        return True
    if rx.search(title):
        return True
    found = {m.lower() for m in rx.findall(summary)}
    return len(found) >= (1 if loose else 2)


def build_exclude(patterns):
    ps = [p for p in patterns if p]
    return re.compile("|".join(ps), re.I) if ps else None


KEEP_TITLE = re.compile(r"\bphd|ph\.d|studentship|doctoral|doktor|scholarship|beasiswa|\bgrants?\b|hibah|fellowship|call for (proposals|applications)|research (assistant|associate)", re.I)
SENIOR = re.compile(r"post-?doc|postdoctoral|lecturer|professor|tenure|reader in|head of|dean\b", re.I)


def is_excluded(title, rx):
    """Posisi admin/fasilitas/akademisi senior dibuang. Judul PhD/hibah/fellowship selamat, kecuali jelas postdoc/dosen."""
    if SENIOR.search(title):
        return True
    return bool(rx and rx.search(title) and not KEEP_TITLE.search(title))


def make_record(it, f, today, old, loc_words):
    summary = strip_html(it["summary"])
    title = it["title"][:220]
    blob = title + " " + summary
    iid = "r" + hashlib.sha1(it["link"].encode()).hexdigest()[:12]
    kind = f.get("type") or guess_type(title, summary)
    loc = next((w for w in loc_words if re.search(r"\b" + re.escape(w), blob, re.I)), "")
    return {
        "id": iid,
        "title": title,
        "link": it["link"],
        "org": find_org(title, summary, f.get("org") or "") if f.get("org_from_item", True) else (f.get("org") or ""),
        "source": f["name"],
        "type": kind,
        "summary": summary[:900],
        "published": it.get("published") or today.isoformat(),
        "deadline": parse_date(summary, today) or parse_date(title, today),
        "intl": intl_flag(blob),
        "location": loc,
        "first_seen": old.get(iid, {}).get("first_seen", today.isoformat()),
        "amount": find_amount(summary),
        "applicant": applicant_guess(kind, blob),
    }


def filter_items(items, f, rel, excl):
    kept, dropped_excl, dropped_rel = [], 0, 0
    for it in items:
        summary = strip_html(it["summary"])
        if is_excluded(it["title"], excl):
            dropped_excl += 1
            continue
        if not f.get("all") and not is_relevant(it["title"], summary, rel, f.get("relevance") == "loose"):
            dropped_rel += 1
            continue
        kept.append(it)
    return kept, dropped_excl, dropped_rel


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--test-feed", help="uji offline: parse file RSS/Atom lokal, tampilkan apa yang disimpan (tidak menulis apa pun)")
    args = ap.parse_args()
    root = Path(args.root)
    cfg = json.loads((root / "config/sources.json").read_text(encoding="utf-8"))
    rel = build_relevance(cfg.get("relevance", []))
    excl = build_exclude(cfg.get("exclude_titles", []))
    loc_words = cfg.get("location_words", [])
    today = dt.date.today()

    if args.test_feed:
        f = {"name": "uji lokal", "url": args.test_feed}
        items = parse_feed(Path(args.test_feed).read_text(encoding="utf-8"))
        kept, de, dr = filter_items(items, f, rel, excl)
        print(f"{len(items)} item dibaca · {len(kept)} disimpan · {de} dibuang (judul admin/senior) · {dr} dibuang (tidak relevan)")
        for it in kept:
            r = make_record(it, f, today, {}, loc_words)
            print(json.dumps({k: r[k] for k in ("title", "type", "deadline", "intl", "applicant", "amount", "location")}, ensure_ascii=False))
        return 0

    out_path = root / "data/opportunities.json"
    old = {}
    if out_path.exists():
        try:
            for it in json.loads(out_path.read_text(encoding="utf-8")).get("items", []):
                old[it["id"]] = it
        except Exception:
            pass

    feeds = [dict(f) for f in cfg.get("feeds", []) if f.get("url") and not f.get("off")]
    report, fresh, seen_urls = [], {}, set()
    for f in feeds:
        if f["url"] in seen_urls:
            continue
        seen_urls.add(f["url"])
        entry = {"name": f["name"], "count": 0, "ok": True, "error": ""}
        try:
            text = fetch(f["url"])
            items = parse_feed(text)
            if not items and not re.search(r"<(rss|feed|rdf:RDF)\b", text[:2000], re.I):
                raise ValueError("bukan feed RSS/Atom (mungkin halaman web biasa atau halaman blokir)")
            kept, de, dr = filter_items(items, f, rel, excl)
            for it in kept:
                rec = make_record(it, f, today, old, loc_words)
                fresh[rec["id"]] = rec
            entry.update(count=len(kept), read=len(items), dropped_admin=de, dropped_irrelevant=dr)
        except Exception as e:
            msg = str(e)
            if "HTTP Error 404" in msg:
                msg = "404: alamat feed tidak ada (ganti atau matikan feed ini)"
            elif "HTTP Error 403" in msg:
                msg = "403: situs menolak robot"
            elif "timed out" in msg.lower():
                msg = "terlalu lama, tidak menjawab"
            entry.update(ok=False, error=msg[:160])
        report.append(entry)
        time.sleep(0.6)

    # gabung dengan hasil sebelumnya supaya item tidak hilang saat satu feed tersendat
    merged = dict(old)
    merged.update(fresh)
    keep_days = cfg.get("keep_days", 90)
    all_names = {f["name"] for f in feeds if f.get("all")}
    loose_names = {f["name"] for f in feeds if f.get("relevance") == "loose"}
    final = []
    for it in merged.values():
        if it["id"] not in fresh:  # bawaan run sebelumnya: terapkan saringan hari ini juga
            if is_excluded(it.get("title", ""), excl):
                continue
            if it.get("source") not in all_names and not is_relevant(it.get("title", ""), it.get("summary", ""), rel, it.get("source") in loose_names):
                continue
        try:
            fs = dt.date.fromisoformat(it.get("first_seen") or today.isoformat())
        except ValueError:
            fs = today
        if (today - fs).days > keep_days:
            continue
        if it.get("deadline"):
            try:
                if dt.date.fromisoformat(it["deadline"]) < today - dt.timedelta(days=3):
                    continue
            except ValueError:
                pass
        final.append(it)
    final.sort(key=lambda x: x.get("first_seen", ""), reverse=True)
    final = final[: cfg.get("max_items", 400)]

    out = {
        "updated": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
        "count": len(final),
        "sources": sum(1 for r in report if r["ok"] and r["count"] > 0),
        "report": report,
        "items": final,
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"Menulis {len(final)} peluang ({len(fresh)} baru dari run ini) dari {len(feeds)} feed.\n")
    print("LAPORAN PER FEED")
    for r in report:
        if r["ok"]:
            print(f"  OK     {r['name']}: {r['count']} disimpan (dibaca {r.get('read', 0)}, dibuang admin/senior {r.get('dropped_admin', 0)}, tidak relevan {r.get('dropped_irrelevant', 0)})")
        else:
            print(f"  GAGAL  {r['name']}: {r['error']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
