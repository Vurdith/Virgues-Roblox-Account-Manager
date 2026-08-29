import {
  AbsoluteFill,
  Easing,
  OffthreadVideo,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";

type Beat = {
  readonly from: number;
  readonly to: number;
  readonly label: string;
  readonly copy: string;
};

const BEATS: readonly Beat[] = [
  {
    from: 0,
    to: 84,
    label: "THE FAMILIAR PROBLEM",
    copy: "You meant to open your alt.\nYou opened the wrong account.",
  },
  {
    from: 84,
    to: 141,
    label: "ONE DESK",
    copy: "Every account, sorted around the games you actually play.",
  },
  {
    from: 141,
    to: 210,
    label: "ONE PLACE",
    copy: "Accounts, games, and sessions. One place.",
  },
  {
    from: 210,
    to: 330,
    label: "NO TABS",
    copy: "No digging through tabs.",
  },
  {
    from: 330,
    to: 453,
    label: "NO GUESSING",
    copy: "See the account, the game, and the launch target before you click.",
  },
  {
    from: 453,
    to: 594,
    label: "THEN GET IN",
    copy: "Pick the setup. Hit launch. Move on.",
  },
];

const Caption: React.FC<{ readonly beat: Beat; readonly frame: number }> = ({ beat, frame }) => {
  const local = frame - beat.from;
  const opacity = interpolate(
    local,
    [0, 10, Math.max(11, beat.to - beat.from - 14), beat.to - beat.from],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) },
  );
  const translateY = interpolate(local, [0, 16], [14, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <div
      style={{
        position: "absolute",
        left: 132,
        bottom: 88,
        width: 980,
        opacity,
        transform: `translateY(${translateY}px)`,
        textShadow: "0 3px 24px rgba(0,0,0,0.65)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 12,
          color: "#ff6c64",
          fontSize: 16,
          fontWeight: 700,
          letterSpacing: "0.16em",
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#ff6c64" }} />
        {beat.label}
      </div>
      <div
        style={{
          maxWidth: 900,
          color: "#fffaf1",
          fontSize: 52,
          lineHeight: 1.06,
          fontWeight: 600,
          whiteSpace: "pre-line",
        }}
      >
        {beat.copy}
      </div>
    </div>
  );
};

export const ProductTourScene: React.FC = () => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, 594], [1.02, 1.075], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.quad),
  });
  const translateX = interpolate(frame, [0, 594], [0, -18], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.quad),
  });
  const vignette = interpolate(frame, [0, 28, 84, 594], [0.46, 0.28, 0.16, 0.12], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const beat = BEATS.find((candidate) => frame >= candidate.from && frame < candidate.to);

  return (
    <AbsoluteFill style={{ backgroundColor: "#0d0d0e", overflow: "hidden" }}>
      <OffthreadVideo
        src={staticFile("product-tour.mp4")}
        muted
        startFrom={0}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center",
          transform: `translateX(${translateX}px) scale(${scale})`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `linear-gradient(90deg, rgba(10,10,11,${vignette}) 0%, rgba(10,10,11,${vignette * 0.35}) 46%, rgba(10,10,11,0.02) 78%), linear-gradient(0deg, rgba(10,10,11,0.42) 0%, rgba(10,10,11,0) 46%)`,
        }}
      />
      {beat ? <Caption beat={beat} frame={frame} /> : null}
    </AbsoluteFill>
  );
};
