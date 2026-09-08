import { NextResponse } from "next/server";
export async function POST() { return NextResponse.json({error:"A inteligência artificial não está disponível nesta versão."}, {status:410}); }
