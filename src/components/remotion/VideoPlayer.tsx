"use client";

import React from "react";
import { Player } from "@remotion/player";
import { ReservaVideo, RESERVA_VIDEO_CONFIG } from "./ReservaVideo";

export const VideoPlayer: React.FC = () => {
  return (
    <div
      style={{
        width: "100%",
        maxWidth: 960,
        margin: "0 auto",
        borderRadius: 16,
        overflow: "hidden",
        boxShadow: "0 20px 60px rgba(0, 0, 0, 0.08), 0 4px 16px rgba(0, 0, 0, 0.04)",
      }}
    >
      <Player
        component={ReservaVideo}
        compositionWidth={RESERVA_VIDEO_CONFIG.width}
        compositionHeight={RESERVA_VIDEO_CONFIG.height}
        durationInFrames={RESERVA_VIDEO_CONFIG.durationInFrames}
        fps={RESERVA_VIDEO_CONFIG.fps}
        autoPlay
        loop
        controls={false}
        style={{
          width: "100%",
          aspectRatio: "16 / 9",
        }}
      />
    </div>
  );
};

export default VideoPlayer;
