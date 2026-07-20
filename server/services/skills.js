// Curated skills vocabulary + a light synonym map, used both to extract
// skills from a job description and to compare against user_profile.skills.
// Extend this list as you tailor the engine to your own resume/target roles.

const SKILLS_VOCAB = [
  "javascript", "typescript", "python", "java", "c++", "c#", "go", "rust",
  "react", "react.js", "next.js", "vue", "angular", "node.js", "express",
  "fastapi", "django", "flask", "spring boot",
  "postgresql", "mysql", "mongodb", "redis", "elasticsearch",
  "docker", "kubernetes", "aws", "gcp", "azure", "terraform",
  "graphql", "rest api", "microservices", "websockets",
  "git", "ci/cd", "jenkins", "github actions",
  "machine learning", "ml", "deep learning", "nlp", "tensorflow", "pytorch",
  "html", "css", "tailwind", "sass",
  "playwright", "selenium", "puppeteer",
  "system design", "data structures", "algorithms",
];

const SYNONYMS = {
  ml: "machine learning",
  "react.js": "react",
  "vue.js": "vue",
  reactjs: "react",
  nodejs: "node.js",
  postgres: "postgresql",
  k8s: "kubernetes",
};

function canonicalize(term) {
  const t = term.toLowerCase().trim();
  return SYNONYMS[t] || t;
}

function extractSkills(text = "") {
  const lower = text.toLowerCase();
  const found = new Set();
  for (const skill of SKILLS_VOCAB) {
    if (lower.includes(skill)) found.add(canonicalize(skill));
  }
  return Array.from(found);
}

module.exports = { SKILLS_VOCAB, extractSkills, canonicalize };
