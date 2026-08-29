import { AbsoluteFill } from "remotion";
import { Caption, Cursor, ScreenFrame } from "./shared";

export const GameScene: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#0d0d0e", overflow: "hidden" }}>
      <ScreenFrame
        src="game-shelf.png"
        durationInFrames={120}
        startScale={1.025}
        endScale={1.075}
        startTranslate="8px 0px"
        endTranslate="30px -18px"
      />
      <Cursor
        frames={[0, 28, 66, 92, 118]}
        xs={[700, 700, 510, 845, 845]}
        ys={[48, 48, 420, 420, 420]}
        clickFrames={[28, 66]}
      />
      <Caption durationInFrames={120} width={1050}>
        The right accounts are already there.
      </Caption>
    </AbsoluteFill>
  );
};
