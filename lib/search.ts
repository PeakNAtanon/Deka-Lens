export type SearchResult = {
  source: string;
  caseNo: string;
  title: string;
  summary: string;
  category: string;
  yearBe: number | null;
  url: string;
};

export type ExternalSource = {
  name: string;
  detail: string;
  template: string;
  mode: "api" | "manual";
};

export const presetTopics = {
  extensionFee: ["ค่าตอบแทน", "ขยายระยะเวลาชำระหนี้", "เงินกู้"],
  interest: ["ดอกเบี้ยเกินอัตรา", "สัญญากู้ยืมเงิน"],
  novation: ["แปลงหนี้ใหม่", "ขยายเวลาชำระหนี้"],
  penalty: ["เบี้ยปรับ", "เงินกู้", "ลดเบี้ยปรับ"]
} as const;

export const externalSources: ExternalSource[] = [
  {
    name: "ThaiDeka",
    detail: "ค้นฐาน ThaiDeka โดยตรง",
    template: "https://deka.in.th/search?q={query}&type=deka",
    mode: "api"
  },
  {
    name: "ศาลฎีกา",
    detail: "ค้นระบบสืบค้นคำพิพากษาศาลฎีกา",
    template: "https://www.google.com/search?q=site%3Adeka.supremecourt.or.th+{query}",
    mode: "api"
  },
  {
    name: "Law3S",
    detail: "ค้นต่อผ่านเว็บ Law3S",
    template: "https://deka.law3s.com/?query={query}",
    mode: "manual"
  },
  {
    name: "TLSC",
    detail: "ค้นต่อผ่านเว็บ TLSC",
    template: "https://www.google.com/search?q=%22TLSC%22+{query}",
    mode: "manual"
  },
  {
    name: "นิติธรรมาลัย",
    detail: "ค้นต่อผ่านเว็บนิติธรรมาลัย",
    template: "https://www.google.com/search?q=%22นิติธรรมาลัย%22+{query}",
    mode: "manual"
  },
  {
    name: "ThaiLawOnline",
    detail: "ค้นต่อผ่านบทความและคำอธิบายกฎหมายของ ThaiLawOnline",
    template: "https://www.google.com/search?q=site%3Athailawonline.com+{query}",
    mode: "manual"
  },
  {
    name: "ThaiLawDB",
    detail: "ค้นต่อผ่านเว็บ ThaiLawDB",
    template: "https://thailawdb.com/search/?query={query}",
    mode: "manual"
  }
];

export const apiSourceNames = externalSources.filter((source) => source.mode === "api").map((source) => source.name);
export const sourceModeLabel: Record<ExternalSource["mode"], string> = {
  api: "อัตโนมัติ",
  manual: "ค้นต่อ"
};

const userAgent =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 DekaLens/1.0";

export function buildExternalUrl(template: string, query: string) {
  return template.replace("{query}", encodeURIComponent(query));
}

export function normalizeText(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export function decodeHtml(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function extractCaseNo(text: string) {
  return text.match(/\d{1,6}\s*\/\s*(?:24|25)\d{2}/)?.[0].replace(/\s/g, "") ?? "";
}

export function extractYearBe(text: string) {
  const year = text.match(/(?:24|25)\d{2}/)?.[0];
  return year ? Number(year) : null;
}

export function inferCategory(text: string) {
  const rules: Record<string, string[]> = {
    อาญา: ["ลักทรัพย์", "ฉ้อโกง", "ยักยอก", "ฆ่า", "ทำร้าย", "จำคุก"],
    แพ่ง: ["หนี้", "ละเมิด", "สัญญา", "เงินกู้", "ค่าเสียหาย", "จำนอง", "ขายฝาก"],
    พาณิชย์: ["หุ้น", "บริษัท", "เช็ค", "ตั๋วเงิน", "ล้มละลาย"],
    แรงงาน: ["เลิกจ้าง", "ค่าชดเชย", "นายจ้าง", "ลูกจ้าง"],
    ปกครอง: ["หน่วยงานรัฐ", "คำสั่งทางปกครอง", "ราชการ"],
    ครอบครัว: ["สมรส", "หย่า", "บุตร", "มรดก", "สินสมรส"]
  };

  for (const [category, keywords] of Object.entries(rules)) {
    if (keywords.some((keyword) => text.includes(keyword))) return category;
  }

  return "ไม่ระบุ";
}

export function parseThaiDeka(html: string): SearchResult[] {
  const anchorPattern =
    /<a\b[^>]*href=["'](https:\/\/deka\.in\.th\/deka\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/g;
  const results: SearchResult[] = [];
  const seen = new Set<string>();

  for (const match of html.matchAll(anchorPattern)) {
    const href = match[1] ?? "";
    const body = match[2] ?? "";
    if (!href || seen.has(href)) continue;

    const titleMatch = body.match(/<div[^>]*class=["'][^"']*font-semibold[^"']*["'][^>]*>([\s\S]*?)<\/div>/);
    const summaryMatch = body.match(/<p[^>]*>([\s\S]*?)<\/p>/);
    const badgeMatch = body.match(/<span[^>]*class=["'][^"']*deka-number[^"']*["'][^>]*>([\s\S]*?)<\/span>/);

    const title = decodeHtml(normalizeText(titleMatch?.[1] ?? body));
    const summary = decodeHtml(normalizeText(summaryMatch?.[1] ?? ""));
    const combinedText = `${title} ${summary}`;
    const caseNo = decodeHtml(normalizeText(badgeMatch?.[1] ?? extractCaseNo(combinedText)));

    if (!caseNo) continue;

    seen.add(href);
    results.push({
      source: "ThaiDeka",
      caseNo,
      title,
      summary: summary || "เปิดต้นทางเพื่อตรวจรายละเอียดคำพิพากษา",
      category: inferCategory(combinedText),
      yearBe: extractYearBe(`${caseNo} ${combinedText}`),
      url: href
    });
  }

  return results.slice(0, 12);
}

export function parseSupremeCourtDeka(html: string): SearchResult[] {
  const titlePattern =
    /<li class=["'][^"']*item_deka_no[^"']*content-title[^"']*["'][\s\S]*?<input[^>]*value=["']([^"']+)["'][\s\S]*?<label[^>]*>([\s\S]*?)<\/label>/g;
  const results: SearchResult[] = [];
  const seen = new Set<string>();

  for (const match of html.matchAll(titlePattern)) {
    const docId = match[1] ?? "";
    const title = decodeHtml(normalizeText(match[2] ?? ""));
    const caseNo = extractCaseNo(title);
    if (!docId || !caseNo || seen.has(docId)) continue;

    const shortTextPattern = new RegExp(`<li[^>]*id=["']short_text_docid_${docId}["'][^>]*>([\\s\\S]*?)<\\/li>`, "i");
    const summary = decodeHtml(normalizeText(html.match(shortTextPattern)?.[1] ?? ""));
    const combinedText = `${title} ${summary}`;

    seen.add(docId);
    results.push({
      source: "ศาลฎีกา",
      caseNo,
      title,
      summary: summary || "เปิดเว็บศาลฎีกาเพื่อตรวจรายละเอียดคำพิพากษา",
      category: inferCategory(combinedText),
      yearBe: extractYearBe(`${caseNo} ${combinedText}`),
      url: `https://deka.supremecourt.or.th/search`
    });
  }

  return results.slice(0, 12);
}

export async function fetchThaiDeka(query: string): Promise<SearchResult[]> {
  const searchParams = new URLSearchParams({ q: query, type: "deka" });
  const response = await fetch(`https://deka.in.th/search?${searchParams.toString()}`, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": userAgent
    },
    next: { revalidate: 300 }
  });

  if (!response.ok) {
    throw new Error(`ThaiDeka returned HTTP ${response.status}`);
  }

  return parseThaiDeka(await response.text());
}

export async function fetchSupremeCourtDeka(query: string): Promise<SearchResult[]> {
  const searchParams = new URLSearchParams({
    search_form_type: "basic",
    start: "true",
    search_doctype: "",
    search_type: "1",
    search_word: query,
    search_deka_no_ref: "",
    search_deka_no: "",
    search_deka_start_year: "",
    search_deka_end_year: ""
  });

  const response = await fetch("https://deka.supremecourt.or.th/search", {
    method: "POST",
    headers: {
      accept: "text/html,application/xhtml+xml",
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": userAgent
    },
    body: searchParams.toString(),
    next: { revalidate: 300 }
  });

  if (!response.ok) {
    throw new Error(`SupremeCourt Deka returned HTTP ${response.status}`);
  }

  return parseSupremeCourtDeka(await response.text());
}

export async function fetchAllDekaSources(
  query: string,
  selectedSources?: string[]
): Promise<{ results: SearchResult[]; errors: string[] }> {
  const requestedSources = selectedSources === undefined ? apiSourceNames : selectedSources;
  const allowed = new Set(requestedSources.filter((name) => apiSourceNames.includes(name)));
  const tasks = [
    { name: "ThaiDeka", run: () => fetchThaiDeka(query) },
    { name: "ศาลฎีกา", run: () => fetchSupremeCourtDeka(query) }
  ].filter((task) => allowed.has(task.name));

  if (tasks.length === 0) {
    return { results: [], errors: [] };
  }

  const settled = await Promise.allSettled(tasks.map((task) => task.run()));
  const results: SearchResult[] = [];
  const errors: string[] = [];

  settled.forEach((item, index) => {
    if (item.status === "fulfilled") {
      results.push(...item.value);
      return;
    }

    const reason = item.reason instanceof Error ? item.reason.message : "Unknown search error";
    errors.push(`${tasks[index]?.name ?? "แหล่งข้อมูล"}: ${reason}`);
  });

  const seen = new Set<string>();
  const uniqueResults = results.filter((result) => {
    const key = result.url.includes("supremecourt") ? `${result.source}:${result.caseNo}` : result.url;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { results: uniqueResults, errors };
}
