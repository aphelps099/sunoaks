// The same styles drive the canvas, scene gallery, stills, and video exports.
export const SCENE_STYLES = [
  { id: "oak", name: "Deep oak", background: "#102E32", ink: "#FFFFFF", accent: "#F7B500", photoAccent: "#F7B500" },
  { id: "sun", name: "Sunshine", background: "#F7B500", ink: "#102E32", accent: "#FFFFFF", photoAccent: "#FFE39C" },
  { id: "pool", name: "Pool blue", background: "#007A8C", ink: "#FFFFFF", accent: "#C5F3ED", photoAccent: "#C5F3ED" },
  { id: "mint", name: "Fresh mint", background: "#C5DDD0", ink: "#102E32", accent: "#38745D", photoAccent: "#C5DDD0" },
  { id: "cream", name: "Warm cream", background: "#F6F0E3", ink: "#102E32", accent: "#A76B00", photoAccent: "#F6F0E3" },
  { id: "clay", name: "Terracotta", background: "#A8452E", ink: "#FFFFFF", accent: "#FFD5B2", photoAccent: "#FFD5B2" },
  { id: "night", name: "After hours", background: "#252833", ink: "#FFFFFF", accent: "#B9C3FF", photoAccent: "#B9C3FF" },
  { id: "white", name: "Clean white", background: "#FFFFFF", ink: "#102E32", accent: "#007A8C", photoAccent: "#FFFFFF" },
] as const;

export type SceneStyleId = typeof SCENE_STYLES[number]["id"];
export type LogoStyle = "emblem" | "wordmark";
export const sceneStyle = (id?: string, endcard = false) => SCENE_STYLES.find((style) => style.id === id) || SCENE_STYLES[endcard ? 1 : 0];
