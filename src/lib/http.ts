import { NextResponse } from "next/server";
import { ZodError, type ZodSchema } from "zod";

export async function parseJson<T>(req: Request, schema: ZodSchema<T>): Promise<T> {
  const raw = await req.json();
  return schema.parse(raw);
}

export function errorResponse(error: unknown, status = 400) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: "Validation failed.",
        issues: error.issues
      },
      { status }
    );
  }

  return NextResponse.json(
    {
      error: error instanceof Error ? error.message : "Unexpected error."
    },
    { status }
  );
}
