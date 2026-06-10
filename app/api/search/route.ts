import { NextRequest, NextResponse } from "next/server";
import { apiSourceNames, fetchAllDekaSources } from "@/lib/search";

function parseSelectedSources(request: NextRequest) {
  const sourcesParam = request.nextUrl.searchParams.get("sources");

  if (sourcesParam === null) {
    return apiSourceNames;
  }

  return sourcesParam
    .split(",")
    .map((item) => item.trim())
    .filter((item) => apiSourceNames.includes(item));
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim();
  const selectedSources = parseSelectedSources(request);

  if (!query) {
    return NextResponse.json({ results: [], errors: ["Missing query"] }, { status: 400 });
  }

  try {
    const payload = await fetchAllDekaSources(query, selectedSources);
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown search error";
    return NextResponse.json({ results: [], errors: [message] }, { status: 502 });
  }
}
