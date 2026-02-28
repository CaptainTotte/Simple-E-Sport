import { NextResponse } from "next/server";
import { requireActor } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { saveUploadImage, validateUploadImage } from "@/lib/image-upload";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    await requireActor(prisma, req);
    const formData = await req.formData();
    const image = formData.get("image");

    if (!(image instanceof File)) {
      return NextResponse.json({ error: "Image file is required." }, { status: 400 });
    }

    const validation = validateUploadImage(image);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const publicUrl = await saveUploadImage(image, "proofs", validation.ext);

    return NextResponse.json({
      publicUrl,
      storageProvider: "local",
      objectKey: publicUrl,
      mimeType: image.type || undefined,
      fileSizeBytes: image.size || undefined
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    return errorResponse(error);
  }
}
