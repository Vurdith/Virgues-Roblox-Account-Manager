import { Composition } from "remotion";
import { LaunchTrailer, TRAILER_DURATION_IN_FRAMES, TRAILER_FPS } from "./LaunchTrailer";

export const MyComposition = () => {
  return (
    <Composition
      id="VirgueLaunchTrailer"
      component={LaunchTrailer}
      durationInFrames={TRAILER_DURATION_IN_FRAMES}
      fps={TRAILER_FPS}
      width={1920}
      height={1080}
      defaultProps={{ voiceoverSrc: "" }}
    />
  );
};
