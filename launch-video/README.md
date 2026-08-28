# Virgue launch trailer

This Remotion project renders the 36-second launch trailer for Virgue's Roblox Account Manager.

## Preview and render

\`\`\`powershell
npm run lint
npx remotion studio --no-open
npx remotion render VirgueLaunchTrailer out/virgue-launch-trailer.mp4
\`\`\`

The composition uses captured footage from the real Account Desk, Game Shelf, Session Board, and Settings views, plus a generated low-level ambient bed. It currently has no voiceover; the timing is in [voiceover-script.md](voiceover-script.md).

## Add the voiceover later

Copy the recorded file to \`public/voiceover.mp3\`, then render:

\`\`\`powershell
npx remotion render VirgueLaunchTrailer out/virgue-launch-trailer-vo.mp4 --props='{"voiceoverSrc":"voiceover.mp3"}'
\`\`\`

The MP3 is mixed at full level while the ambient bed stays underneath it.

## Regenerate the ambient bed

\`\`\`powershell
node scripts/generate-ambient-bed.mjs
\`\`\`
