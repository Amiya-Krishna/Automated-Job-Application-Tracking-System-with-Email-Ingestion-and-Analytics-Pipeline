// Curated skill taxonomy used for deterministic JD<->resume matching.
//
// Why a curated taxonomy instead of "ask the LLM what the skills are":
//   * matching must be reproducible and auditable (same input -> same result)
//   * a term is only ever considered "present" if it literally appears in the
//     user's own text (or is a listed alias of a term that does)
//   * boundary-aware matching avoids the classic substring bugs ("go" in
//     "going", "java" in "javascript", "ml" in "html")
//
// Alias syntax:  "foo"   case-insensitive, whole-word
//                "=Foo"  case-sensitive, whole-word (ambiguous English words)
//                "~Go"   case-sensitive AND only in list-like context
//                        (e.g. "Python, Go, Rust"), never in prose
//
// Relations (used ONLY to produce PARTIAL_MATCH, never to claim a skill):
//   implies: having THIS entry strongly suggests these (Next.js -> React)
//   family : same interchangeable-ish category (AWS / GCP / Azure)

const { TAXONOMY_VERSION } = require("./constants");

// [id, displayName, aliases[], { family, implies[] }]
const RAW = [
  // ---- languages
  ["javascript", "JavaScript", ["=JS", "ecmascript", "es6", "es2015"], { family: "language:web" }],
  ["typescript", "TypeScript", ["=TS"], { family: "language:web", implies: ["javascript"] }],
  ["python", "Python", ["python3"], { family: "language:python" }],
  ["java", "Java", [], { family: "language:jvm" }],
  ["kotlin", "Kotlin", [], { family: "language:jvm" }],
  ["scala", "Scala", ["=Scala"], { family: "language:jvm" }],
  ["c", "C", ["~C"], { family: "language:c" }],
  ["cpp", "C++", ["cpp", "c plus plus"], { family: "language:c" }],
  ["csharp", "C#", ["c sharp", "csharp"], { family: "language:dotnet" }],
  ["go", "Go", ["golang", "~Go"], { family: "language:go" }],
  ["rust", "Rust", ["=Rust"], { family: "language:rust" }],
  ["swift", "Swift", ["=Swift"], { family: "language:apple" }],
  ["php", "PHP", [], { family: "language:php" }],
  ["ruby", "Ruby", ["=Ruby"], { family: "language:ruby" }],
  ["dart", "Dart", ["=Dart"], { family: "language:dart" }],
  ["r", "R", ["~R"], { family: "language:r" }],
  ["sql", "SQL", ["structured query language"], { family: "language:sql" }],
  ["bash", "Bash", ["shell scripting", "shell script", "bash scripting"], {}],
  ["matlab", "MATLAB", [], {}],

  // ---- frontend
  ["react", "React", ["react.js", "reactjs"], { family: "frontend-framework", implies: ["javascript"] }],
  ["nextjs", "Next.js", ["nextjs", "next js"], { family: "frontend-framework", implies: ["react"] }],
  ["vue", "Vue", ["vue.js", "vuejs"], { family: "frontend-framework", implies: ["javascript"] }],
  ["nuxt", "Nuxt", ["nuxt.js", "nuxtjs"], { family: "frontend-framework", implies: ["vue"] }],
  ["angular", "Angular", ["angularjs", "angular.js"], { family: "frontend-framework", implies: ["typescript"] }],
  ["svelte", "Svelte", ["sveltekit"], { family: "frontend-framework", implies: ["javascript"] }],
  ["redux", "Redux", ["redux toolkit"], { implies: ["react"] }],
  ["html", "HTML", ["html5"], { family: "markup" }],
  ["css", "CSS", ["css3"], { family: "markup" }],
  ["sass", "Sass", ["scss"], { implies: ["css"] }],
  ["tailwind", "Tailwind CSS", ["tailwind", "tailwindcss"], { implies: ["css"] }],
  ["bootstrap", "Bootstrap", [], { implies: ["css"] }],
  ["jquery", "jQuery", [], { implies: ["javascript"] }],
  ["webpack", "Webpack", [], {}],
  ["vite", "Vite", [], {}],
  ["react-native", "React Native", ["reactnative"], { family: "mobile", implies: ["react"] }],
  ["flutter", "Flutter", [], { family: "mobile", implies: ["dart"] }],
  ["expo", "Expo", [], { implies: ["react-native"] }],
  ["responsive-design", "Responsive Design", ["responsive web design", "responsive layouts", "responsive ui"], {}],

  // ---- backend
  ["nodejs", "Node.js", ["node", "nodejs", "node js"], { family: "js-backend", implies: ["javascript"] }],
  ["express", "Express", ["express.js", "expressjs", "~Express"], { family: "js-backend", implies: ["nodejs"] }],
  ["nestjs", "NestJS", ["nest.js"], { family: "js-backend", implies: ["nodejs", "typescript"] }],
  ["django", "Django", [], { family: "py-backend", implies: ["python"] }],
  ["flask", "Flask", [], { family: "py-backend", implies: ["python"] }],
  ["fastapi", "FastAPI", ["fast api"], { family: "py-backend", implies: ["python"] }],
  ["spring", "Spring Boot", ["spring boot", "springboot", "spring framework", "spring mvc", "spring security"], { family: "java-backend", implies: ["java"] }],
  ["dotnet", ".NET", ["dotnet", "asp.net", "asp.net core", ".net core"], { family: "language:dotnet" }],
  ["laravel", "Laravel", [], { family: "php-backend", implies: ["php"] }],
  ["rails", "Ruby on Rails", ["rails", "ror"], { implies: ["ruby"] }],
  ["graphql", "GraphQL", ["graph ql"], { family: "api-style" }],
  ["rest", "REST APIs", ["rest api", "rest apis", "restful", "restful api", "restful apis", "restful services", "rest services", "rest endpoints", "=REST"], { family: "api-style", implies: ["api-design"] }],
  ["grpc", "gRPC", [], { family: "api-style" }],
  ["websockets", "WebSockets", ["websocket", "web sockets"], {}],
  ["socketio", "Socket.IO", ["socket.io"], { implies: ["websockets"] }],
  ["microservices", "Microservices", ["microservice", "micro-services", "microservice architecture"], {}],
  ["jwt", "JWT", ["json web token", "json web tokens"], { family: "auth" }],
  ["oauth", "OAuth", ["oauth2", "oauth 2.0"], { family: "auth" }],
  ["authentication", "Authentication", ["authn", "user authentication", "auth flows"], { family: "auth" }],
  ["api-design", "API Design", ["api development", "apis", "api integration", "web services"], {}],

  // ---- data stores
  ["postgresql", "PostgreSQL", ["postgres", "psql", "postgre sql"], { family: "sql-db", implies: ["sql"] }],
  ["mariadb", "MariaDB", [], { family: "sql-db", implies: ["sql"] }],
  ["mysql", "MySQL", ["my sql"], { family: "sql-db", implies: ["sql"] }],
  ["sqlite", "SQLite", [], { family: "sql-db", implies: ["sql"] }],
  ["sqlserver", "SQL Server", ["mssql", "microsoft sql server", "ms sql"], { family: "sql-db", implies: ["sql"] }],
  ["oracle", "Oracle", ["oracle db", "oracle database", "pl/sql"], { family: "sql-db", implies: ["sql"] }],
  ["mongodb", "MongoDB", ["mongo", "mongo db"], { family: "nosql-db" }],
  ["dynamodb", "DynamoDB", ["dynamo db"], { family: "nosql-db", implies: ["aws"] }],
  ["firebase", "Firebase", [], { family: "nosql-db" }],
  ["firestore", "Firestore", ["cloud firestore"], { family: "nosql-db", implies: ["firebase"] }],
  ["cassandra", "Cassandra", [], { family: "nosql-db" }],
  ["redis", "Redis", [], { family: "cache-queue" }],
  ["elasticsearch", "Elasticsearch", ["elastic search"], { family: "search" }],
  ["opensearch", "OpenSearch", [], { family: "search" }],
  ["prisma", "Prisma", ["prisma orm"], { family: "orm" }],
  ["sequelize", "Sequelize", [], { family: "orm" }],
  ["mongoose", "Mongoose", [], { family: "orm", implies: ["mongodb"] }],
  ["sqlalchemy", "SQLAlchemy", [], { family: "orm", implies: ["python"] }],
  ["database-design", "Database Design", ["schema design", "data modeling", "data modelling", "database schema"], {}],

  // ---- cloud / devops
  ["aws", "AWS", ["amazon web services", "aws cloud"], { family: "cloud", implies: ["cloud"] }],
  ["ec2", "EC2", ["aws ec2", "amazon ec2"], { family: "cloud", implies: ["aws"] }],
  ["s3", "S3", ["aws s3", "amazon s3"], { family: "cloud", implies: ["aws"] }],
  ["gcp", "GCP", ["google cloud", "google cloud platform"], { family: "cloud", implies: ["cloud"] }],
  ["azure", "Azure", ["microsoft azure"], { family: "cloud", implies: ["cloud"] }],
  ["cloud", "Cloud", ["cloud computing", "cloud platforms", "cloud platform", "cloud services", "cloud infrastructure", "cloud deployment", "cloud-native", "cloud native"], { family: "cloud" }],
  ["heroku", "Heroku", [], { family: "cloud", implies: ["cloud"] }],
  ["vercel", "Vercel", [], { family: "cloud", implies: ["cloud"] }],
  ["netlify", "Netlify", [], { family: "cloud", implies: ["cloud"] }],
  ["containerization", "Containerization", ["containerisation", "containers", "container-based"], { family: "containers" }],
  ["docker", "Docker", ["dockerfile", "docker compose", "docker-compose"], { family: "containers", implies: ["containerization"] }],
  ["kubernetes", "Kubernetes", ["k8s"], { family: "containers", implies: ["containerization"] }],
  ["iac", "Infrastructure as Code", ["iac"], { family: "iac" }],
  ["terraform", "Terraform", [], { family: "iac", implies: ["iac"] }],
  ["ansible", "Ansible", [], { family: "iac", implies: ["iac"] }],
  ["jenkins", "Jenkins", [], { family: "ci-cd" }],
  ["github-actions", "GitHub Actions", ["gh actions"], { family: "ci-cd" }],
  ["gitlab-ci", "GitLab CI", ["gitlab ci/cd", "gitlab pipelines"], { family: "ci-cd" }],
  ["cicd", "CI/CD", ["ci cd", "cicd", "continuous integration", "continuous delivery", "continuous deployment", "ci/cd pipeline", "ci/cd pipelines"], { family: "ci-cd" }],
  ["linux", "Linux", [], { family: "os" }],
  ["unix", "Unix", [], { family: "os" }],
  ["ubuntu", "Ubuntu", [], { family: "os", implies: ["linux"] }],
  ["nginx", "Nginx", [], {}],
  ["devops", "DevOps", ["dev ops"], {}],
  ["monitoring", "Monitoring", ["observability"], { family: "monitoring" }],
  ["prometheus", "Prometheus", [], { family: "monitoring", implies: ["monitoring"] }],
  ["grafana", "Grafana", [], { family: "monitoring", implies: ["monitoring"] }],
  ["datadog", "Datadog", [], { family: "monitoring", implies: ["monitoring"] }],

  // ---- messaging
  ["kafka", "Kafka", ["apache kafka"], { family: "messaging" }],
  ["rabbitmq", "RabbitMQ", ["rabbit mq"], { family: "messaging" }],
  ["bullmq", "BullMQ", ["bull mq", "bull queue"], { family: "messaging", implies: ["redis"] }],
  ["celery", "Celery", [], { family: "messaging", implies: ["python"] }],

  // ---- tools & practices
  ["version-control", "Version Control", [], { family: "vcs" }],
  ["git", "Git", ["=Git"], { family: "vcs", implies: ["version-control"] }],
  ["github", "GitHub", [], { family: "vcs", implies: ["git"] }],
  ["gitlab", "GitLab", [], { family: "vcs", implies: ["git"] }],
  ["jira", "Jira", [], {}],
  ["postman", "Postman", [], {}],
  ["figma", "Figma", [], {}],
  ["agile", "Agile", ["scrum", "kanban", "agile methodology", "agile methodologies"], {}],
  ["unit-testing", "Unit Testing", ["unit tests", "unit test"], { family: "testing" }],
  ["tdd", "TDD", ["test-driven development", "test driven development"], { family: "testing", implies: ["unit-testing"] }],
  ["automated-testing", "Automated Testing", ["test automation", "automated tests"], { family: "testing" }],
  ["jest", "Jest", ["=Jest"], { family: "testing", implies: ["javascript"] }],
  ["mocha", "Mocha", ["=Mocha"], { family: "testing", implies: ["javascript"] }],
  ["pytest", "pytest", [], { family: "testing", implies: ["python"] }],
  ["junit", "JUnit", [], { family: "testing", implies: ["java"] }],
  ["cypress", "Cypress", [], { family: "testing" }],
  ["selenium", "Selenium", [], { family: "testing" }],
  ["playwright", "Playwright", [], { family: "testing" }],
  ["puppeteer", "Puppeteer", [], { family: "testing" }],

  // ---- ML / data
  ["machine-learning", "Machine Learning", ["=ML"], { family: "ml" }],
  ["deep-learning", "Deep Learning", ["neural networks", "neural network"], { family: "ml", implies: ["machine-learning"] }],
  ["nlp", "NLP", ["natural language processing"], { family: "ml" }],
  ["computer-vision", "Computer Vision", ["image processing"], { family: "ml" }],
  ["opencv", "OpenCV", [], { family: "ml", implies: ["computer-vision"] }],
  ["llm", "LLMs", ["large language models", "large language model", "generative ai", "genai"], { family: "ml" }],
  ["prompt-engineering", "Prompt Engineering", [], { family: "ml", implies: ["llm"] }],
  ["keras", "Keras", [], { family: "ml-framework", implies: ["machine-learning"] }],
  ["tensorflow", "TensorFlow", [], { family: "ml-framework", implies: ["machine-learning"] }],
  ["pytorch", "PyTorch", [], { family: "ml-framework", implies: ["machine-learning"] }],
  ["scikit-learn", "scikit-learn", ["sklearn", "scikit learn"], { family: "ml-framework", implies: ["machine-learning", "python"] }],
  ["pandas", "pandas", ["=Pandas"], { family: "data-analysis", implies: ["python"] }],
  ["numpy", "NumPy", [], { family: "data-analysis", implies: ["python"] }],
  ["matplotlib", "Matplotlib", [], { family: "data-analysis", implies: ["python"] }],
  ["seaborn", "Seaborn", [], { family: "data-analysis", implies: ["python"] }],
  ["data-analysis", "Data Analysis", ["data analytics", "exploratory data analysis"], { family: "data-analysis" }],
  ["statistics", "Statistics", ["statistical analysis", "statistical modeling"], {}],
  ["excel", "Excel", ["=Excel", "microsoft excel", "ms excel"], { family: "bi" }],
  ["powerbi", "Power BI", ["powerbi"], { family: "bi" }],
  ["tableau", "Tableau", [], { family: "bi" }],
  ["etl", "ETL", ["data pipelines", "data pipeline", "data engineering"], {}],
  ["spark", "Spark", ["apache spark"], { family: "big-data" }],
  ["pyspark", "PySpark", [], { family: "big-data", implies: ["spark", "python"] }],
  ["hadoop", "Hadoop", [], { family: "big-data" }],
  ["airflow", "Airflow", ["apache airflow"], {}],

  // ---- CS fundamentals
  ["data-structures", "Data Structures", [], { family: "cs-fundamentals" }],
  ["algorithms", "Algorithms", [], { family: "cs-fundamentals" }],
  ["dsa", "Data Structures & Algorithms", ["data structures and algorithms", "dsa"], { family: "cs-fundamentals", implies: ["data-structures", "algorithms"] }],
  ["oop", "OOP", ["object-oriented programming", "object oriented programming", "object-oriented design", "oop"], {}],
  ["system-design", "System Design", ["systems design"], { family: "architecture" }],
  ["distributed-systems", "Distributed Systems", [], { family: "architecture" }],
  ["operating-systems", "Operating Systems", [], {}],
  ["computer-networks", "Computer Networks", ["networking"], {}],
  ["dbms", "DBMS", ["database management systems", "database management system", "rdbms"], {}],
  ["accessibility", "Accessibility", ["a11y", "wcag"], {}],
  ["security", "Security", ["secure coding", "application security"], {}],
  ["owasp", "OWASP", [], { implies: ["security"] }],
];

// ------------------------------------------------------------------ build
const SKILLS = new Map();
for (const [id, name, aliases, opts = {}] of RAW) {
  SKILLS.set(id, {
    id,
    name,
    // If the entry declares a case-sensitive / list-context alias equal to its
    // own name ("~Go", "=Rust"), the plain display name must NOT also be a
    // case-insensitive alias, or "Go beyond expectations" would match Go.
    aliases: aliases.some((a) => /^[=~]/.test(a) && a.slice(1).toLowerCase() === name.toLowerCase())
      ? [...aliases]
      : [name, ...aliases],
    family: opts.family || null,
    implies: opts.implies || [],
  });
}
for (const s of SKILLS.values()) {
  for (const i of s.implies) if (!SKILLS.has(i)) throw new Error(`taxonomy: ${s.id} implies unknown ${i}`);
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const FLEX_SPACE = (s) => s.replace(/(?:\\\s|\s)+/g, "\\s+");

/** Compile one alias spec ("foo" | "=Foo" | "~Go") to a global RegExp. */
function compileAlias(spec) {
  let cs = false;
  let listCtx = false;
  let term = spec;
  if (spec.startsWith("=")) { cs = true; term = spec.slice(1); }
  else if (spec.startsWith("~")) { cs = true; listCtx = true; term = spec.slice(1); }
  const body = FLEX_SPACE(escapeRe(term));
  // Not glued to word chars on either side. '.' before is disallowed so
  // "node.js" doesn't yield "js"; a trailing "." (end of sentence) is fine.
  const before = "(?<![A-Za-z0-9_+#.])";
  const after = "(?![A-Za-z0-9_]|[+#](?![A-Za-z0-9]))";
  let src;
  if (listCtx) {
    // list-like context only: "Python, Go, Rust" / "languages: C" / "C or C++"
    src = `(?:(?<=^)|(?<=[\\s,;:/(|•·]))${body}(?=\\s*(?:[,;:/)|•·]|$|\\s+(?:and|or)\\s|\\s*\\n))`;
  } else {
    src = `${before}${body}${after}`;
  }
  return new RegExp(src, cs ? "gm" : "gim");
}

const COMPILED = []; // {id, alias, re}
for (const s of SKILLS.values()) {
  for (const a of s.aliases) COMPILED.push({ id: s.id, alias: a, re: compileAlias(a) });
}
// Longest alias first so "spring boot" wins over shorter overlapping ones.
COMPILED.sort((a, b) => b.alias.length - a.alias.length);

/** All skill mentions in `text`: [{id, name, surface, index}] (all occurrences). */
function findSkillMentions(text = "") {
  const src = String(text);
  const found = [];
  const taken = []; // [start,end) ranges already claimed by a longer alias
  for (const { id, re } of COMPILED) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src))) {
      const start = m.index;
      const end = start + m[0].length;
      if (m[0].length === 0) { re.lastIndex++; continue; }
      if (taken.some(([a, b]) => start < b && end > a)) continue;
      taken.push([start, end]);
      found.push({ id, name: SKILLS.get(id).name, surface: m[0].trim(), index: start });
    }
  }
  return found.sort((a, b) => a.index - b.index);
}

function uniqueSkillIds(text) {
  return [...new Set(findSkillMentions(text).map((m) => m.id))];
}

function getSkill(id) { return SKILLS.get(id) || null; }

/**
 * How does skill `have` relate to required skill `need`?
 *   "same"    -> identical taxonomy entry (aliases are equivalent)
 *   "implies" -> `have` builds on / suggests `need` (Next.js -> React)
 *   "family"  -> same interchangeable-ish family (AWS vs GCP)
 *   null      -> unrelated
 * "implies" and "family" can only ever yield PARTIAL_MATCH.
 */
function relation(need, have) {
  if (need === have) return "same";
  const h = SKILLS.get(have);
  const n = SKILLS.get(need);
  if (!h || !n) return null;
  // transitive implies (Next.js -> React -> JavaScript)
  const seen = new Set();
  const stack = [...h.implies];
  while (stack.length) {
    const cur = stack.pop();
    if (cur === need) return "implies";
    if (seen.has(cur)) continue;
    seen.add(cur);
    stack.push(...(SKILLS.get(cur)?.implies || []));
  }
  if (h.family && h.family === n.family) return "family";
  return null;
}

/** Literal, boundary-aware regex for arbitrary (non-taxonomy) terms. */
function literalTermRegex(term) {
  const body = FLEX_SPACE(escapeRe(String(term).trim()));
  return new RegExp(`(?<![A-Za-z0-9_+#.])${body}(?![A-Za-z0-9_]|[+#](?![A-Za-z0-9]))`, "i");
}

module.exports = {
  TAXONOMY_VERSION,
  SKILLS,
  findSkillMentions,
  uniqueSkillIds,
  getSkill,
  relation,
  literalTermRegex,
  escapeRe,
};
