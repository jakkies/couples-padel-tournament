import bundledSnapshot from "./behind-scenes-snapshot.js";

// Series news is bundled until an official PlayPadel social feed is supplied.
export async function loadBehindScenes() {
  return { ...bundledSnapshot, isBundledSnapshot: true };
}
