import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("artists")
      .select("id, name, slug, image_url")
      .order("name", { ascending: true });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      artists: data || [],
    });
  } catch (error: any) {
    console.error("Fetch artists failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Failed to fetch artists.",
      },
      { status: 500 }
    );
  }
}