import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getIfoodOAuthCookieOptions,
  IFOOD_OAUTH_STATE_COOKIE,
  IfoodOAuthError,
  unsealIfoodOAuthState,
} from "@/lib/integrations/ifood-oauth";
import { authorizeProject, ProjectAccessError } from "@/lib/projects/access";
import { completeProjectIfoodConnection } from "@/lib/projects/ifood";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  projectId: z.string().uuid(),
  authorizationCode: z.string().trim().min(4).max(2048),
});

function clearOAuthState(response: NextResponse) {
  response.cookies.set(
    IFOOD_OAUTH_STATE_COOKIE,
    "",
    getIfoodOAuthCookieOptions(0),
  );
  return response;
}

export async function POST(request: NextRequest) {
  try {
    const input = requestSchema.parse(await request.json());
    const { user } = await authorizeProject(input.projectId);
    const sealedState = request.cookies.get(IFOOD_OAUTH_STATE_COOKIE)?.value;
    if (!sealedState) {
      throw new IfoodOAuthError(
        "O código de vinculação expirou. Gere um novo código e autorize novamente.",
        400,
        "state_expired",
      );
    }
    const state = unsealIfoodOAuthState(sealedState);
    if (state.userId !== user.id || state.projectId !== input.projectId) {
      throw new IfoodOAuthError(
        "Esta autorização não pertence ao usuário ou projeto atual.",
        403,
        "state_project_mismatch",
      );
    }
    const connection = await completeProjectIfoodConnection({
      clientId: input.projectId,
      userId: user.id,
      authorizationCode: input.authorizationCode,
      authorizationCodeVerifier: state.authorizationCodeVerifier,
    });
    return clearOAuthState(
      NextResponse.json(
        { connection },
        { headers: { "Cache-Control": "private, no-store, max-age=0" } },
      ),
    );
  } catch (error) {
    let response: NextResponse;
    if (error instanceof ProjectAccessError) {
      response = NextResponse.json(
        { error: error.message, code: "project_access_denied" },
        { status: error.status },
      );
    } else if (error instanceof IfoodOAuthError) {
      response = NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
      if (
        error.code === "state_expired" ||
        error.code === "authorization_code_expired" ||
        error.code === "state_project_mismatch"
      ) {
        return clearOAuthState(response);
      }
    } else if (error instanceof z.ZodError || error instanceof SyntaxError) {
      response = NextResponse.json(
        {
          error: "Informe um código de autorização válido.",
          code: "invalid_request",
        },
        { status: 400 },
      );
    } else {
      response = NextResponse.json(
        {
          error: "Não foi possível concluir a integração com o iFood.",
          code: "ifood_connection_failed",
        },
        { status: 500 },
      );
    }
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    return response;
  }
}
