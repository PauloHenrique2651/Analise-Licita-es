import { NextResponse } from "next/server";
import { getPortalSnapshot } from "@/services/portal-service";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await getPortalSnapshot(token);
  if (!data) return NextResponse.json({ message: "Link inválido ou expirado." }, { status: 404 });
  return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
}
