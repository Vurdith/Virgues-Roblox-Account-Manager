import { AbsoluteFill } from "remotion";
import { Caption, Cursor, ScreenFrame } from "./shared";

export const SessionScene: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#0d0d0e", overflow: "hidden" }}>
      <ScreenFrame
        src="session-board.png"
        durationInFrames={120}
        startScale={1.02}
        endScale={1.075}
        startTranslate="0px 2px"
        endTranslate="0px -24px"
      />
      <Cursor
        frames={[0, 28, 58, 92, 118]}
        xs={[820, 820, 760, 1370, 1370]}
        ys={[48, 48, 450, 450, 450]}
        clickFrames={[28, 92]}
      />
      <Caption durationInFrames={120} width={980}>
        See what’s alive. See what’s stale.
      </Caption>
    </AbsoluteFill>
  );
};
