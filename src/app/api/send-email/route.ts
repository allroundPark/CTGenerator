import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

export async function POST(req: NextRequest) {
  const { to, imageBase64, fileName } = await req.json();

  if (!to || !imageBase64) {
    return NextResponse.json({ error: "to and imageBase64 are required" }, { status: 400 });
  }

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;

  if (!gmailUser || !gmailPass) {
    return NextResponse.json({ error: "Email not configured" }, { status: 500 });
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: gmailUser, pass: gmailPass },
  });

  try {
    await transporter.sendMail({
      from: `CT Generator <${gmailUser}>`,
      to,
      subject: `[CT Generator] 콘텐츠 카드 내보내기 — ${fileName || "card"}`,
      html: `
        <div style="font-family: -apple-system, sans-serif; padding: 20px;">
          <h2 style="font-size: 18px; color: #1a1a1a;">CT 카드가 도착했습니다</h2>
          <p style="color: #666; font-size: 14px;">첨부된 WebP 파일을 확인해주세요.</p>
        </div>
      `,
      attachments: [
        {
          filename: fileName || "card@3x.webp",
          content: imageBase64,
          encoding: "base64",
          contentType: "image/webp",
        },
      ],
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Email send error:", e);
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }
}
