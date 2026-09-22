import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getIfoodOAuthCookieOptions,
  IFOOD_OAUTH_STATE_COOKIE,
  IfoodOAuthError,
  requestIfoodUserCode,
  sealIfoodOAuthState,
} from "@/lib/integrations/ifood-oauth";
import { authorizeProject, ProjectAccessError } from "@/lib/projects/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({ projectId: z.string().uuid() });

export async function POST(request: NextRequest) {
  try {
    const input = requestSchema.parse(await request.json());
    const { user } = await authorizeProject(input.projectId);
    const result = await requestIfoodUserCode();
    const now = Date.now();
    const maxAge = Math.min(result.expiresIn, 3600);
    const expiresAt = now + maxAge * 1000;
    const state = sealIfoodOAuthState({
      version: 1,
      userId: user.id,
      projectId: input.projectId,
      authorizationCodeVerifier: result.authorizationCodeVerifier,
      issuedAt: now,
      expiresAt,
    });
    const response = NextResponse.json({
      userCode: result.userCode,
      verificationUrl: result.verificationUrl,
      verificationUrlComplete: result.verificationUrlComplete ?? null,
      expiresIn: maxAge,
      expiresAt: new Date(expiresAt).toISOString(),
    });
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    response.cookies.set(
      IFOOD_OAUTH_STATE_COOKIE,
      state,
      getIfoodOAuthCookieOptions(maxAge),
    );
    return response;
  } catch (error) {
    if (error instanceof ProjectAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof IfoodOAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Projeto inválido para esta integração." },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Não foi possível iniciar a integração com o iFood." },
      { status: 500 },
    );
  }
}
