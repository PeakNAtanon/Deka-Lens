from __future__ import annotations

import re
import sqlite3
import time
from dataclasses import dataclass
from typing import Iterable
from urllib.parse import quote_plus

import pandas as pd
from playwright.sync_api import Browser, Page, TimeoutError as PlaywrightTimeoutError, sync_playwright


DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36 DekaLens/1.0"
)


@dataclass(frozen=True)
class SearchResult:
    source: str
    case_no: str
    summary: str
    category: str
    year_be: int | None
    url: str


@dataclass(frozen=True)
class SourceConfig:
    name: str
    base_url: str
    direct_search_url: str | None = None
    search_input_selectors: tuple[str, ...] = ()
    submit_selectors: tuple[str, ...] = ()
    result_selectors: tuple[str, ...] = ("a",)
    wait_selector: str | None = None


SOURCE_CONFIGS: tuple[SourceConfig, ...] = (
    SourceConfig(
        name="ThaiDeka",
        base_url="https://deka.in.th",
        direct_search_url="https://deka.in.th/search?q={query}&type=deka",
        result_selectors=('a[href*="/deka/"]',),
        wait_selector='a[href*="/deka/"]',
    ),
    SourceConfig(
        name="Law3S",
        base_url="https://deka.law3s.com",
        search_input_selectors=('input[type="search"]', 'input[name="q"]', 'input[name="keyword"]', "input"),
        submit_selectors=('button[type="submit"]', 'button:has-text("ค้นหา")', 'input[type="submit"]'),
        result_selectors=('a[href*="/deka/"]', 'a[href*="law3s"]', "article a", ".card a"),
    ),
    SourceConfig(
        name="TLSC",
        base_url="https://tlsc.app",
        search_input_selectors=('input[type="search"]', 'input[name="q"]', "input"),
        submit_selectors=('button[type="submit"]', 'button:has-text("ค้น")', 'input[type="submit"]'),
        result_selectors=("a", "article a", ".result a"),
    ),
)


def normalize_text(value: str | None) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def extract_case_no(text: str) -> str:
    match = re.search(r"\d{1,6}\s*/\s*(?:24|25)\d{2}", text)
    return match.group(0).replace(" ", "") if match else ""


def extract_year_be(case_no: str, text: str = "") -> int | None:
    match = re.search(r"(?:24|25)\d{2}", f"{case_no} {text}")
    return int(match.group(0)) if match else None


def infer_category(text: str) -> str:
    rules = {
        "อาญา": ("ลักทรัพย์", "ฉ้อโกง", "ยักยอก", "ฆ่า", "ทำร้าย", "จำคุก"),
        "แพ่ง": ("หนี้", "ละเมิด", "สัญญา", "เงินกู้", "ค่าเสียหาย", "จำนอง", "ขายฝาก"),
        "พาณิชย์": ("หุ้น", "บริษัท", "เช็ค", "ตั๋วเงิน", "ล้มละลาย"),
        "แรงงาน": ("เลิกจ้าง", "ค่าชดเชย", "นายจ้าง", "ลูกจ้าง"),
        "ปกครอง": ("หน่วยงานรัฐ", "คำสั่งทางปกครอง", "ราชการ"),
        "ครอบครัว": ("สมรส", "หย่า", "บุตร", "มรดก", "สินสมรส"),
    }
    for category, keywords in rules.items():
        if any(keyword in text for keyword in keywords):
            return category
    return "ไม่ระบุ"


def first_visible_selector(page: Page, selectors: Iterable[str], timeout_ms: int) -> str | None:
    for selector in selectors:
        try:
            page.wait_for_selector(selector, timeout=timeout_ms, state="visible")
            return selector
        except PlaywrightTimeoutError:
            continue
    return None


def safe_text(locator, selector: str) -> str:
    try:
        child = locator.locator(selector).first
        if child.count():
            return normalize_text(child.inner_text(timeout=800))
    except Exception:
        return ""
    return ""


def parse_result_card(source: SourceConfig, locator) -> SearchResult | None:
    try:
        title = safe_text(locator, ".font-semibold") or safe_text(locator, "h1,h2,h3,h4") or normalize_text(
            locator.inner_text(timeout=1500)
        )
        summary = safe_text(locator, "p") or title
        href = locator.get_attribute("href") or ""

        if href.startswith("/"):
            href = f"{source.base_url}{href}"
        elif href and not href.startswith("http"):
            href = f"{source.base_url.rstrip('/')}/{href.lstrip('/')}"

        combined = normalize_text(f"{title} {summary}")
        case_no = safe_text(locator, ".deka-number") or extract_case_no(combined)
        if not combined or not href:
            return None

        return SearchResult(
            source=source.name,
            case_no=case_no,
            summary=summary[:900],
            category=infer_category(combined),
            year_be=extract_year_be(case_no, combined),
            url=href,
        )
    except Exception:
        return None


def open_source_page(page: Page, source: SourceConfig, keyword: str, timeout_ms: int) -> None:
    if source.direct_search_url:
        page.goto(source.direct_search_url.format(query=quote_plus(keyword)), wait_until="domcontentloaded", timeout=timeout_ms)
        return

    page.goto(source.base_url, wait_until="domcontentloaded", timeout=timeout_ms)
    input_selector = first_visible_selector(page, source.search_input_selectors, timeout_ms=3500)
    if not input_selector:
        raise RuntimeError(f"ไม่พบช่องค้นหาของ {source.name}")

    page.locator(input_selector).first.fill(keyword, timeout=timeout_ms)
    submit_selector = first_visible_selector(page, source.submit_selectors, timeout_ms=2500)
    if submit_selector:
        page.locator(submit_selector).first.click(timeout=timeout_ms)
    else:
        page.locator(input_selector).first.press("Enter", timeout=timeout_ms)
    page.wait_for_load_state("networkidle", timeout=timeout_ms)


def scrape_source(
    browser: Browser,
    source: SourceConfig,
    keyword: str,
    max_results: int = 10,
    timeout_ms: int = 15000,
) -> tuple[list[SearchResult], str | None]:
    context = browser.new_context(
        user_agent=DEFAULT_USER_AGENT,
        locale="th-TH",
        timezone_id="Asia/Bangkok",
        viewport={"width": 1366, "height": 900},
    )
    page = context.new_page()
    page.set_default_timeout(timeout_ms)

    try:
        open_source_page(page, source, keyword, timeout_ms)
        if source.wait_selector:
            try:
                page.wait_for_selector(source.wait_selector, timeout=timeout_ms)
            except PlaywrightTimeoutError:
                pass

        results: list[SearchResult] = []
        for selector in source.result_selectors:
            for locator in page.locator(selector).all()[: max_results * 3]:
                item = parse_result_card(source, locator)
                if item and item.url not in {result.url for result in results}:
                    results.append(item)
                if len(results) >= max_results:
                    break
            if results:
                break

        return results, None
    except Exception as exc:
        return [], f"{source.name}: {exc}"
    finally:
        context.close()


def scrape_all_sources(
    keyword: str,
    selected_sources: list[str] | None = None,
    max_results_per_source: int = 10,
    timeout_ms: int = 15000,
    delay_seconds: float = 0.7,
) -> tuple[list[SearchResult], list[str]]:
    selected = set(selected_sources or [source.name for source in SOURCE_CONFIGS])
    sources = [source for source in SOURCE_CONFIGS if source.name in selected]
    all_results: list[SearchResult] = []
    errors: list[str] = []

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            for source in sources:
                results, error = scrape_source(browser, source, keyword, max_results_per_source, timeout_ms)
                all_results.extend(results)
                if error:
                    errors.append(error)
                time.sleep(delay_seconds)
        finally:
            browser.close()

    return deduplicate_results(all_results), errors


def deduplicate_results(results: list[SearchResult]) -> list[SearchResult]:
    seen: set[str] = set()
    unique: list[SearchResult] = []
    for result in results:
        key = result.url or f"{result.source}:{result.case_no}:{result.summary[:60]}"
        if key in seen:
            continue
        seen.add(key)
        unique.append(result)
    return unique


def results_to_dataframe(results: list[SearchResult]) -> pd.DataFrame:
    rows = [result.__dict__ for result in results]
    return pd.DataFrame(rows, columns=["source", "case_no", "summary", "category", "year_be", "url"])


def load_into_memory_sqlite(df: pd.DataFrame) -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:")
    df.to_sql("precedents", conn, index=False, if_exists="replace")
    return conn


def filter_results(conn: sqlite3.Connection, year_be: int | None, category: str | None) -> pd.DataFrame:
    sql = "SELECT * FROM precedents WHERE 1=1"
    params: list[object] = []

    if year_be:
        sql += " AND year_be = ?"
        params.append(year_be)
    if category and category != "ทั้งหมด":
        sql += " AND category = ?"
        params.append(category)

    return pd.read_sql_query(sql, conn, params=params)
