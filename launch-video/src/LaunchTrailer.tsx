import { Audio } from "@remotion/media";
import { AbsoluteFill, interpolate, staticFile } from "remotion";
import { CinematicProductFilm } from "./scenes/CinematicProductFilm";

export type LaunchTrailerProps = {
  readonly voiceoverSrc?: string;
};

export const TRAILER_FPS = 30;
export const TRAILER_DURATION_IN_FRAMES = 720;

const musicVolume = (frame: number) =>
  interpolate(
    frame,
    [0, 49, 65, 106, 136, 296, 312, 340, 369, 381, 411, 416, 450, 466, 492, 498, 522, 531, 552, 566, 639, 675, 719],
    [0.23, 0.23, 0.4, 0.23, 0.4, 0.23, 0.4, 0.23, 0.4, 0.23, 0.4, 0.23, 0.4, 0.23, 0.4, 0.23, 0.4, 0.23, 0.4, 0.23, 0.23, 0.48, 0.12],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

export const LaunchTrailer: React.FC<LaunchTrailerProps> = ({ voiceoverSrc = "virgue-voiceover.mp3" }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#0d0d0e" }}>
      <Audio
        src={staticFile("music-bed.wav")}
        loop
        volume={(frame) => (voiceoverSrc ? musicVolume(frame) : 0.74)}
      />
      {voiceoverSrc ? <Audio src={staticFile(voiceoverSrc)} volume={1} /> : null}

      <CinematicProductFilm />
    </AbsoluteFill>
  );
};
