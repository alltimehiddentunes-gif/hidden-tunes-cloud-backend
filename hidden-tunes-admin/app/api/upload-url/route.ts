import { NextRequest, NextResponse } from "next/server";

import {
  PutObjectCommand,
} from "@aws-sdk/client-s3";

import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { r2 } from "@/lib/r2";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const fileName = body.fileName;
    const fileType = body.fileType;
    const folder = body.folder || "songs";

    if (!fileName || !fileType) {
      return NextResponse.json(
        { error: "Missing fields" },
        { status: 400 }
      );
    }

    const key = `${folder}/${Date.now()}-${fileName}`;

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
      ContentType: fileType,
    });

    const signedUrl = await getSignedUrl(
      r2,
      command,
      {
        expiresIn: 60 * 10,
      }
    );

    return NextResponse.json({
      success: true,
      signedUrl,
      key,
      publicUrl: `${process.env.R2_PUBLIC_BASE_URL}/${key}`,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Upload URL generation failed" },
      { status: 500 }
    );
  }
}