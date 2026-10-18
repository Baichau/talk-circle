import catalog from "./topics.json";

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

// Your own questions: add an entry by topic name and it replaces the generated ones.
export const CUSTOM = {
  // Travel: ["What place would you never visit again?", "..."],
};
const FRAMES = [
  "What is your earliest memory connected to {t}?", "Tell us about a time {t} surprised you.",
  "What do most people get wrong about {t}?", "How has {t} changed in your lifetime?",
  "Would your life be better with more or less {t}? Why?", "What would you teach a child about {t}?",
  "Defend an unpopular opinion about {t}.", "What is the best thing about {t}?",
  "What is the worst thing about {t}?", "Who do you know that is really into {t}?",
  "How is {t} different in your country compared with others?", "If you could change one thing about {t}, what would it be?",
  "Describe a perfect day that involves {t}.", "What does {t} say about a person?",
  "Will {t} matter more or less in twenty years?", "What would you ask a stranger about {t}?",
  "What is a common mistake people make with {t}?", "How do you feel when someone brings up {t}?",
  "Explain {t} to someone from another planet.", "Is {t} overrated or underrated? Why?",
];
export const questionsFor = (i) => {
  const t = TOPICS[i]; if (!t) return [];
  return CUSTOM[t.name] || FRAMES.map((f) => f.replace("{t}", t.name.toLowerCase()));
};
