"use client";

import { useEffect, useMemo, useState } from "react";
import { apiSourceNames, buildExternalUrl, externalSources, sourceModeLabel, type SearchResult } from "@/lib/search";

type Note = {
  caseNo: string;
  point: string;
};

type SearchSnapshot = {
  keyword: string;
  at: string;
};

const NOTES_STORAGE_KEY = "deka-next-notes";
const RECENT_SEARCHES_STORAGE_KEY = "deka-next-recent-searches";

function readStoredJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    window.localStorage.removeItem(key);
    return fallback;
  }
}

function writeStoredJson<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function isNote(item: unknown): item is Note {
  return !!item && typeof item === "object" && typeof (item as Note).caseNo === "string" && typeof (item as Note).point === "string";
}

function isSearchSnapshot(item: unknown): item is SearchSnapshot {
  return (
    !!item &&
    typeof item === "object" &&
    typeof (item as SearchSnapshot).keyword === "string" &&
    typeof (item as SearchSnapshot).at === "string"
  );
}

function buildSearchStatus(resultCount: number, selectedApiSourceCount: number, hasManualFallback: boolean) {
  if (resultCount > 0) {
    return `พบ ${resultCount} รายการจากแหล่งอัตโนมัติ ${selectedApiSourceCount} แหล่ง`;
  }

  if (hasManualFallback) {
    return "ยังไม่พบผลจาก API, เลื่อนลงไปค้นต่อจากแหล่งอื่นได้ทันที";
  }

  return "ยังไม่พบผลจาก API สำหรับคำค้นนี้";
}

const categoryOptions = ["ทั้งหมด", "แพ่ง", "อาญา", "พาณิชย์", "แรงงาน", "ปกครอง", "ครอบครัว", "ไม่ระบุ"];

const exampleQueries = [
  "ค่าตอบแทน ขยายระยะเวลาชำระหนี้ เงินกู้",
  "ดอกเบี้ยเกินอัตรา สัญญากู้ยืมเงิน",
  "เบี้ยปรับ เงินกู้ ลดเบี้ยปรับ",
  "แปลงหนี้ใหม่ ขยายเวลาชำระหนี้"
];

const defaultSources = externalSources.map((source) => source.name);
const manualSources = externalSources.filter((source) => source.mode === "manual");
const automaticSources = externalSources.filter((source) => source.mode === "api");

const pageStyles = `
  :root {
    color-scheme: dark;
    --dl-bg: #212121;
    --dl-bg-soft: #252525;
    --dl-surface: #2b2b2b;
    --dl-surface-raised: #333333;
    --dl-surface-hover: #3b3b3b;
    --dl-border: #4a4a4a;
    --dl-border-strong: #ffc107;
    --dl-text: #ffffff;
    --dl-muted: #d6d6d6;
    --dl-subtle: #a8a8a8;
    --dl-accent: #ffc107;
    --dl-accent-strong: #ffd45a;
    --dl-accent-ink: #212121;
    --dl-warning-bg: #332b16;
    --dl-warning-border: #ffc107;
    --dl-warning-text: #ffd96a;
  }

  * {
    box-sizing: border-box;
  }

  @keyframes dl-rise {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes dl-pulse {
    0% {
      background-position: 140% 0;
    }
    100% {
      background-position: -140% 0;
    }
  }

  @keyframes dl-title-sheen {
    0% {
      transform: translateX(-18%) scaleX(0.92);
      opacity: 0;
    }
    20% {
      opacity: 1;
    }
    55% {
      opacity: 0.72;
    }
    100% {
      transform: translateX(20%) scaleX(1.04);
      opacity: 0;
    }
  }

  @keyframes dl-title-float {
    0%, 100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-2px);
    }
  }

  body {
    margin: 0;
    background: var(--dl-bg);
    color: var(--dl-text);
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  button,
  input,
  select,
  textarea {
    font: inherit;
  }

  button,
  a,
  input,
  select {
    transition:
      transform 180ms cubic-bezier(.22, 1, .36, 1),
      border-color 180ms cubic-bezier(.22, 1, .36, 1),
      background 180ms cubic-bezier(.22, 1, .36, 1),
      color 180ms cubic-bezier(.22, 1, .36, 1),
      box-shadow 180ms cubic-bezier(.22, 1, .36, 1);
  }

  button:focus-visible,
  a:focus-visible,
  input:focus-visible,
  select:focus-visible,
  summary:focus-visible {
    outline: 2px solid var(--dl-accent);
    outline-offset: 3px;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .dl-page {
    min-height: 100vh;
    background:
      radial-gradient(circle at 18% -10%, rgb(255 193 7 / 0.16), transparent 34%),
      linear-gradient(180deg, var(--dl-bg-soft), var(--dl-bg));
  }

  .dl-shell {
    width: min(1120px, calc(100% - 32px));
    margin: 0 auto;
    padding: 44px 0 56px;
  }

  .dl-hero {
    max-width: 760px;
    margin: 0 auto;
    text-align: center;
    animation: dl-rise 360ms cubic-bezier(.22, 1, .36, 1) both;
  }

  .dl-hero-copy {
    min-width: 0;
  }

  .dl-hero-facts {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 10px;
    margin-top: 18px;
  }

  .dl-hero-pill {
    display: inline-flex;
    align-items: center;
    min-height: 38px;
    border: 1px solid var(--dl-border);
    border-radius: 999px;
    background: rgb(255 255 255 / 0.03);
    padding: 0 14px;
    color: var(--dl-muted);
    font-size: 13px;
    font-weight: 800;
  }

  .dl-title {
    margin: 0;
    color: var(--dl-text);
    font-size: clamp(36px, 6vw, 56px);
    font-weight: 850;
    line-height: 1.04;
    letter-spacing: 0;
    display: inline-flex;
    align-items: center;
    gap: 14px;
    position: relative;
    padding: 0 8px 12px;
    isolation: isolate;
    text-wrap: balance;
  }

  .dl-title::after {
    content: "";
    position: absolute;
    left: 8px;
    right: 8px;
    bottom: 0;
    height: 14px;
    border-radius: 999px;
    background: linear-gradient(90deg, rgb(255 193 7 / 0.04), rgb(255 193 7 / 0.28), rgb(255 193 7 / 0.04));
    filter: blur(10px);
    z-index: -2;
  }

  .dl-title-badge {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 56px;
    height: 56px;
    border: 1px solid rgb(255 193 7 / 0.34);
    border-radius: 16px;
    background:
      linear-gradient(180deg, rgb(255 255 255 / 0.08), rgb(255 255 255 / 0.02)),
      linear-gradient(135deg, rgb(255 193 7 / 0.3), rgb(255 193 7 / 0.08));
    box-shadow:
      inset 0 1px 0 rgb(255 255 255 / 0.12),
      0 10px 28px rgb(0 0 0 / 0.22);
    animation: dl-title-float 3.8s ease-in-out infinite;
    overflow: hidden;
  }

  .dl-title-badge img {
    position: relative;
    z-index: 1;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .dl-title-badge::after {
    content: "";
    position: absolute;
    inset: -12px;
    background: linear-gradient(110deg, transparent 24%, rgb(255 255 255 / 0.34) 46%, transparent 66%);
    animation: dl-title-sheen 4.8s ease-in-out infinite;
  }

  .dl-title-copy {
    display: inline-grid;
    gap: 2px;
    text-align: left;
  }

  .dl-title-wordmark {
    display: inline-flex;
    align-items: baseline;
    gap: 10px;
    flex-wrap: wrap;
  }

  .dl-title-deka {
    color: var(--dl-text);
  }

  .dl-title-lens {
    color: var(--dl-accent);
    text-shadow: 0 0 24px rgb(255 193 7 / 0.12);
  }

  .dl-title-kicker {
    color: var(--dl-subtle);
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.08em;
  }

  .dl-subtitle {
    max-width: 62ch;
    margin: 14px auto 0;
    color: var(--dl-muted);
    font-size: 16px;
    line-height: 1.7;
  }

  .dl-search-area {
    margin-top: 28px;
    animation: dl-rise 420ms cubic-bezier(.22, 1, .36, 1) 80ms both;
  }

  .dl-search-box {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
    border: 1px solid var(--dl-border);
    border-radius: 14px;
    background: var(--dl-surface);
    box-shadow: 0 0 0 1px rgb(255 193 7 / 0.05);
  }

  .dl-search-box:focus-within {
    border-color: var(--dl-border-strong);
    box-shadow: 0 0 0 4px rgb(255 193 7 / 0.14);
  }

  .dl-search-input {
    min-width: 0;
    flex: 1;
    min-height: 54px;
    border: 0;
    border-radius: 10px;
    padding: 0 14px;
    outline: none;
    color: var(--dl-text);
    background: var(--dl-surface-raised);
    font-size: 16px;
  }

  .dl-search-input::placeholder {
    color: var(--dl-subtle);
  }

  .dl-search-input:focus {
    box-shadow: inset 0 0 0 2px var(--dl-accent);
  }

  .dl-primary-button,
  .dl-secondary-button {
    min-height: 44px;
    border-radius: 10px;
    border: 1px solid transparent;
    padding: 0 18px;
    cursor: pointer;
    font-weight: 800;
    transition: border-color 160ms ease, background 160ms ease, color 160ms ease;
  }

  .dl-primary-button {
    min-width: 112px;
    background: var(--dl-accent);
    color: var(--dl-accent-ink);
  }

  .dl-primary-button:hover {
    background: var(--dl-accent-strong);
    transform: translateY(-1px);
  }

  .dl-primary-button:disabled {
    cursor: wait;
    opacity: 0.68;
  }

  .dl-secondary-button {
    background: var(--dl-surface-raised);
    border-color: var(--dl-border);
    color: var(--dl-text);
  }

  .dl-secondary-button:hover {
    border-color: var(--dl-accent);
    color: var(--dl-accent);
    transform: translateY(-1px);
  }

  .dl-examples {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
    margin-top: 12px;
  }

  .dl-chip {
    border: 1px solid var(--dl-border);
    border-radius: 999px;
    background: var(--dl-surface);
    color: var(--dl-muted);
    min-height: 38px;
    padding: 7px 12px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 700;
  }

  .dl-chip:hover {
    border-color: var(--dl-accent);
    color: var(--dl-accent);
    transform: translateY(-1px);
  }

  .dl-workspace {
    display: grid;
    grid-template-columns: 260px minmax(0, 1fr);
    gap: 24px;
    margin-top: 34px;
    animation: dl-rise 440ms cubic-bezier(.22, 1, .36, 1) 140ms both;
  }

  .dl-panel {
    border: 1px solid var(--dl-border);
    border-radius: 14px;
    background: var(--dl-surface);
  }

  .dl-panel:hover {
    border-color: rgb(255 193 7 / 0.72);
  }

  .dl-sidebar {
    align-self: start;
    padding: 18px;
  }

  .dl-sidebar-fields {
    display: grid;
    gap: 0;
  }

  .dl-panel-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin: 0;
    color: var(--dl-text);
    font-size: 18px;
    font-weight: 850;
  }

  .dl-count {
    color: var(--dl-muted);
    font-size: 13px;
    font-weight: 800;
  }

  .dl-filter-group {
    margin-top: 20px;
  }

  .dl-label {
    display: grid;
    gap: 8px;
    color: var(--dl-muted);
    font-size: 14px;
    font-weight: 800;
  }

  .dl-source-list {
    display: grid;
    gap: 3px;
    margin-top: 8px;
  }

  .dl-source {
    display: flex;
    align-items: center;
    gap: 9px;
    min-height: 38px;
    border-radius: 8px;
    padding: 6px 8px;
    color: var(--dl-text);
    font-size: 14px;
    font-weight: 700;
  }

  .dl-source:hover {
    background: var(--dl-surface-hover);
    transform: translateX(2px);
  }

  .dl-checkbox {
    width: 16px;
    height: 16px;
    accent-color: var(--dl-accent);
  }

  .dl-field {
    width: 100%;
    min-height: 40px;
    border: 1px solid var(--dl-border);
    border-radius: 10px;
    background: var(--dl-surface-raised);
    color: var(--dl-text);
    padding: 0 11px;
    outline: none;
  }

  .dl-field:focus {
    border-color: var(--dl-accent);
  }

  .dl-range {
    width: 100%;
    accent-color: var(--dl-accent);
  }

  .dl-details {
    margin-top: 20px;
    border-top: 1px solid var(--dl-border);
    padding-top: 16px;
  }

  .dl-summary {
    cursor: pointer;
    color: var(--dl-text);
    font-weight: 850;
  }

  .dl-textarea {
    width: 100%;
    min-height: 92px;
    margin-top: 12px;
    border: 1px solid var(--dl-border);
    border-radius: 10px;
    padding: 10px 11px;
    color: var(--dl-text);
    background: var(--dl-surface-raised);
    outline: none;
    resize: vertical;
  }

  .dl-main {
    min-width: 0;
  }

  .dl-results-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .dl-results-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    border-bottom: 1px solid var(--dl-border);
    padding-bottom: 16px;
  }

  .dl-results-title {
    margin: 0;
    color: var(--dl-text);
    font-size: 24px;
    font-weight: 850;
    line-height: 1.25;
  }

  .dl-status {
    margin: 5px 0 0;
    color: var(--dl-muted);
    font-size: 14px;
    line-height: 1.6;
  }

  .dl-alert {
    margin-top: 16px;
    border: 1px solid var(--dl-warning-border);
    border-radius: 12px;
    background: var(--dl-warning-bg);
    padding: 12px 14px;
    color: var(--dl-warning-text);
    font-size: 14px;
  }

  .dl-result-list {
    display: grid;
    gap: 12px;
    margin-top: 16px;
  }

  .dl-skeleton-list {
    display: grid;
    gap: 12px;
    margin-top: 16px;
  }

  .dl-skeleton {
    border: 1px solid var(--dl-border);
    border-radius: 14px;
    background: var(--dl-surface);
    padding: 18px;
  }

  .dl-skeleton-line {
    height: 12px;
    border-radius: 999px;
    background: linear-gradient(90deg, var(--dl-surface-raised), var(--dl-surface-hover), var(--dl-surface-raised));
    background-size: 240% 100%;
    animation: dl-pulse 1.15s linear infinite;
  }

  .dl-skeleton-line + .dl-skeleton-line {
    margin-top: 12px;
  }

  .dl-skeleton-line.short {
    width: 34%;
  }

  .dl-skeleton-line.medium {
    width: 58%;
  }

  .dl-skeleton-line.long {
    width: 92%;
  }

  .dl-empty {
    border: 1px dashed var(--dl-border);
    border-radius: 14px;
    background: var(--dl-surface);
    padding: 34px 20px;
    color: var(--dl-muted);
    text-align: center;
    line-height: 1.7;
  }

  .dl-card {
    border: 1px solid var(--dl-border);
    border-radius: 14px;
    background: var(--dl-surface);
    padding: 18px;
    animation: dl-rise 260ms cubic-bezier(.22, 1, .36, 1) both;
    transform-origin: center top;
  }

  .dl-card:hover {
    border-color: var(--dl-border-strong);
    background: var(--dl-surface-raised);
    transform: translateY(-2px);
  }

  .dl-card-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }

  .dl-meta {
    margin: 0;
    color: var(--dl-muted);
    font-size: 14px;
    line-height: 1.5;
  }

  .dl-case-title {
    margin: 5px 0 0;
    color: var(--dl-accent);
    font-size: 19px;
    font-weight: 850;
    line-height: 1.35;
  }

  .dl-link-button {
    border: 0;
    background: transparent;
    color: var(--dl-accent);
    cursor: pointer;
    padding: 0;
    white-space: nowrap;
    font-size: 14px;
    font-weight: 850;
  }

  .dl-link-button:hover {
    color: var(--dl-accent-strong);
    transform: translateY(-1px);
  }

  .dl-summary-text {
    max-width: 74ch;
    margin: 12px 0 0;
    color: var(--dl-text);
    line-height: 1.75;
  }

  .dl-source-link {
    display: inline-flex;
    margin-top: 12px;
    color: var(--dl-accent);
    font-size: 14px;
    font-weight: 850;
    text-underline-offset: 4px;
  }

  .dl-fold-panel {
    margin-top: 18px;
    padding: 16px;
    animation: dl-rise 220ms cubic-bezier(.22, 1, .36, 1) both;
  }

  .dl-table-wrap {
    margin-top: 12px;
    overflow-x: auto;
  }

  .dl-table {
    width: 100%;
    min-width: 720px;
    border-collapse: collapse;
    text-align: left;
    font-size: 14px;
  }

  .dl-table th {
    background: var(--dl-surface-raised);
    color: var(--dl-muted);
  }

  .dl-table th,
  .dl-table td {
    border-bottom: 1px solid var(--dl-border);
    padding: 9px 10px;
    vertical-align: top;
  }

  .dl-table tbody tr:hover {
    background: var(--dl-surface-raised);
  }

  .dl-manual-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 10px;
    margin-top: 12px;
  }

  .dl-manual-link {
    display: block;
    border: 1px solid var(--dl-border);
    border-radius: 10px;
    padding: 11px 12px;
    color: var(--dl-text);
    text-decoration: none;
    background: var(--dl-surface-raised);
  }

  .dl-manual-link:hover {
    border-color: var(--dl-accent);
    background: var(--dl-surface-hover);
    transform: translateY(-2px);
  }

  .dl-manual-name {
    display: block;
    font-weight: 850;
  }

  .dl-manual-detail {
    display: block;
    margin-top: 4px;
    color: var(--dl-muted);
    font-size: 14px;
    line-height: 1.55;
  }

  .dl-notes {
    margin-top: 24px;
    padding: 18px;
    animation: dl-rise 420ms cubic-bezier(.22, 1, .36, 1) 220ms both;
  }

  .dl-note-list {
    display: grid;
    gap: 10px;
    margin-top: 14px;
  }

  .dl-note {
    display: grid;
    grid-template-columns: 160px minmax(0, 1fr) auto;
    gap: 12px;
    align-items: start;
    border: 1px solid var(--dl-border);
    border-radius: 10px;
    padding: 12px;
    background: var(--dl-surface-raised);
    animation: dl-rise 220ms cubic-bezier(.22, 1, .36, 1) both;
  }

  .dl-note strong {
    color: var(--dl-accent);
  }

  .dl-note span {
    color: var(--dl-muted);
    font-size: 14px;
    line-height: 1.6;
  }

  .dl-remove {
    border: 0;
    background: transparent;
    color: var(--dl-muted);
    cursor: pointer;
    font-weight: 850;
  }

  .dl-remove:hover {
    color: var(--dl-text);
  }

  @media (max-width: 860px) {
    .dl-shell {
      width: min(100% - 24px, 1120px);
      padding-top: 28px;
    }

    .dl-workspace {
      grid-template-columns: 1fr;
    }

    .dl-sidebar {
      order: 2;
    }

    .dl-sidebar-fields {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0 14px;
    }

    .dl-main {
      order: 1;
    }
  }

  @media (max-width: 620px) {
    .dl-title {
      gap: 12px;
      justify-content: center;
      padding-bottom: 10px;
    }

    .dl-title-copy,
    .dl-title-wordmark {
      justify-content: center;
      text-align: center;
    }

    .dl-search-box,
    .dl-results-header,
    .dl-card-top {
      flex-direction: column;
    }

    .dl-sidebar-fields {
      grid-template-columns: 1fr;
    }

    .dl-primary-button,
    .dl-secondary-button {
      width: 100%;
    }

    .dl-results-actions {
      width: 100%;
    }

    .dl-note {
      grid-template-columns: 1fr;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 1ms !important;
      animation-iteration-count: 1 !important;
      scroll-behavior: auto !important;
      transition-duration: 1ms !important;
    }

    .dl-card:hover,
    .dl-chip:hover,
    .dl-primary-button:hover,
    .dl-secondary-button:hover,
    .dl-manual-link:hover,
    .dl-source:hover {
      transform: none;
    }
  }
`;

export default function Page() {
  const [keyword, setKeyword] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ทั้งหมด");
  const [selectedSources, setSelectedSources] = useState<string[]>(defaultSources);
  const [maxResults, setMaxResults] = useState(30);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [recentSearches, setRecentSearches] = useState<SearchSnapshot[]>([]);
  const [status, setStatus] = useState("พร้อมค้นหา");
  const [loading, setLoading] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);

  useEffect(() => {
    const storedNotes = readStoredJson<unknown>(NOTES_STORAGE_KEY, []);
    const safeNotes = Array.isArray(storedNotes) ? storedNotes.filter(isNote) : [];
    setNotes(safeNotes);

    const storedRecent = readStoredJson<unknown>(RECENT_SEARCHES_STORAGE_KEY, []);
    const safeRecent = Array.isArray(storedRecent) ? storedRecent.filter(isSearchSnapshot) : [];
    setRecentSearches(safeRecent);
  }, []);

  useEffect(() => {
    writeStoredJson(NOTES_STORAGE_KEY, notes);
  }, [notes]);

  useEffect(() => {
    writeStoredJson(RECENT_SEARCHES_STORAGE_KEY, recentSearches);
  }, [recentSearches]);

  const query = keyword.trim();
  const visibleExternalSources = useMemo(
    () => externalSources.filter((source) => selectedSources.includes(source.name)),
    [selectedSources]
  );
  const visibleManualSources = useMemo(
    () => visibleExternalSources.filter((source) => source.mode === "manual"),
    [visibleExternalSources]
  );
  const selectedApiSources = useMemo(
    () => selectedSources.filter((source) => apiSourceNames.includes(source)),
    [selectedSources]
  );

  const filteredResults = useMemo(() => {
    const year = yearFilter.trim();

    return results
      .filter((result) => selectedSources.includes(result.source))
      .filter((result) => (year ? String(result.yearBe ?? "").includes(year) || result.caseNo.includes(year) : true))
      .filter((result) => (categoryFilter === "ทั้งหมด" ? true : result.category === categoryFilter))
      .slice(0, maxResults);
  }, [categoryFilter, maxResults, results, selectedSources, yearFilter]);

  async function search() {
    if (!query) {
      setStatus("กรุณาพิมพ์คำค้นหาก่อน");
      return;
    }

    if (selectedSources.length === 0) {
      setStatus("กรุณาเลือกแหล่งข้อมูลอย่างน้อย 1 แหล่ง");
      return;
    }

    setLoading(true);
    setErrors([]);
    setStatus("กำลังค้นหา...");

    try {
      const nextResults: SearchResult[] = [];
      const nextErrors: string[] = [];
      const params = new URLSearchParams({ q: query });
      params.set("sources", selectedApiSources.join(","));
      const response = await fetch(`/api/search?${params.toString()}`);
      const payload = (await response.json()) as { results?: SearchResult[]; errors?: string[]; error?: string };

      if (!response.ok) {
        throw new Error(payload.errors?.[0] ?? payload.error ?? "ค้นผ่าน API ไม่สำเร็จ");
      }

      nextResults.push(...(payload.results ?? []));
      nextErrors.push(...(payload.errors ?? []));
      if (payload.error) nextErrors.push(payload.error);

      setResults(nextResults);
      setErrors(nextErrors);
      setRecentSearches((current) => {
        const next = [{ keyword: query, at: new Date().toISOString() }, ...current.filter((item) => item.keyword !== query)];
        return next.slice(0, 8);
      });
      if (nextResults.length === 0 && visibleManualSources.length > 0) {
        setManualOpen(true);
      }
      setStatus(buildSearchStatus(nextResults.length, selectedApiSources.length, visibleManualSources.length > 0));
    } catch {
      setResults([]);
      setErrors(["ค้นผ่าน API ไม่สำเร็จ"]);
      if (visibleManualSources.length > 0) setManualOpen(true);
      setStatus("ค้นผ่าน API ไม่สำเร็จ ให้ค้นต่อจากแหล่งอื่นด้านล่าง");
    } finally {
      setLoading(false);
    }
  }

  function openAllSources() {
    if (manualOpen) {
      setManualOpen(false);
      setStatus("หดแหล่งค้นด้วยมือแล้ว");
      return;
    }

    if (!query) {
      setStatus("กรุณาพิมพ์คำค้นหาก่อนเปิดแหล่งค้น");
      return;
    }

    setStatus("เลือกเปิดแหล่งค้นจากรายการด้านล่าง");
    setManualOpen(true);
  }

  function toggleSource(sourceName: string) {
    setSelectedSources((current) =>
      current.includes(sourceName) ? current.filter((item) => item !== sourceName) : [...current, sourceName]
    );
  }

  function addNote(result: SearchResult) {
    setNotes((current) => [
      {
        caseNo: result.caseNo || result.title,
        point: `${result.summary} (${result.url})`
      },
      ...current
    ]);
  }

  function openSelectedSourcesInTabs() {
    if (!query) {
      setStatus("กรุณาพิมพ์คำค้นหาก่อนเปิดหลายแหล่ง");
      return;
    }

    if (visibleExternalSources.length === 0) {
      setStatus("ยังไม่มีแหล่งข้อมูลที่เลือกไว้");
      return;
    }

    visibleExternalSources.forEach((source) => {
      window.open(buildExternalUrl(source.template, query), "_blank", "noopener,noreferrer");
    });
    setStatus(`เปิดค้นต่อ ${visibleExternalSources.length} แหล่งแล้ว`);
  }

  return (
    <main className="dl-page">
      <style>{pageStyles}</style>
      <div className="dl-shell">
        <header className="dl-hero">
          <div className="dl-hero-copy">
            <h1 className="dl-title">
              <span className="dl-title-badge" aria-hidden="true">
                <img src="/deka-lens-emblem.png" alt="" />
              </span>
              <span className="dl-title-copy">
                <span className="dl-title-kicker">LEGAL SEARCH DESK</span>
                <span className="dl-title-wordmark">
                  <span className="dl-title-deka">Deka</span>
                  <span className="dl-title-lens">Lens</span>
                </span>
              </span>
            </h1>
            <p className="dl-subtitle">
              ค้นคำพิพากษาฎีกาในหน้าเดียว, ดึงผลอัตโนมัติจาก {automaticSources.length} แหล่ง และพาค้นต่อจากแหล่งเสริมอีก {manualSources.length} แห่ง
            </p>
            <div className="dl-hero-facts" aria-label="ข้อมูลสรุปการค้นหา">
              <span className="dl-hero-pill">แหล่งอัตโนมัติ {automaticSources.length} แห่ง</span>
              <span className="dl-hero-pill">แหล่งค้นต่อ {manualSources.length} แห่ง</span>
              <span className="dl-hero-pill">เหมาะกับมือถือและ iPad</span>
            </div>
          </div>
        </header>

        <section className="dl-search-area">
          <form
            className="dl-search-box"
            onSubmit={(event) => {
              event.preventDefault();
              void search();
            }}
          >
            <label className="sr-only" htmlFor="main-search">
              คำค้นหา
            </label>
            <input
              id="main-search"
              className="dl-search-input"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void search();
              }}
              placeholder='เช่น "เงินกู้ ดอกเบี้ยเกินอัตรา"'
            />
            <button className="dl-primary-button" type="submit" disabled={loading}>
              {loading ? "กำลังค้น..." : "ค้นหา"}
            </button>
          </form>

          <div className="dl-examples">
            {exampleQueries.map((example) => (
              <button key={example} className="dl-chip" type="button" onClick={() => setKeyword(example)}>
                {example.split(" ").slice(0, 3).join(" ")}
              </button>
            ))}
            {recentSearches.slice(0, 4).map((item) => (
              <button key={`${item.keyword}-${item.at}`} className="dl-chip" type="button" onClick={() => setKeyword(item.keyword)}>
                ล่าสุด: {item.keyword.split(" ").slice(0, 2).join(" ")}
              </button>
            ))}
          </div>
        </section>

        <section className="dl-workspace">
          <aside className="dl-panel dl-sidebar">
            <h2 className="dl-panel-title">
              ตัวกรอง
              <span className="dl-count">{selectedSources.length} แหล่ง</span>
            </h2>

            <div className="dl-sidebar-fields">
              <div className="dl-filter-group">
                <p className="dl-label">แหล่งข้อมูล</p>
                <div className="dl-source-list">
                  {externalSources.map((source) => (
                    <label key={source.name} className="dl-source">
                      <input
                        className="dl-checkbox"
                        type="checkbox"
                        checked={selectedSources.includes(source.name)}
                        onChange={() => toggleSource(source.name)}
                      />
                      <span>
                        {source.name} • {sourceModeLabel[source.mode]}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="dl-filter-group">
                <label className="dl-label" htmlFor="year-filter">
                  ปี พ.ศ.
                  <input
                    id="year-filter"
                    className="dl-field"
                    value={yearFilter}
                    onChange={(event) => setYearFilter(event.target.value)}
                    placeholder="เช่น 2567"
                    inputMode="numeric"
                  />
                </label>
              </div>

              <div className="dl-filter-group">
                <label className="dl-label" htmlFor="category-filter">
                  ประเภทคดี
                  <select id="category-filter" className="dl-field" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                    {categoryOptions.map((category) => (
                      <option key={category}>{category}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="dl-filter-group">
                <label className="dl-label" htmlFor="max-results">
                  จำนวนผลลัพธ์
                  <input
                    id="max-results"
                    className="dl-range"
                    type="range"
                    min={3}
                    max={30}
                    value={maxResults}
                    onChange={(event) => setMaxResults(Number(event.target.value))}
                  />
                  <span>{maxResults} รายการ</span>
                </label>
              </div>
            </div>
          </aside>

          <section className="dl-main">
            <div className="dl-results-header">
              <div>
                <h2 className="dl-results-title">ผลการค้นหา</h2>
                <p className="dl-status">
                  {status}
                  {filteredResults.length > 0 ? `, แสดง ${filteredResults.length} รายการ` : ""}
                </p>
              </div>
              <div className="dl-results-actions">
                <button className="dl-secondary-button" type="button" onClick={openAllSources}>
                  {manualOpen ? "ซ่อนแหล่งค้น" : "แสดงแหล่งค้น"}
                </button>
                <button className="dl-secondary-button" type="button" onClick={openSelectedSourcesInTabs}>
                  เปิดที่เลือกทั้งหมด
                </button>
              </div>
            </div>

            {errors.length > 0 ? (
              <details className="dl-alert">
                <summary className="dl-summary">แหล่งที่ค้นไม่สำเร็จ</summary>
                <ul>
                  {errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </details>
            ) : null}

            {loading ? (
              <div className="dl-skeleton-list" aria-label="กำลังโหลดผลการค้นหา">
                {[0, 1, 2].map((item) => (
                  <div key={item} className="dl-skeleton">
                    <div className="dl-skeleton-line short" />
                    <div className="dl-skeleton-line medium" />
                    <div className="dl-skeleton-line long" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="dl-result-list">
                {filteredResults.length === 0 ? (
                <div className="dl-empty">
                  พิมพ์คำค้นหาแล้วกดค้นหา ผลลัพธ์ที่ดึงอัตโนมัติจะขึ้นตรงนี้
                  <br />
                  ถ้ายังไม่เจอครบ ใช้ส่วน "เปิดค้นด้วยมือ" เพื่อไล่ต่อทุกแหล่งในหน้าเดียว
                </div>
              ) : (
                filteredResults.map((result, index) => (
                  <article
                    key={`${result.source}-${result.caseNo || result.url}-${index}`}
                    className="dl-card"
                    style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
                  >
                    <div className="dl-card-top">
                      <div>
                        <p className="dl-meta">
                          {result.source} · {result.category || "ไม่ระบุ"} · ปี {result.yearBe ?? "-"}
                        </p>
                        <h3 className="dl-case-title">ฎีกาที่ {result.caseNo || "ไม่พบเลขฎีกา"}</h3>
                      </div>
                      <button className="dl-link-button" type="button" onClick={() => addNote(result)}>
                        เพิ่มเข้าโน้ต
                      </button>
                    </div>
                    <p className="dl-summary-text">{result.summary || "ไม่มีคำพิพากษาย่อในผลค้น"}</p>
                    <a href={result.url} target="_blank" rel="noreferrer" className="dl-source-link">
                      เปิดต้นทาง
                    </a>
                  </article>
                ))
              )}
              </div>
            )}

            <details className="dl-panel dl-fold-panel">
              <summary className="dl-summary">ดูแบบตาราง</summary>
              <div className="dl-table-wrap">
                <table className="dl-table">
                  <thead>
                    <tr>
                      <th>แหล่ง</th>
                      <th>เลขฎีกา</th>
                      <th>ประเภท</th>
                      <th>ปี</th>
                      <th>สรุป</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredResults.map((result, index) => (
                      <tr key={`table-${result.source}-${result.caseNo || result.url}-${index}`}>
                        <td>{result.source}</td>
                        <td>
                          <strong>{result.caseNo || "-"}</strong>
                        </td>
                        <td>{result.category || "ไม่ระบุ"}</td>
                        <td>{result.yearBe ?? "-"}</td>
                        <td>{result.summary || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>

            {manualOpen ? (
              <section className="dl-panel dl-fold-panel">
                <div className="dl-panel-title">
                  <span>เปิดค้นด้วยมือ</span>
                  <button className="dl-link-button" type="button" onClick={() => setManualOpen(false)}>
                    หดเข้า
                  </button>
                </div>
                <p className="dl-status" style={{ marginTop: 8 }}>
                  แหล่งอัตโนมัติ {selectedApiSources.length} แห่ง, แหล่งค้นต่อ {visibleManualSources.length} แห่ง
                </p>
                <div className="dl-manual-grid">
                  {visibleExternalSources.length === 0 ? (
                    <div className="dl-empty">เลือกแหล่งข้อมูลก่อนเปิดค้นด้วยมือ</div>
                  ) : (
                    visibleExternalSources.map((source) => (
                      <a
                        key={source.name}
                        href={query ? buildExternalUrl(source.template, query) : "#"}
                        target={query ? "_blank" : undefined}
                        rel="noreferrer"
                        className="dl-manual-link"
                        onClick={(event) => {
                          if (!query) {
                            event.preventDefault();
                            setStatus("กรุณาพิมพ์คำค้นหาก่อนเปิดแหล่งค้น");
                          }
                        }}
                      >
                        <span className="dl-manual-name">
                          {source.name} • {source.mode === "api" ? "เปิดหน้าแหล่งหลัก" : "ค้นต่อผ่านเว็บ"}
                        </span>
                        <span className="dl-manual-detail">{source.detail}</span>
                      </a>
                    ))
                  )}
                </div>
              </section>
            ) : null}
          </section>
        </section>

        <section className="dl-panel dl-notes" id="notes">
          <h2 className="dl-panel-title">
            บันทึกผลค้น
            <span className="dl-count">{notes.length} รายการ</span>
          </h2>
          <div className="dl-note-list">
            {notes.length === 0 ? (
              <div className="dl-empty">ยังไม่มีบันทึก</div>
            ) : (
              notes.map((note, index) => (
                <div key={`${note.caseNo}-${index}`} className="dl-note">
                  <strong>{note.caseNo}</strong>
                  <span>{note.point}</span>
                  <button className="dl-remove" type="button" onClick={() => setNotes((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                    ลบ
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
