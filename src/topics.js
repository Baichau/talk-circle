import catalog from "./topics.json";
import questionBank from "./questions.json";

export const CATS = catalog.map((category) => ({
  n: category.name,
  e: category.emoji,
  h: category.hue,
}));
export const TOPICS = catalog.flatMap((category, ci) =>
  category.topics.map((name) => ({
    name,
    cat: category.name,
    ci,
    e: category.emoji,
    h: category.hue,
  })),
);

export const questionsFor = (i) => {
  const t = TOPICS[i]; if (!t) return [];
  return questionBank[t.name] || [];
};
