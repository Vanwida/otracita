"use client";

import dynamic from "next/dynamic";

const VideoPlayer = dynamic(
  () => import("@/components/remotion/VideoPlayer"),
  { ssr: false }
);

export default function VideoSection() {
  return <VideoPlayer />;
}
