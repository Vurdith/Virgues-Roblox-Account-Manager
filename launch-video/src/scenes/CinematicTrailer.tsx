import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { CSSProperties, ReactNode } from "react";

const COLORS = {
  ink: "#101011",
  black: "#0d0d0e",
  paper: "#f2eee5",
  warm: "#fffaf1",
  coral: "#ff6d64",
  coralDark: "#de514e",
  line: "rgba(16,16,17,0.22)",
  smoke: "#a7a198",
};

const EASE_OUT = Easing.out(Easing.cubic);
const EASE_IN_OUT = Easing.inOut(Easing.cubic);
const CLAMP = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

const font = '"Outfit", Arial, sans-serif';

function fadeInOut(frame: number, start: number, end: number, fade = 14): number {
  return interpolate(frame, [start, start + fade, end - fade, end], [0, 1, 1, 0], {
    ...CLAMP,
    easing: EASE_IN_OUT,
  });
}

function enter(frame: number, delay: number, fps: number, config?: Parameters<typeof spring>[0]["config"]): number {
  return spring({
    frame: frame - delay,
    fps,
    config: config ?? { damping: 18, mass: 0.68, stiffness: 150 },
  });
}

function Grain({ opacity = 0.1, dark = false }: { readonly opacity?: number; readonly dark?: boolean }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        opacity,
        mixBlendMode: dark ? "multiply" : "screen",
        backgroundImage: dark
          ? "radial-gradient(circle at 20% 20%, rgba(0,0,0,0.26) 0 1px, transparent 1px), radial-gradient(circle at 75% 60%, rgba(0,0,0,0.18) 0 1px, transparent 1px)"
          : "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.18) 0 1px, transparent 1px), radial-gradient(circle at 75% 60%, rgba(255,255,255,0.12) 0 1px, transparent 1px)",
        backgroundSize: "5px 5px, 7px 7px",
      }}
    />
  );
}

function GridBackdrop({ dark = true, accent = false }: { readonly dark?: boolean; readonly accent?: boolean }) {
  const frame = useCurrentFrame();
  const drift = interpolate(frame, [0, 840], [0, -54], { ...CLAMP, easing: EASE_IN_OUT });
  const color = dark ? "rgba(255,255,255,0.075)" : "rgba(16,16,17,0.08)";

  return (
    <>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: dark
            ? "radial-gradient(circle at 70% 15%, rgba(255,109,100,0.14), transparent 34%), radial-gradient(circle at 10% 88%, rgba(255,255,255,0.05), transparent 26%), #0d0d0e"
            : "radial-gradient(circle at 18% 12%, rgba(255,109,100,0.14), transparent 32%), #f2eee5",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: -90,
          transform: `translate(${drift}px, ${drift * 0.35}px) rotate(-2deg)`,
          opacity: dark ? 0.76 : 0.94,
          backgroundImage: `linear-gradient(${color} 1px, transparent 1px), linear-gradient(90deg, ${color} 1px, transparent 1px)`,
          backgroundSize: "80px 80px",
        }}
      />
      {accent ? (
        <div
          style={{
            position: "absolute",
            width: 720,
            height: 720,
            right: -160,
            top: -230,
            border: `1px solid ${dark ? "rgba(255,109,100,0.26)" : "rgba(255,109,100,0.32)"}`,
            borderRadius: "50%",
            boxShadow: `0 0 0 64px ${dark ? "rgba(255,109,100,0.035)" : "rgba(255,109,100,0.055)"}, 0 0 0 128px ${dark ? "rgba(255,109,100,0.02)" : "rgba(255,109,100,0.035)"}`,
          }}
        />
      ) : null}
    </>
  );
}

function CornerFrame({
  x,
  y,
  width,
  height,
  color = COLORS.coral,
  opacity = 1,
  scale = 1,
}: {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly color?: string;
  readonly opacity?: number;
  readonly scale?: number;
}) {
  const length = 34;
  const stroke = 5;
  const common: CSSProperties = { position: "absolute", backgroundColor: color, opacity };
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width,
        height,
        transform: `scale(${scale})`,
        transformOrigin: "center",
        pointerEvents: "none",
      }}
    >
      <div style={{ ...common, left: 0, top: 0, width: length, height: stroke }} />
      <div style={{ ...common, left: 0, top: 0, width: stroke, height: length }} />
      <div style={{ ...common, right: 0, top: 0, width: length, height: stroke }} />
      <div style={{ ...common, right: 0, top: 0, width: stroke, height: length }} />
      <div style={{ ...common, left: 0, bottom: 0, width: length, height: stroke }} />
      <div style={{ ...common, left: 0, bottom: 0, width: stroke, height: length }} />
      <div style={{ ...common, right: 0, bottom: 0, width: length, height: stroke }} />
      <div style={{ ...common, right: 0, bottom: 0, width: stroke, height: length }} />
    </div>
  );
}

function ImageCard({
  src,
  x,
  y,
  width,
  height,
  frame,
  delay = 0,
  rotate = 0,
  fromX = 0,
  fromY = 34,
  opacity = 1,
  objectPosition = "center",
  dark = false,
}: {
  readonly src: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly frame: number;
  readonly delay?: number;
  readonly rotate?: number;
  readonly fromX?: number;
  readonly fromY?: number;
  readonly opacity?: number;
  readonly objectPosition?: string;
  readonly dark?: boolean;
}) {
  const { fps } = useVideoConfig();
  const progress = enter(frame, delay, fps);
  const drift = interpolate(frame, [delay, delay + 160], [0, -8], { ...CLAMP, easing: EASE_IN_OUT });
  const left = interpolate(progress, [0, 1], [x + fromX, x]);
  const top = interpolate(progress, [0, 1], [y + fromY, y]);
  const rotation = interpolate(progress, [0, 1], [rotate + 3, rotate]) + drift * 0.08;
  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width,
        height,
        padding: 12,
        backgroundColor: dark ? COLORS.ink : COLORS.warm,
        border: `4px solid ${dark ? COLORS.warm : COLORS.ink}`,
        boxShadow: dark ? "14px 14px 0 rgba(255,255,255,0.22)" : "14px 14px 0 rgba(16,16,17,0.34)",
        transform: `rotate(${rotation}deg)`,
        opacity: progress * opacity,
        overflow: "hidden",
      }}
    >
      <Img
        src={staticFile(src)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition,
          display: "block",
          filter: dark ? "grayscale(0.72) contrast(1.14) brightness(0.82)" : "contrast(1.02) saturate(0.84)",
          transform: `translateY(${drift}px) scale(1.035)`,
        }}
      />
    </div>
  );
}

function Kicker({ children, light = false }: { readonly children: ReactNode; readonly light?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        color: light ? COLORS.warm : COLORS.ink,
        fontFamily: font,
        fontSize: 16,
        fontWeight: 700,
        letterSpacing: "0.13em",
        lineHeight: 1,
        textTransform: "uppercase",
      }}
    >
      <span style={{ width: 10, height: 10, backgroundColor: COLORS.coral, display: "block" }} />
      {children}
    </div>
  );
}

function Cursor({ x, y, scale = 1, opacity = 1, rotate = -12 }: { readonly x: number; readonly y: number; readonly scale?: number; readonly opacity?: number; readonly rotate?: number }) {
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: 48,
        height: 60,
        transform: `rotate(${rotate}deg) scale(${scale})`,
        transformOrigin: "12px 12px",
        opacity,
        filter: "drop-shadow(5px 6px 0 rgba(16,16,17,0.45))",
        zIndex: 30,
      }}
    >
      <svg viewBox="0 0 48 60" width="48" height="60">
        <path d="M5 3 9 48l12-10 8 18 7-4-8-18 15-2L5 3Z" fill={COLORS.warm} stroke={COLORS.ink} strokeWidth="4" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function Ripple({ x, y, frame, start, color = COLORS.coral }: { readonly x: number; readonly y: number; readonly frame: number; readonly start: number; readonly color?: string }) {
  const progress = interpolate(frame, [start, start + 36], [0, 1], { ...CLAMP, easing: EASE_OUT });
  const opacity = interpolate(frame, [start, start + 12, start + 36], [0, 0.78, 0], CLAMP);
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: x - 16,
          top: y - 16,
          width: 32,
          height: 32,
          borderRadius: "50%",
          border: `4px solid ${color}`,
          transform: `scale(${interpolate(progress, [0, 1], [0.6, 5.5])})`,
          opacity,
          zIndex: 28,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: x - 8,
          top: y - 8,
          width: 16,
          height: 16,
          borderRadius: "50%",
          backgroundColor: color,
          transform: `scale(${interpolate(progress, [0, 1], [1, 0.5])})`,
          opacity: interpolate(frame, [start, start + 8, start + 24], [0, 1, 0], CLAMP),
          zIndex: 29,
        }}
      />
    </>
  );
}

export const HookScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = fadeInOut(frame, 0, 168, 18);
  const reveal = enter(frame, 6, fps, { damping: 21, mass: 0.78, stiffness: 120 });
  const stripeX = interpolate(frame, [0, 38, 70], [-720, 1480, 2100], { ...CLAMP, easing: EASE_OUT });
  const wordX = interpolate(reveal, [0, 1], [-42, 0]);
  const screenshotX = interpolate(frame, [0, 168], [36, -18], { ...CLAMP, easing: EASE_IN_OUT });
  const chaos = interpolate(frame, [0, 72, 132, 168], [1, 1, 0.2, 0], CLAMP);

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.black, color: COLORS.warm, opacity, overflow: "hidden", fontFamily: font }}>
      <GridBackdrop dark accent />
      <Grain opacity={0.12} />

      <div style={{ position: "absolute", left: stripeX, top: -140, width: 180, height: 1420, backgroundColor: COLORS.coral, transform: "rotate(17deg)", opacity: 0.9 }} />
      <div style={{ position: "absolute", left: 86, top: 84, width: 1760, height: 1, backgroundColor: "rgba(255,250,241,0.23)" }} />
      <div style={{ position: "absolute", right: 96, top: 84, color: "rgba(255,250,241,0.7)", fontSize: 16, fontWeight: 600, letterSpacing: "0.12em" }}>VIRGUE / ACCOUNT MANAGER</div>

      <Img
        src={staticFile("account-desk.png")}
        style={{
          position: "absolute",
          left: 730 + screenshotX,
          top: 232,
          width: 1210,
          height: 770,
          objectFit: "cover",
          opacity: 0.25,
          filter: "grayscale(1) contrast(1.25) brightness(0.63)",
          transform: "rotate(-3deg) scale(1.07)",
          border: "4px solid rgba(255,250,241,0.38)",
        }}
      />

      <div style={{ position: "absolute", left: 98, top: 190, width: 820, transform: `translateX(${wordX}px)` }}>
        <Kicker light>Every launch starts here</Kicker>
        <div style={{ marginTop: 38, fontSize: 116, lineHeight: 0.86, fontWeight: 700, letterSpacing: "-0.075em", maxWidth: 790 }}>
          I know the<br />
          account<br />
          <span style={{ color: COLORS.coral }}>I want.</span>
        </div>
        <div style={{ marginTop: 34, maxWidth: 580, fontSize: 30, lineHeight: 1.12, color: "rgba(255,250,241,0.77)", fontWeight: 500 }}>
          I just lose it in all the windows.
        </div>
      </div>

      <div style={{ position: "absolute", left: 1060, top: 265, width: 520, opacity: chaos, transform: `rotate(${interpolate(frame, [0, 168], [-6, 2], CLAMP)}deg)` }}>
        <div style={{ color: COLORS.coral, fontSize: 18, fontWeight: 700, letterSpacing: "0.16em", marginBottom: 16 }}>THE SETUP LOOP</div>
        <div style={{ display: "grid", gap: 14 }}>
          {[
            ["wrong account", "Vurdith", "#ff6d64"],
            ["wrong game", "Sniper Duels", "#fffaf1"],
            ["another guess", "General / ?", "#ded7cc"],
          ].map(([label, value, color], index) => {
            const itemProgress = enter(frame, 18 + index * 12, fps, { damping: 16, mass: 0.54, stiffness: 180 });
            const itemX = interpolate(itemProgress, [0, 1], [250, 0]);
            return (
              <div key={label} style={{ transform: `translateX(${itemX}px) rotate(${(index - 1) * 2}deg)`, opacity: itemProgress, display: "flex", alignItems: "center", gap: 18 }}>
                <div style={{ width: 52, height: 52, display: "grid", placeItems: "center", backgroundColor: color, color: COLORS.ink, border: `3px solid ${COLORS.ink}`, fontSize: 22, fontWeight: 700 }}>×</div>
                <div style={{ padding: "17px 22px", width: 382, backgroundColor: index === 0 ? COLORS.coral : "rgba(255,250,241,0.92)", color: COLORS.ink, border: `4px solid ${COLORS.ink}`, boxShadow: "8px 8px 0 rgba(255,250,241,0.2)" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.62 }}>{label}</div>
                  <div style={{ marginTop: 5, fontSize: 28, fontWeight: 700, letterSpacing: "-0.04em" }}>{value}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ position: "absolute", left: 88, bottom: 74, display: "flex", alignItems: "center", gap: 16, color: "rgba(255,250,241,0.5)", fontSize: 16, fontWeight: 600, letterSpacing: "0.1em" }}>
        <span style={{ width: 82, height: 4, backgroundColor: COLORS.coral }} />
        <span>THE PRE-GAME GRIND</span>
      </div>
    </AbsoluteFill>
  );
};

type SystemNodeProps = {
  readonly x: number;
  readonly y: number;
  readonly title: string;
  readonly detail: string;
  readonly index: string;
  readonly src: string;
  readonly frame: number;
  readonly delay: number;
};

function SystemNode({ x, y, title, detail, index, src, frame, delay }: SystemNodeProps) {
  const { fps } = useVideoConfig();
  const p = enter(frame, delay, fps, { damping: 19, mass: 0.7, stiffness: 130 });
  const yOffset = interpolate(p, [0, 1], [90, 0]);
  const spin = interpolate(p, [0, 1], [index === "02" ? 4 : -4, 0]);
  return (
    <div style={{ position: "absolute", left: x, top: y + yOffset, width: 480, opacity: p, transform: `rotate(${spin}deg)` }}>
      <div style={{ position: "absolute", left: 26, top: 30, width: 406, height: 330, backgroundColor: COLORS.coral, transform: "rotate(-4deg)" }} />
      <div style={{ position: "relative", padding: 20, height: 360, backgroundColor: COLORS.warm, border: `4px solid ${COLORS.ink}`, boxShadow: "14px 14px 0 rgba(16,16,17,0.22)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: COLORS.ink }}>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "0.14em" }}>{index}</div>
          <div style={{ width: 42, height: 42, border: `3px solid ${COLORS.ink}`, display: "grid", placeItems: "center", fontSize: 20, fontWeight: 700 }}>+</div>
        </div>
        <div style={{ marginTop: 16, overflow: "hidden", height: 194, border: `3px solid ${COLORS.ink}` }}>
          <Img src={staticFile(src)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center", display: "block", filter: "contrast(1.03) saturate(0.72)" }} />
        </div>
        <div style={{ marginTop: 15, fontSize: 36, fontWeight: 700, letterSpacing: "-0.06em" }}>{title}</div>
        <div style={{ marginTop: 3, fontSize: 17, color: "rgba(16,16,17,0.62)", fontWeight: 500 }}>{detail}</div>
      </div>
    </div>
  );
}

export const SystemScene: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = fadeInOut(frame, 0, 190, 12);
  const lineProgress = interpolate(frame, [30, 100], [0, 1], { ...CLAMP, easing: EASE_OUT });
  const sweep = interpolate(frame, [0, 190], [-120, 40], { ...CLAMP, easing: EASE_IN_OUT });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.paper, color: COLORS.ink, opacity, overflow: "hidden", fontFamily: font }}>
      <GridBackdrop dark={false} />
      <Grain dark opacity={0.1} />
      <div style={{ position: "absolute", left: -140 + sweep, bottom: -340, width: 720, height: 720, border: `2px solid ${COLORS.coral}`, borderRadius: "50%", opacity: 0.62 }} />

      <div style={{ position: "absolute", left: 110, top: 92 }}>
        <Kicker>Stop rebuilding the setup</Kicker>
        <div style={{ marginTop: 28, fontSize: 76, lineHeight: 0.94, fontWeight: 700, letterSpacing: "-0.07em" }}>The setup finally<br />makes sense.</div>
      </div>
      <div style={{ position: "absolute", right: 110, top: 112, maxWidth: 420, fontSize: 23, lineHeight: 1.15, color: "rgba(16,16,17,0.58)", fontWeight: 500, textAlign: "right" }}>
        Accounts, games, and sessions — without the tab maze.
      </div>

      <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <path d="M 560 570 C 700 570, 690 520, 760 520 S 850 570, 930 570" fill="none" stroke={COLORS.ink} strokeWidth="5" strokeDasharray="420" strokeDashoffset={420 - lineProgress * 420} />
        <path d="M 990 570 C 1110 570, 1120 520, 1190 520 S 1290 570, 1360 570" fill="none" stroke={COLORS.ink} strokeWidth="5" strokeDasharray="420" strokeDashoffset={420 - Math.max(0, lineProgress - 0.25) * 420} />
        {[560, 960, 1360].map((x) => <circle key={x} cx={x} cy="570" r="10" fill={COLORS.coral} stroke={COLORS.ink} strokeWidth="4" />)}
      </svg>

      <SystemNode x={106} y={420} title="Accounts" detail="Every profile, where you need it." index="01" src="account-desk.png" frame={frame} delay={8} />
      <SystemNode x={720} y={420} title="Games" detail="Collections that actually mean something." index="02" src="game-shelf.png" frame={frame} delay={22} />
      <SystemNode x={1334} y={420} title="Sessions" detail="See what is running before you click." index="03" src="session-board.png" frame={frame} delay={36} />

      <div style={{ position: "absolute", left: 110, bottom: 70, fontSize: 18, fontWeight: 700, letterSpacing: "0.1em" }}>ONE WORKSPACE / ZERO GUESSWORK</div>
      <div style={{ position: "absolute", right: 110, bottom: 70, color: COLORS.coralDark, fontSize: 18, fontWeight: 700, letterSpacing: "0.1em" }}>VIRGUE.</div>
    </AbsoluteFill>
  );
};

function FocusLabel({ x, y, text, opacity, scale = 1 }: { readonly x: number; readonly y: number; readonly text: string; readonly opacity: number; readonly scale?: number }) {
  return (
    <div style={{ position: "absolute", left: x, top: y, display: "flex", alignItems: "center", gap: 10, opacity, transform: `scale(${scale})`, transformOrigin: "left center", fontSize: 15, fontWeight: 700, letterSpacing: "0.12em", color: COLORS.coral }}>
      <span style={{ width: 12, height: 12, borderRadius: "50%", backgroundColor: COLORS.coral, boxShadow: `0 0 0 8px rgba(255,109,100,0.2)` }} />
      {text}
    </div>
  );
}

export const ChooseScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = fadeInOut(frame, 0, 202, 12);
  const leftFocus = interpolate(frame, [20, 40, 88, 108], [0, 1, 1, 0], CLAMP);
  const rightFocus = interpolate(frame, [84, 112, 158, 180], [0, 1, 1, 0], CLAMP);
  const lineProgress = interpolate(frame, [28, 158], [0, 1], { ...CLAMP, easing: EASE_IN_OUT });
  const cursorX = interpolate(frame, [24, 88, 126, 168], [300, 580, 1110, 1408], { ...CLAMP, easing: EASE_IN_OUT });
  const cursorY = interpolate(frame, [24, 88, 126, 168], [642, 552, 638, 528], { ...CLAMP, easing: EASE_IN_OUT });
  const cursorScale = interpolate(frame, [112, 122, 136], [1, 0.78, 1], { ...CLAMP, easing: EASE_OUT });
  const sceneIntro = enter(frame, 5, fps, { damping: 20, mass: 0.8, stiffness: 120 });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.black, color: COLORS.warm, opacity, overflow: "hidden", fontFamily: font }}>
      <GridBackdrop dark accent />
      <Grain opacity={0.13} />
      <div style={{ position: "absolute", left: 108, top: 86 }}>
        <Kicker light>Make the choice once</Kicker>
        <div style={{ marginTop: 30, fontSize: 86, lineHeight: 0.92, letterSpacing: "-0.075em", fontWeight: 700 }}>Pick the<br /><span style={{ color: COLORS.coral }}>setup.</span></div>
      </div>
      <div style={{ position: "absolute", right: 110, top: 102, color: "rgba(255,250,241,0.64)", fontSize: 22, lineHeight: 1.14, textAlign: "right", maxWidth: 390 }}>The right account.<br />The right game.<br />The right place to start.</div>

      <div style={{ position: "absolute", left: 110, top: 352, width: 740, height: 450, transform: `translateY(${interpolate(sceneIntro, [0, 1], [58, 0])}px)` }}>
        <ImageCard src="account-desk.png" x={0} y={0} width={740} height={450} frame={frame} delay={5} rotate={-1.8} fromY={58} dark />
        <FocusLabel x={28} y={420} text="ACCOUNT / VURDITH" opacity={leftFocus} scale={interpolate(leftFocus, [0, 1], [0.9, 1])} />
        <CornerFrame x={22} y={22} width={696} height={406} opacity={leftFocus} />
      </div>
      <div style={{ position: "absolute", left: 1070, top: 352, width: 740, height: 450, transform: `translateY(${interpolate(sceneIntro, [0, 1], [88, 0])}px)` }}>
        <ImageCard src="game-shelf.png" x={0} y={0} width={740} height={450} frame={frame} delay={18} rotate={1.8} fromY={72} dark />
        <FocusLabel x={28} y={420} text="GAME / SNIPER DUELS" opacity={rightFocus} scale={interpolate(rightFocus, [0, 1], [0.9, 1])} />
        <CornerFrame x={22} y={22} width={696} height={406} opacity={rightFocus} />
      </div>

      <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <path d="M 480 628 C 720 628, 775 744, 960 744 S 1220 628, 1440 628" fill="none" stroke={COLORS.coral} strokeWidth="6" strokeDasharray="1200" strokeDashoffset={1200 - lineProgress * 1200} />
        <circle cx="480" cy="628" r="12" fill={COLORS.coral} />
        <circle cx="1440" cy="628" r="12" fill={COLORS.coral} />
      </svg>

      <div style={{ position: "absolute", left: 742, top: 852, width: 440, textAlign: "center", color: "rgba(255,250,241,0.65)", fontSize: 18, fontWeight: 600, letterSpacing: "0.12em" }}>ACCOUNT → GAME → SESSION</div>
      <Cursor x={cursorX} y={cursorY} scale={cursorScale} opacity={interpolate(frame, [12, 32, 180, 202], [0, 1, 1, 0], CLAMP)} />
      <Ripple x={cursorX + 12} y={cursorY + 14} frame={frame} start={122} />
    </AbsoluteFill>
  );
};

function LaunchButton({ frame, start }: { readonly frame: number; readonly start: number }) {
  const { fps } = useVideoConfig();
  const p = enter(frame, start, fps, { damping: 17, mass: 0.6, stiffness: 180 });
  const clicked = interpolate(frame, [start + 48, start + 54, start + 66], [1, 0.92, 1], { ...CLAMP, easing: EASE_OUT });
  return (
    <div style={{ position: "absolute", left: 1098, top: 640, width: 490, transform: `translateY(${interpolate(p, [0, 1], [36, 0])}px) scale(${clicked})`, opacity: p }}>
      <div style={{ position: "absolute", left: 14, top: 14, width: "100%", height: "100%", backgroundColor: COLORS.ink }} />
      <div style={{ position: "relative", padding: "26px 30px", display: "flex", alignItems: "center", justifyContent: "space-between", backgroundColor: COLORS.warm, border: `4px solid ${COLORS.ink}`, color: COLORS.ink }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.15em", opacity: 0.6 }}>READY WHEN YOU ARE</div>
          <div style={{ marginTop: 4, fontSize: 34, fontWeight: 700, letterSpacing: "-0.06em" }}>Launch Roblox</div>
        </div>
        <div style={{ width: 58, height: 58, display: "grid", placeItems: "center", backgroundColor: COLORS.coral, border: `3px solid ${COLORS.ink}`, fontSize: 28, fontWeight: 700 }}>↗</div>
      </div>
    </div>
  );
}

export const LaunchScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = fadeInOut(frame, 0, 180, 12);
  const intro = enter(frame, 0, fps, { damping: 20, mass: 0.82, stiffness: 110 });
  const wipe = interpolate(frame, [0, 42, 84], [-500, 660, 2360], { ...CLAMP, easing: EASE_OUT });
  const ghostX = interpolate(frame, [0, 180], [0, -210], { ...CLAMP, easing: EASE_IN_OUT });
  const launchOpacity = interpolate(frame, [34, 54, 160, 180], [0, 1, 1, 0], CLAMP);

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.coral, color: COLORS.ink, opacity, overflow: "hidden", fontFamily: font }}>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 78% 45%, rgba(255,250,241,0.3), transparent 34%), #ff6d64" }} />
      <div style={{ position: "absolute", left: -180, top: -160, width: 1320, height: 1320, borderRadius: "50%", border: `3px solid rgba(16,16,17,0.16)`, boxShadow: "0 0 0 70px rgba(16,16,17,0.035), 0 0 0 140px rgba(16,16,17,0.025)" }} />
      <Grain dark opacity={0.1} />

      <div style={{ position: "absolute", left: 112 + ghostX, top: 165, fontSize: 236, lineHeight: 0.75, fontWeight: 700, letterSpacing: "-0.1em", color: "rgba(16,16,17,0.13)", whiteSpace: "nowrap" }}>LAUNCH</div>
      <div style={{ position: "absolute", left: 116, top: 118, opacity: interpolate(frame, [0, 20, 154, 180], [0, 1, 1, 0], CLAMP) }}>
        <Kicker>Leave the setup behind</Kicker>
        <div style={{ marginTop: 30, fontSize: 82, lineHeight: 0.92, fontWeight: 700, letterSpacing: "-0.08em" }}>One choice.<br />One click.</div>
        <div style={{ marginTop: 28, maxWidth: 410, fontSize: 24, lineHeight: 1.15, color: "rgba(16,16,17,0.62)", fontWeight: 500 }}>The launch is the easy part now.</div>
      </div>

      <div style={{ position: "absolute", left: 1024, top: 160, width: 760, height: 650, opacity: launchOpacity, transform: `translateY(${interpolate(intro, [0, 1], [92, 0])}px) rotate(2.5deg)` }}>
        <div style={{ position: "absolute", left: 22, top: 22, width: "100%", height: "100%", backgroundColor: COLORS.ink }} />
        <div style={{ position: "relative", width: "100%", height: "100%", backgroundColor: COLORS.warm, border: `4px solid ${COLORS.ink}`, overflow: "hidden" }}>
          <Img src={staticFile("account-desk.png")} style={{ position: "absolute", left: -50, top: -74, width: 1020, height: 650, objectFit: "cover", opacity: 0.3, filter: "grayscale(1) contrast(1.16)" }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(255,250,241,0.86), rgba(255,250,241,0.18))" }} />
          <div style={{ position: "absolute", left: 48, top: 48, fontSize: 18, fontWeight: 700, letterSpacing: "0.13em" }}>VURDITH / SNIPER DUELS</div>
          <div style={{ position: "absolute", left: 48, top: 118, fontSize: 68, lineHeight: 0.9, fontWeight: 700, letterSpacing: "-0.08em" }}>The right<br /><span style={{ color: COLORS.coralDark }}>door.</span></div>
          <div style={{ position: "absolute", left: 48, bottom: 58, color: "rgba(16,16,17,0.62)", fontSize: 19, fontWeight: 600 }}>General / authenticated session</div>
        </div>
      </div>
      <LaunchButton frame={frame} start={40} />
      <Cursor x={1538} y={706} scale={interpolate(frame, [76, 110, 122], [0.9, 1, 0.76], { ...CLAMP, easing: EASE_OUT })} opacity={interpolate(frame, [60, 84, 145, 180], [0, 1, 1, 0], CLAMP)} rotate={-18} />
      <Ripple x={1552} y={722} frame={frame} start={120} color={COLORS.ink} />
      <div style={{ position: "absolute", left: wipe, top: -260, width: 180, height: 1420, backgroundColor: COLORS.warm, opacity: 0.75, transform: "rotate(17deg)" }} />
    </AbsoluteFill>
  );
};

export const OutroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = fadeInOut(frame, 0, 132, 18);
  const p = enter(frame, 6, fps, { damping: 18, mass: 0.7, stiffness: 130 });
  const iconScale = interpolate(p, [0, 1], [0.5, 1]);
  const barX = interpolate(frame, [0, 42, 132], [-420, 110, 110], { ...CLAMP, easing: EASE_OUT });
  const barOpacity = interpolate(frame, [0, 18, 108, 132], [0, 1, 1, 0], CLAMP);

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.black, color: COLORS.warm, opacity, overflow: "hidden", fontFamily: font, alignItems: "center", justifyContent: "center" }}>
      <GridBackdrop dark accent />
      <Grain opacity={0.13} />
      <div style={{ position: "absolute", left: barX, top: 116, width: 1700, height: 5, backgroundColor: COLORS.coral, opacity: barOpacity }} />
      <div style={{ position: "relative", width: 760, textAlign: "center", transform: `translateY(${interpolate(p, [0, 1], [30, 0])}px)` }}>
        <Img src={staticFile("virgue-icon.png")} style={{ width: 110, height: 110, objectFit: "contain", transform: `scale(${iconScale})`, filter: "drop-shadow(10px 10px 0 rgba(255,109,100,0.35))" }} />
        <div style={{ marginTop: 24, fontSize: 112, lineHeight: 0.86, fontWeight: 700, letterSpacing: "-0.09em" }}>Virgue.</div>
        <div style={{ marginTop: 28, color: "rgba(255,250,241,0.78)", fontSize: 32, lineHeight: 1.08, fontWeight: 500 }}>Less setup. More playing.</div>
        <div style={{ marginTop: 48, display: "inline-flex", alignItems: "center", gap: 14, color: COLORS.coral, fontSize: 16, fontWeight: 700, letterSpacing: "0.14em" }}>
          <span style={{ width: 48, height: 3, backgroundColor: COLORS.coral }} />
          ROBLOX ACCOUNT MANAGER
          <span style={{ width: 48, height: 3, backgroundColor: COLORS.coral }} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
