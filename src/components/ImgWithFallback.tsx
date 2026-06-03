"use client";
import { useState } from "react";

interface Props {
  src: string | null | undefined;
  alt: string;
  style?: React.CSSProperties;
  fallbackStyle?: React.CSSProperties;
  fallbackChar?: string;
}

export function ImgWithFallback({ src, alt, style, fallbackStyle, fallbackChar }: Props) {
  const [failed, setFailed] = useState(false);
  const char = fallbackChar ?? (alt.charAt(0).toUpperCase());

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={alt}
        style={style}
        onError={() => setFailed(true)}
        referrerPolicy="no-referrer"
        crossOrigin="anonymous"
      />
    );
  }

  return (
    <span style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: fallbackStyle?.fontSize ?? 20,
      fontWeight: 900,
      color: "#4f46e5",
      width: "100%",
      height: "100%",
      ...fallbackStyle,
    }}>
      {char}
    </span>
  );
}
