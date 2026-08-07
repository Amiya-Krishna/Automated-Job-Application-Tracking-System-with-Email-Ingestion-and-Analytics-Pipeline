# Contributing Guide

Thank you for your interest in contributing to the Job Application Tracker Portal! This guide will help you get started.

---

## Code of Conduct

- Be respectful and inclusive
- Accept constructive criticism
- Focus on what is best for the community
- Show empathy towards other community members

---

## How Can I Contribute?

### Reporting Bugs 🐛

Found a bug? Please report it by:

1. **Check existing issues** - Avoid duplicate reports
2. **Create detailed report** - Include:
   - Steps to reproduce
   - Expected behavior
   - Actual behavior
   - Screenshots (if applicable)
   - Environment info (OS, browser, Node version)

**Example Issue Title:**
```
"Login fails when email contains plus sign"
```

**Example Issue Body:**
```
**Steps to Reproduce:**
1. Go to register page
2. Enter email: user+test@example.com
3. Fill other fields
4. Click submit

**Expected:** Account created successfully
**Actual:** Email validation error

**Environment:**
- OS: Windows 10
- Browser: Chrome 120
- Node: 18.17.0
```

### Suggesting Features 💡

Have an idea? We'd love to hear it!

1. **Check existing feature requests** - Avoid duplicates
2. **Describe the feature**:
   - Use case
   - Expected behavior
   - Potential implementation approach
   - Benefits

**Example Feature Request:**
```
Title: "Add interview scheduling calendar"

Description:
Users need to track interview dates easily. A calendar 
view would help visualize schedules and set reminders.

Benefits:
- Never miss an interview
- Better time management
- Visual schedule overview
```

### Improving Documentation 📚

- Fix typos
- Clarify confusing sections
- Add examples
- Improve formatting
- Update outdated information

### Submitting Code Changes 💻

---

## Getting Started with Development

### 1. Fork & Clone

```bash
# Fork on GitHub, then:
git clone https://github.com/YOUR_USERNAME/job-tracker.git
cd "Job Application Tracker Portal"
```

### 2. Create Feature Branch

```bash
git checkout -b feature/your-feature-name
```

**Branch naming:**
- `feature/add-export-csv` - New feature
- `fix/login-validation` - Bug fix
- `docs/improve-readme` - Documentation
- `refactor/api-cleanup` - Refactoring

### 3. Setup Development Environment

```bash
# Install dependencies
cd server && npm install
cd ../client && npm install

# Copy environment template
cp .env.example .env

# Update .env with your settings
```

### 4. Make Your Changes

Follow these guidelines:

#### Code Style
- Use consistent indentation (2 spaces)
- Use meaningful variable names
- Add comments for complex logic
- Keep functions focused and small

#### Frontend (React)
```javascript
// ✅ Good
const handleUserLogin = async (email, password) => {
  try {
    const response = await api.post("/auth/login", { email, password });
    localStorage.setItem("token", response.data.token);
    navigate('/dashboard');
  } catch (error) {
    setError(error.response?.data?.message || error.message);
  }
};

// ❌ Bad
const h = async (e, p) => {
  const r = await api.post("/auth/login", { email: e, password: p });
  setU(r.d);
};
```

#### Backend (Node.js)

This project keeps route logic directly in `routes/*.js` (there's no separate
`controllers/` layer), and the `models/*.js` files are plain functions over a
shared Postgres pool — not an ORM. Follow that pattern:

```javascript
// ✅ Good — server/routes/jobRoutes.js style
router.post("/", auth, async (req, res) => {
  try {
    const { company, role, status, interviewDate, notes } = req.body;

    if (!company || !role) {
      return res.status(400).json({ message: "company and role are required" });
    }

    const job = await Job.create({
      userId: req.user.id,
      company,
      role,
      status,
      interviewDate,
      notes,
    });

    res.json(job);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ❌ Bad
router.post("/", (req, res) => {
  const j = new Job(req.body);
  j.save();
  res.json(j);
});
```

### 5. Test Your Changes

```bash
# Manual testing
npm run dev  # Frontend
npm start    # Backend

# Test the feature thoroughly
# Check console for errors
# Test on different browsers if frontend changes
```

### 6. Commit Your Changes

```bash
git add .
git commit -m "feat: add export jobs as CSV"
```

**Commit message format:**
```
<type>: <description>

<optional body>
<optional footer>
```

**Types:**
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation
- `style:` - Code style (formatting)
- `refactor:` - Code refactoring
- `test:` - Tests
- `chore:` - Build, dependencies

**Examples:**
```bash
git commit -m "feat: add job search by position"
git commit -m "fix: resolve login validation bug"
git commit -m "docs: update API endpoint examples"
git commit -m "refactor: extract auth logic to service"
```

### 7. Push to Your Fork

```bash
git push origin feature/your-feature-name
```

### 8. Create Pull Request

1. Go to original repository on GitHub
2. Click "New Pull Request"
3. Select your branch
4. Fill in the description:

**PR Template:**
```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Documentation update

## Related Issues
Fixes #123

## Changes Made
- Added search functionality
- Updated database schema
- Added unit tests

## Screenshots
[If applicable]

## Checklist
- [ ] Code follows project style
- [ ] No new warnings generated
- [ ] Tests pass locally
- [ ] Documentation updated
- [ ] No breaking changes
```

### 9. Respond to Feedback

- Address review comments
- Make requested changes
- Push updates to same branch
- PR automatically updates

---

## Development Workflow Example

```bash
# 1. Create feature branch
git checkout -b feature/add-filters

# 2. Make changes
# ... edit files ...

# 3. Test changes
npm run dev  # Test frontend
npm test     # Run tests if available

# 4. Commit changes
git add .
git commit -m "feat: add advanced job filters"

# 5. Push to fork
git push origin feature/add-filters

# 6. Create Pull Request on GitHub
# ... wait for review ...

# 7. Make requested changes
# ... edit files ...

# 8. Commit and push updates
git add .
git commit -m "refactor: improve filter performance"
git push origin feature/add-filters

# 9. PR merged! 🎉
```

---

## Coding Standards

### React Components

```javascript
// Use functional components
const JobCard = ({ job, onDelete }) => {
  const [isEditing, setIsEditing] = useState(false);

  const handleEdit = () => {
    // Implementation
  };

  return (
    <div className="job-card">
      {/* JSX */}
    </div>
  );
};

export default JobCard;
```

### Error Handling

```javascript
// Backend — this project returns the resource or a { message } object,
// not a { success, data } envelope
try {
  const jobs = await Job.findAllByUser(req.user.id);
  res.json(jobs);
} catch (err) {
  res.status(500).json({ message: err.message });
}

// Frontend — pages call api.js directly (no separate service layer)
const [error, setError] = useState(null);

const handleSubmit = async (data) => {
  try {
    setError(null);
    await api.post("/jobs", data);
  } catch (err) {
    setError(err.response?.data?.message || "Something went wrong");
  }
};
```

### Comments

```javascript
// Add comments for WHY, not WHAT
// ✅ Good - Explains why
// We use exponential backoff to avoid overwhelming
// the server during high traffic periods
const backoffDelay = Math.pow(2, retryCount) * 1000;

// ❌ Bad - Just restates the code
// Multiply retry count by 2 and 1000
const backoffDelay = Math.pow(2, retryCount) * 1000;
```

---

## File Organization

### New Files
- Place in appropriate directory
- Follow naming conventions
- Add to relevant route/export files

### Modified Files
- Update related tests
- Update relevant documentation
- Update TypeScript types if applicable

---

## Pull Request Review Process

1. **Automated checks**
   - Code style validation
   - Build verification
   - Tests pass

2. **Code review**
   - Maintainers review code
   - Feedback provided if needed

3. **Approval**
   - Changes approved
   - PR merged

4. **Release**
   - Changes included in next release

---

## Common Mistakes to Avoid

- ❌ Committing sensitive data (.env, secrets)
- ❌ Large commits that are hard to review
- ❌ Poor commit messages
- ❌ Not testing before submitting PR
- ❌ Ignoring linting warnings
- ❌ Making unrelated changes in one PR
- ❌ Force-pushing to shared branches

---

## Getting Help

- **Questions?** Open a discussion
- **Stuck?** Ask in comments on related issues
- **Need guidance?** Check documentation in `/docs`
- **Still stuck?** Comment on your PR

---

## Recognition

Contributors are recognized in:
- CONTRIBUTORS.md file
- Project README
- Release notes for major contributions

---

## License

By contributing, you agree your code will be licensed under the project's MIT License.

---

## Resources

- [Git Documentation](https://git-scm.com/doc)
- [GitHub Contributing Guide](https://docs.github.com/en/get-started)
- [Semantic Commit Messages](https://www.conventionalcommits.org/)
- [JavaScript Style Guide](https://airbnb.io/javascript/)
- [React Best Practices](https://react.dev/learn)

---

Thank you for contributing! 🎉

Your efforts help make this project better for everyone.

**Last Updated**: July 20, 2026
