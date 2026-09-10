import { makeMotionScene, type MotionScene } from "./motion-engine";

// Copy is illustrative brand language. Dates, prices, schedules and class facts
// come from the user's verified records, never from a preset.
export const SCENE_PRESETS = [
  { id: "hello", name: "Photo opener", note: "A big photo. A few words.", photo: true, values: { template: "image", title: "Your time.\nWell spent.", subtitle: "SUN OAKS · REDDING", kicker: "", styleId: "oak", logoStyle: "wordmark", position: "bottom-left", animation: "stagger", duration: 5000 } },
  { id: "energy", name: "Big energy", note: "Bold color + an oversized oak.", photo: false, values: { template: "statement", title: "Find your\nsunny side.", subtitle: "A little movement. A little you time.", kicker: "MAKE ROOM FOR YOU", styleId: "sun", logoStyle: "emblem", position: "bottom-left", animation: "rise", duration: 4000 } },
  { id: "pool", name: "Poolside moment", note: "Soft motion, cool blues.", photo: true, values: { template: "image", title: "Life looks\nbetter poolside.", subtitle: "Make a little space to unwind.", kicker: "SUN OAKS", styleId: "pool", logoStyle: "wordmark", position: "bottom-left", animation: "fade", duration: 5000 } },
  { id: "class", name: "Class spotlight", note: "Make your next class the star.", photo: true, values: { template: "image", title: "Find your\nnext favorite.", subtitle: "Explore classes at Sun Oaks.", kicker: "LET’S MOVE", styleId: "clay", logoStyle: "wordmark", position: "center-left", animation: "wipe", duration: 5000 } },
  { id: "pause", name: "Take a breath", note: "A calmer beat between scenes.", photo: false, values: { template: "statement", title: "Breathe in.\nFind your pace.", subtitle: "Make this moment yours.", kicker: "A LITTLE RESET", styleId: "mint", logoStyle: "emblem", position: "bottom-left", animation: "fade", duration: 4500 } },
  { id: "together", name: "Better together", note: "A warm invitation to the club.", photo: true, values: { template: "image", title: "Good company.\nGreat energy.", subtitle: "Meet you at Sun Oaks.", kicker: "YOUR PEOPLE. YOUR PLACE.", styleId: "cream", logoStyle: "wordmark", position: "bottom-center", animation: "scale", duration: 4500 } },
  { id: "invitation", name: "The invitation", note: "Simple type with a strong finish.", photo: false, values: { template: "endcard", title: "Make time\nfor yourself.", subtitle: "Discover Sun Oaks.", kicker: "", styleId: "night", logoStyle: "wordmark", position: "center", animation: "stagger", duration: 3500 } },
  { id: "ending", name: "Oak sign-off", note: "A sunny, unmistakable ending.", photo: false, values: { template: "endcard", title: "See you\nat Sun Oaks.", subtitle: "Your time. Well spent.", kicker: "", styleId: "sun", logoStyle: "emblem", position: "bottom-left", animation: "scale", duration: 3500 } },
] as const;

export type ScenePresetId = typeof SCENE_PRESETS[number]["id"];
export function sceneFromPreset(id: ScenePresetId, imageId: string | null = null): MotionScene {
  const preset = SCENE_PRESETS.find((item) => item.id === id) || SCENE_PRESETS[0];
  return makeMotionScene(preset.values.template, { ...preset.values, imageId: preset.photo ? imageId : null, shade: .5, zoom: true, transition: "fade" });
}
