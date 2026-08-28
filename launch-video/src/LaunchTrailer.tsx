import { Audio } from "@remotion/media";
import {
  AbsoluteFill,
  Easing,
  Img,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import type { ReactNode } from "react";

export type LaunchTrailerProps = {
  readonly voiceoverSrc?: string;
};

export const TRAILER_FPS = 30;
export const TRAILER_DURATION_IN_FRAMES = 36 * TRAILER_FPS;

const IN = Easing.bezier(0.16, 1, 0.3, 1);
const OUT = Easing.bezier(0.7, 0, 0.84, 0);

const fade = (frame: number, duration: number) =>
  interpolate(
    frame,
    [0, 14, Math.max(15, duration - 14), duration],
    [0, 1, 1, 0],
    {
      easing: [IN, Easing.linear, OUT],
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

const rise = (frame: number, delay: number, distance = 32) => ({
  opacity: interpolate(frame, [delay, delay + 18], [0, 1], {
    easing: IN,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }),
  transform:
    "translate3d(0, " +
    interpolate(frame, [delay, delay + 18], [distance, 0], {
      easing: IN,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }) +
    "px, 0)",
});

const slide = (frame: number, delay: number, distance = 80) => ({
  opacity: interpolate(frame, [delay, delay + 22], [0, 1], {
    easing: IN,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }),
  transform:
    "translate3d(" +
    interpolate(frame, [delay, delay + 22], [distance, 0], {
      easing: IN,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }) +
    "px, 0, 0)",
});

type StageProps = {
  readonly children: ReactNode;
  readonly duration: number;
  readonly tone: "light" | "dark";
};

function Stage({ children, duration, tone }: StageProps) {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill className={"stage stage-" + tone} style={{ opacity: fade(frame, duration) }}>
      <div className="stage-grid" />
      {children}
    </AbsoluteFill>
  );
}

function Brand({ dark = false }: { readonly dark?: boolean }) {
  return (
    <div className={"brand " + (dark ? "brand-dark" : "")}>
      <Img src={staticFile("virgue-icon.png")} />
      <div>
        <strong>VIRGUE</strong>
        <span>ROBLOX ACCOUNT MANAGER</span>
      </div>
    </div>
  );
}

function SceneMeta({
  index,
  label,
  dark = false,
}: {
  readonly index: string;
  readonly label: string;
  readonly dark?: boolean;
}) {
  return (
    <div className={"scene-meta " + (dark ? "scene-meta-dark" : "")}>
      <span>{index} / 07</span>
      <span className="scene-meta-rule" />
      <span>{label}</span>
    </div>
  );
}

function ProductShot({
  src,
  frame,
  width,
  height,
  label,
  dark = false,
  panX = 0,
  panY = 0,
  marker,
}: {
  readonly src: string;
  readonly frame: number;
  readonly width: number;
  readonly height: number;
  readonly label: string;
  readonly dark?: boolean;
  readonly panX?: number;
  readonly panY?: number;
  readonly marker?: {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
    readonly text: string;
    readonly tone: "coral" | "yellow" | "mint";
  };
}) {
  const scale = interpolate(frame, [0, 50, 190], [1, 1.012, 1.04], {
    easing: IN,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const driftX =
    panX +
    interpolate(frame, [0, 190], [0, -panX * 0.24], {
      easing: Easing.linear,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  const driftY =
    panY +
    interpolate(frame, [0, 190], [0, -panY * 0.24], {
      easing: Easing.linear,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });

  return (
    <div
      className={"product-shot " + (dark ? "product-shot-dark" : "")}
      style={{ width, height }}
    >
      <div className="shot-label">
        <span className="shot-led" />
        <span>{label}</span>
        <span className="shot-label-right">CAPTURED FROM THE APP</span>
      </div>
      <div className="shot-viewport">
        <div
          className="shot-image"
          style={{
            transform:
              "translate3d(" +
              driftX +
              "px, " +
              driftY +
              "px, 0) scale(" +
              scale +
              ")",
          }}
        >
          <Img src={staticFile(src)} />
        </div>
        <div className="shot-sheen" />
        {marker ? (
          <div
            className={"shot-marker shot-marker-" + marker.tone}
            style={{
              left: marker.left + "%",
              top: marker.top + "%",
              width: marker.width + "%",
              height: marker.height + "%",
            }}
          >
            <span>{marker.text}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function HookScene() {
  const frame = useCurrentFrame();
  const shotX = interpolate(frame, [45, 112], [620, 0], {
    easing: IN,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const redLine = interpolate(frame, [28, 65], [0, 1], {
    easing: IN,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <Stage duration={135} tone="dark">
      <div className="hook-layout">
        <Brand dark />
        <SceneMeta index="01" label="THE QUESTION" dark />
        <div className="hook-copy">
          <p className="eyebrow eyebrow-dark" style={rise(frame, 4, 18)}>
            FOR EVERYONE WITH MORE THAN ONE ROBLOX ACCOUNT
          </p>
          <h1 style={rise(frame, 8, 42)}>
            Which account
            <br />
            is actually
            <br />
            <span className="accent-coral">running?</span>
          </h1>
          <div className="hook-rule" style={{ transform: "scaleX(" + redLine + ")" }} />
          <p className="hook-answer" style={rise(frame, 28, 18)}>
            If you had to check, you need a better desk.
          </p>
        </div>
        <div
          className="hook-shot"
          style={{
            transform: "translate3d(" + shotX + "px, 0, 0)",
            opacity: interpolate(frame, [36, 56], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <ProductShot
            src="account-desk.png"
            frame={frame}
            width={1000}
            height={680}
            label="ACCOUNT DESK"
            dark
            panX={-16}
            panY={-5}
            marker={{
              left: 18,
              top: 25,
              width: 38,
              height: 48,
              text: "PROFILE INDEX",
              tone: "coral",
            }}
          />
        </div>
        <div className="hook-footer">
          <span>VIRGUE / DESKTOP WORKSPACE</span>
          <span>01:00</span>
        </div>
      </div>
    </Stage>
  );
}

function DeskScene() {
  const frame = useCurrentFrame();
  return (
    <Stage duration={195} tone="light">
      <div className="split-layout split-layout-desk">
        <Brand />
        <SceneMeta index="02" label="ACCOUNT DESK" />
        <div className="split-copy" style={rise(frame, 8, 36)}>
          <p className="eyebrow">THE SETUP, IN ONE VIEW</p>
          <h2>
            Stop searching.
            <br />
            <span className="accent-coral">Start seeing.</span>
          </h2>
          <p className="body-copy">
            Profiles, groups, games, and launch targets — kept together in one calm workspace.
          </p>
          <div className="small-proof">
            <span className="proof-number">01</span>
            <span>every profile has a place</span>
          </div>
        </div>
        <div className="desk-shot" style={slide(frame, 13, 120)}>
          <ProductShot
            src="account-desk.png"
            frame={frame}
            width={1230}
            height={790}
            label="ACCOUNT DESK / PROFILES"
            marker={{
              left: 17,
              top: 24,
              width: 42,
              height: 48,
              text: "SEARCH · GROUP · LAUNCH",
              tone: "coral",
            }}
          />
        </div>
      </div>
    </Stage>
  );
}

function GameScene() {
  const frame = useCurrentFrame();
  return (
    <Stage duration={195} tone="dark">
      <div className="split-layout split-layout-game">
        <Brand dark />
        <SceneMeta index="03" label="GAME SHELF" dark />
        <div className="split-copy split-copy-right" style={rise(frame, 8, 36)}>
          <p className="eyebrow eyebrow-dark">KEEP THE WORKFLOW ATTACHED</p>
          <h2>
            Pick the
            <br />
            <span className="accent-coral">right setup.</span>
          </h2>
          <p className="body-copy body-copy-dark">
            Organize experiences first, then keep the profiles and categories that belong to them close.
          </p>
          <div className="small-proof small-proof-dark">
            <span className="proof-number">02</span>
            <span>less tab hopping, more playing</span>
          </div>
        </div>
        <div className="game-shot" style={slide(frame, 13, -120)}>
          <ProductShot
            src="game-shelf.png"
            frame={frame}
            width={1190}
            height={760}
            label="GAME SHELF / COLLECTIONS"
            dark
            panX={18}
            panY={-8}
            marker={{
              left: 18,
              top: 19,
              width: 25,
              height: 26,
              text: "COLLECTIONS",
              tone: "yellow",
            }}
          />
        </div>
      </div>
    </Stage>
  );
}

function SessionScene() {
  const frame = useCurrentFrame();
  return (
    <Stage duration={195} tone="light">
      <div className="full-layout">
        <Brand />
        <SceneMeta index="04" label="SESSION BOARD" />
        <div className="full-copy" style={rise(frame, 7, 34)}>
          <p className="eyebrow">THE PART THAT MAKES YOU SECOND-GUESS EVERYTHING</p>
          <h2>
            Know what’s
            <br />
            <span className="accent-coral">actually running.</span>
          </h2>
          <p className="body-copy">
            Session Guardian separates live process state from presence, so stale windows stop looking mysterious.
          </p>
        </div>
        <div className="session-shot" style={slide(frame, 15, 96)}>
          <ProductShot
            src="session-board.png"
            frame={frame}
            width={1260}
            height={620}
            label="SESSION BOARD / GUARDIAN"
            marker={{
              left: 18,
              top: 20,
              width: 57,
              height: 22,
              text: "SESSION GUARDIAN",
              tone: "mint",
            }}
          />
        </div>
        <div className="floating-caption" style={rise(frame, 92, 18)}>
          <span className="caption-led" />
          <span>process state + presence, in one place</span>
        </div>
      </div>
    </Stage>
  );
}

function SettingsScene() {
  const frame = useCurrentFrame();
  return (
    <Stage duration={195} tone="dark">
      <div className="split-layout split-layout-settings">
        <Brand dark />
        <SceneMeta index="05" label="SETTINGS" dark />
        <div className="split-copy" style={rise(frame, 8, 36)}>
          <p className="eyebrow eyebrow-dark">LESS REPEATING YOURSELF</p>
          <h2>
            Tune it once.
            <br />
            <span className="accent-yellow">Keep it ready.</span>
          </h2>
          <p className="body-copy body-copy-dark">
            Launching, watching, refreshes, and performance preferences — visible when you need them.
          </p>
          <div className="small-proof small-proof-dark">
            <span className="proof-number">03</span>
            <span>your defaults stay in view</span>
          </div>
        </div>
        <div className="settings-shot" style={slide(frame, 13, 120)}>
          <ProductShot
            src="settings.png"
            frame={frame}
            width={1240}
            height={790}
            label="SETTINGS / PREFERENCES"
            dark
            panX={-10}
            panY={12}
            marker={{
              left: 18,
              top: 18,
              width: 59,
              height: 47,
              text: "PREFERENCES",
              tone: "yellow",
            }}
          />
        </div>
      </div>
    </Stage>
  );
}

function ProofScene() {
  const frame = useCurrentFrame();
  const overlay = interpolate(frame, [0, 28], [0, 0.58], {
    easing: IN,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <Stage duration={195} tone="dark">
      <div className="proof-layout">
        <Brand dark />
        <SceneMeta index="06" label="THE POINT" dark />
        <div className="proof-shot" style={rise(frame, 4, 62)}>
          <ProductShot
            src="account-desk.png"
            frame={frame}
            width={1540}
            height={900}
            label="VIRGUE / YOUR WORKSPACE"
            dark
            panX={-12}
            panY={-12}
          />
          <div className="proof-overlay" style={{ opacity: overlay }} />
        </div>
        <div className="proof-message" style={rise(frame, 34, 40)}>
          <p className="eyebrow eyebrow-dark">ONE DESK. EVERYTHING IN VIEW.</p>
          <h2>
            Multi-accounting,
            <br />
            <span className="accent-coral">without the juggling.</span>
          </h2>
          <p className="body-copy body-copy-dark">
            Local-first by design. Built for the messy parts of the setup.
          </p>
        </div>
      </div>
    </Stage>
  );
}

function OutroScene() {
  const frame = useCurrentFrame();
  const markScale = interpolate(frame, [0, 28], [0.84, 1], {
    easing: IN,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <Stage duration={60} tone="dark">
      <div className="outro-layout">
        <div className="outro-mark" style={{ transform: "scale(" + markScale + ")" }}>
          <Img src={staticFile("virgue-icon.png")} />
        </div>
        <div className="outro-lockup" style={rise(frame, 8, 18)}>
          <Brand dark />
        </div>
        <div className="outro-tagline" style={rise(frame, 16, 18)}>
          <span>STOP JUGGLING.</span>
          <strong>START PLAYING.</strong>
        </div>
        <div className="outro-footer" style={rise(frame, 28, 12)}>
          <span>VIRGUE’S ROBLOX ACCOUNT MANAGER</span>
          <span>WINDOWS DESKTOP WORKSPACE</span>
        </div>
      </div>
    </Stage>
  );
}

export const LaunchTrailer: React.FC<LaunchTrailerProps> = ({ voiceoverSrc = "" }) => {
  return (
    <AbsoluteFill className="trailer-root">
      <Audio
        src={staticFile("ambient-bed.wav")}
        loop
        volume={(frame) =>
          interpolate(frame, [0, 34, 1000, 1080], [0, 0.7, 0.7, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })
        }
      />
      {voiceoverSrc ? <Audio src={staticFile(voiceoverSrc)} volume={1} /> : null}

      <Sequence durationInFrames={135} name="01-hook">
        <HookScene />
      </Sequence>
      <Sequence from={120} durationInFrames={195} name="02-account-desk">
        <DeskScene />
      </Sequence>
      <Sequence from={300} durationInFrames={195} name="03-game-shelf">
        <GameScene />
      </Sequence>
      <Sequence from={480} durationInFrames={195} name="04-session-board">
        <SessionScene />
      </Sequence>
      <Sequence from={660} durationInFrames={195} name="05-settings">
        <SettingsScene />
      </Sequence>
      <Sequence from={840} durationInFrames={195} name="06-proof">
        <ProofScene />
      </Sequence>
      <Sequence from={1020} durationInFrames={60} name="07-outro">
        <OutroScene />
      </Sequence>
    </AbsoluteFill>
  );
};
