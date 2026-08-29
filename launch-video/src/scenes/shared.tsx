import {
  Easing,
  Img,
  Interactive,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import type { ReactNode } from "react";

export const ScreenFrame: React.FC<{
  readonly src: string;
  readonly durationInFrames: number;
  readonly startScale?: number;
  readonly endScale?: number;
  readonly startTranslate?: string;
  readonly endTranslate?: string;
  readonly dim?: number;
}> = ({
  src,
  durationInFrames,
  startScale = 1,
  endScale = 1.035,
  startTranslate = "0px 0px",
  endTranslate = "0px 0px",
  dim = 0,
}) => {
  const frame = useCurrentFrame();

  return (
    <>
      <Interactive.Div
        name="Real app capture"
        style={{
          position: "absolute",
          left: 108,
          top: 0,
          width: 1704,
          height: 1080,
          overflow: "hidden",
          backgroundColor: "#f5f2eb",
          scale: interpolate(frame, [0, durationInFrames], [startScale, endScale], {
            easing: Easing.bezier(0.33, 1, 0.68, 1),
            output: "perceptual-scale",
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          translate: interpolate(
            frame,
            [0, durationInFrames],
            [startTranslate, endTranslate],
            {
              easing: Easing.bezier(0.33, 1, 0.68, 1),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            },
          ),
        }}
      >
        <Img
          src={staticFile(src)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      </Interactive.Div>
      {dim > 0 ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "rgba(5, 5, 5, " + dim + ")",
          }}
        />
      ) : null}
    </>
  );
};

export const Caption: React.FC<{
  readonly children: ReactNode;
  readonly durationInFrames: number;
  readonly width?: number;
  readonly large?: boolean;
  readonly note?: string;
}> = ({ children, durationInFrames, width = 1180, large = false, note }) => {
  const frame = useCurrentFrame();

  return (
    <Interactive.Div
      name="On-screen line"
      style={{
        position: "absolute",
        left: 132,
        bottom: 72,
        width,
        padding: large ? "20px 24px 22px" : "16px 20px 18px",
        backgroundColor: "rgba(10, 10, 10, 0.82)",
        color: "#fffdf8",
        fontSize: large ? 68 : 44,
        fontWeight: 600,
        letterSpacing: "-0.035em",
        lineHeight: 1.02,
        opacity: interpolate(
          frame,
          [0, 10, durationInFrames - 10, durationInFrames],
          [0, 1, 1, 0],
          {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          },
        ),
        translate: interpolate(frame, [0, 14], ["0px 18px", "0px 0px"], {
          easing: Easing.bezier(0.16, 1, 0.3, 1),
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
      }}
    >
      {note ? (
        <div
          style={{
            marginBottom: 11,
            color: "#fa6d60",
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: "0.02em",
          }}
        >
          {note}
        </div>
      ) : null}
      {children}
    </Interactive.Div>
  );
};

export const Cursor: React.FC<{
  readonly frames: number[];
  readonly xs: number[];
  readonly ys: number[];
  readonly clickFrames?: number[];
}> = ({ frames, xs, ys, clickFrames = [] }) => {
  const frame = useCurrentFrame();
  const x = interpolate(frame, frames, xs, {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const y = interpolate(frame, frames, ys, {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const activeClick = clickFrames.find((clickFrame) => frame >= clickFrame && frame <= clickFrame + 12);
  const clickAge = activeClick === undefined ? 12 : frame - activeClick;

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        zIndex: 10,
        width: 34,
        height: 42,
        translate: x + "px " + y + "px",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: -16,
          top: -16,
          width: 38,
          height: 38,
          border: "3px solid #fa6d60",
          borderRadius: "50%",
          opacity: interpolate(clickAge, [0, 12], [0.8, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          scale: interpolate(clickAge, [0, 12], [0.25, 1.5], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            output: "perceptual-scale",
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      />
      <svg width="34" height="42" viewBox="0 0 34 42" aria-hidden="true">
        <path
          d="M4 3L29 24H18L23 36L16 39L11 27L4 34V3Z"
          fill="#fffdf8"
          stroke="#111214"
          strokeWidth="3"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};

export const VirgueLogo: React.FC<{ readonly size?: number }> = ({ size = 88 }) => (
  <Img
    src={staticFile("virgue-icon.png")}
    style={{
      width: size,
      height: size,
      objectFit: "contain",
    }}
  />
);
