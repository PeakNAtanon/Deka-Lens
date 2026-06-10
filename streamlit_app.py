from __future__ import annotations

from html import escape

import pandas as pd
import streamlit as st

from scraper_backend import (
    SOURCE_CONFIGS,
    filter_results,
    load_into_memory_sqlite,
    results_to_dataframe,
    scrape_all_sources,
)


st.set_page_config(page_title="Deka Lens", layout="wide")


def empty_dataframe() -> pd.DataFrame:
    return pd.DataFrame(columns=["source", "case_no", "summary", "category", "year_be", "url"])


@st.cache_data(show_spinner=False, ttl=60 * 30)
def cached_search(keyword: str, sources: tuple[str, ...], max_results: int, timeout_ms: int) -> tuple[pd.DataFrame, list[str]]:
    results, errors = scrape_all_sources(
        keyword=keyword,
        selected_sources=list(sources),
        max_results_per_source=max_results,
        timeout_ms=timeout_ms,
    )
    return results_to_dataframe(results), errors


st.markdown(
    """
    <style>
    .main .block-container { max-width: 1080px; padding-top: 4rem; }
    .search-title { text-align: center; font-size: 2.4rem; font-weight: 800; margin-bottom: .25rem; }
    .search-subtitle { text-align: center; color: #52616f; margin-bottom: 1.5rem; }
    .result-card { border: 1px solid #dbe3e8; border-radius: 10px; padding: 1rem; margin-bottom: .75rem; background: #fff; }
    .result-meta { color: #52616f; font-size: .9rem; margin-bottom: .35rem; }
    .result-title { font-weight: 800; color: #0d4f4b; }
    </style>
    """,
    unsafe_allow_html=True,
)

st.markdown('<div class="search-title">Deka Lens</div>', unsafe_allow_html=True)
st.markdown('<div class="search-subtitle">ค้นคำพิพากษาฎีกาจากหลายแหล่งในหน้าเดียว</div>', unsafe_allow_html=True)

with st.sidebar:
    st.header("ตัวกรอง")

    source_names = [source.name for source in SOURCE_CONFIGS]
    selected_sources = st.multiselect("แหล่งข้อมูล", options=source_names, default=source_names)
    year_filter_text = st.text_input("ปี พ.ศ.", placeholder="เช่น 2567")
    category_filter = st.selectbox("ประเภทคดี", ["ทั้งหมด", "แพ่ง", "อาญา", "พาณิชย์", "แรงงาน", "ปกครอง", "ครอบครัว", "ไม่ระบุ"])

    st.divider()
    max_results = st.slider("จำนวนผลต่อแหล่ง", min_value=3, max_value=20, value=10)
    timeout_ms = st.slider("Timeout ต่อเว็บ (วินาที)", min_value=8, max_value=40, value=15) * 1000

keyword = st.text_input(
    "คำค้นหา",
    placeholder='เช่น "ลักทรัพย์ในเวลากลางคืน", "ผิดสัญญาเช่า", "เงินกู้ ดอกเบี้ยเกินอัตรา"',
    label_visibility="collapsed",
)

search_clicked = st.button("ค้นหา", type="primary", use_container_width=True)

if "last_df" not in st.session_state:
    st.session_state.last_df = empty_dataframe()
if "last_errors" not in st.session_state:
    st.session_state.last_errors = []

if search_clicked:
    if not keyword.strip():
        st.warning("กรุณาพิมพ์คำค้นหาก่อน")
    elif not selected_sources:
        st.warning("กรุณาเลือกแหล่งข้อมูลอย่างน้อย 1 แหล่ง")
    else:
        with st.spinner("กำลังค้นจากหลายแหล่ง โปรดรอสักครู่..."):
            df, errors = cached_search(keyword.strip(), tuple(selected_sources), max_results, timeout_ms)
            st.session_state.last_df = df
            st.session_state.last_errors = errors

df = st.session_state.last_df
errors = st.session_state.last_errors

if errors:
    with st.expander("แหล่งที่ค้นไม่สำเร็จ"):
        for error in errors:
            st.write(f"- {error}")

if df.empty:
    st.info("ยังไม่มีผลลัพธ์ พิมพ์คำค้นหาแล้วกดค้นหา")
else:
    conn = load_into_memory_sqlite(df)
    filtered_df = filter_results(
        conn=conn,
        year_be=int(year_filter_text) if year_filter_text.strip().isdigit() else None,
        category=category_filter,
    )

    st.caption(f"พบ {len(filtered_df)} รายการจาก {df['source'].nunique()} แหล่ง")

    for row in filtered_df.to_dict("records"):
        case_no = escape(str(row.get("case_no") or "ไม่พบเลขฎีกา"))
        category = escape(str(row.get("category") or "ไม่ระบุ"))
        year_be = int(row["year_be"]) if pd.notna(row.get("year_be")) else "-"
        source = escape(str(row.get("source") or "-"))
        summary = escape(str(row.get("summary") or "ไม่มีคำพิพากษาย่อในผลค้น"))
        url = escape(str(row.get("url") or "#"), quote=True)

        st.markdown(
            f"""
            <div class="result-card">
              <div class="result-meta">{source} · {category} · ปี {year_be}</div>
              <div class="result-title">ฎีกาที่ {case_no}</div>
              <p>{summary}</p>
              <a href="{url}" target="_blank" rel="noreferrer">เปิดต้นทาง</a>
            </div>
            """,
            unsafe_allow_html=True,
        )

    with st.expander("ดูแบบตาราง"):
        st.dataframe(filtered_df, use_container_width=True, hide_index=True)
