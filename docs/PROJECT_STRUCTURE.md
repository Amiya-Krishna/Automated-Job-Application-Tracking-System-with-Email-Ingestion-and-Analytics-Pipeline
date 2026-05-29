# Project Structure & Architecture

Comprehensive guide to the Job Application Tracker Portal's structure and architecture.

---

## Directory Structure

```
Job Application Tracker Portal/
│
├── 📄 README.md                          # Project overview and quick start
├── 📄 .env.example                       # Environment variables template
├── 📄 .gitignore                         # Git ignore rules
│
├── 📁 server/                            # Backend - Node.js/Express
│   ├── 📄 server.js                      # Express server entry point
│   ├── 📄 package.json                   # Backend dependencies
│   │
│   ├── 📁 config/                        # Configuration files
│   │   └── database.js                   # MongoDB connection
│   │
│   ├── 📁 models/                        # Mongoose schemas
│   │   ├── User.js                       # User schema & model
│   │   └── Job.js                        # Job schema & model
│   │
│   ├── 📁 routes/                        # API route definitions
│   │   ├── authRoutes.js                 # Authentication routes
│   │   └── jobRoutes.js                  # Job management routes
│   │
│   ├── 📁 controllers/                   # Request handlers
│   │   ├── authController.js             # Auth logic
│   │   └── jobController.js              # Job operations logic
│   │
│   └── 📁 middleware/                    # Custom middleware
│       └── authMiddleware.js             # JWT verification
│
├── 📁 client/                            # Frontend - React/Vite
│   ├── 📄 index.html                     # HTML entry point
│   ├── 📄 package.json                   # Frontend dependencies
│   ├── 📄 vite.config.js                 # Vite configuration
│   │
│   ├── 📁 src/                           # Source code
│   │   ├── 📄 main.jsx                   # React entry point
│   │   ├── 📄 App.jsx                    # Root component
│   │   ├── 📄 index.css                  # Global styles
│   │   ├── 📄 App.css                    # App styles
│   │   │
│   │   ├── 📁 components/                # Reusable components
│   │   │   ├── Navbar.jsx                # Navigation bar
│   │   │   ├── JobCard.jsx               # Job application card
│   │   │   ├── SearchFilter.jsx          # Search & filter
│   │   │   ├── Analytics.jsx             # Analytics display
│   │   │   └── ...                       # Other components
│   │   │
│   │   ├── 📁 pages/                     # Page components
│   │   │   ├── Login.jsx                 # Login page
│   │   │   ├── Register.jsx              # Registration page
│   │   │   ├── Dashboard.jsx             # Main dashboard
│   │   │   ├── JobForm.jsx               # Job creation/edit
│   │   │   └── ...                       # Other pages
│   │   │
│   │   ├── 📁 services/                  # API communication
│   │   │   ├── authService.js            # Auth API calls
│   │   │   ├── jobService.js             # Job API calls
│   │   │   └── api.js                    # API configuration
│   │   │
│   │   └── 📁 assets/                    # Static assets
│   │       ├── images/                   # Image files
│   │       └── icons/                    # Icon files
│   │
│   ├── 📁 public/                        # Static files
│   └── 📁 node_modules/                  # Dependencies (not in git)
│
├── 📁 docs/                              # Documentation
│   ├── GETTING_STARTED.md                # Quick start guide
│   ├── INSTALLATION.md                   # Installation instructions
│   ├── API_ENDPOINTS.md                  # API documentation
│   ├── PROJECT_STRUCTURE.md              # This file
│   └── DEPLOYMENT.md                     # Deployment guide
│
└── 📁 node_modules/                      # Root dependencies (not in git)
```

---

## Backend Architecture

### File: `server/server.js`

**Purpose**: Express server entry point

```javascript
// Key responsibilities:
- Initialize Express app
- Connect to MongoDB
- Setup middleware (CORS, body parser)
- Define routes
- Start server on specified port
```

### Directory: `server/config/`

**Database Configuration**

```javascript
// config/database.js
- MongoDB connection setup
- Connection error handling
- Database initialization
```

### Directory: `server/models/`

**Mongoose Schemas & Models**

#### `User.js`
```
Schema:
├── username (String, unique, required)
├── email (String, unique, required)
├── password (String, hashed, required)
├── createdAt (Date, auto)
└── updatedAt (Date, auto)
```

#### `Job.js`
```
Schema:
├── userId (Reference to User)
├── company (String, required)
├── position (String, required)
├── location (String)
├── status (Enum: Applied, Interviewed, Rejected, Offered)
├── appliedDate (Date)
├── salary (String)
├── jobUrl (String)
├── notes (String)
├── createdAt (Date, auto)
└── updatedAt (Date, auto)
```

### Directory: `server/routes/`

**API Route Definitions**

#### `authRoutes.js`
```
POST   /api/auth/register          - User registration
POST   /api/auth/login             - User login
POST   /api/auth/logout            - User logout
GET    /api/auth/profile           - Get user profile
```

#### `jobRoutes.js`
```
GET    /api/jobs                   - Get all jobs
POST   /api/jobs                   - Create job
GET    /api/jobs/:id               - Get single job
PUT    /api/jobs/:id               - Update job
DELETE /api/jobs/:id               - Delete job
GET    /api/jobs/search            - Search jobs
GET    /api/analytics/summary      - Get analytics
```

### Directory: `server/controllers/`

**Business Logic Handlers**

#### `authController.js`
- User registration validation
- Password hashing (bcrypt)
- JWT token generation
- Login/logout logic
- Profile retrieval

#### `jobController.js`
- Create job application
- Get all user jobs
- Get single job details
- Update job information
- Delete job
- Search functionality
- Analytics calculation

### Directory: `server/middleware/`

**Custom Middleware**

#### `authMiddleware.js`
- JWT token verification
- User authentication check
- Attach user to request object
- Error handling

---

## Frontend Architecture

### File: `client/src/main.jsx`

**Purpose**: React application entry point

```javascript
// Responsibilities:
- Mount React app to DOM
- Initialize root component
- Setup React version
```

### File: `client/src/App.jsx`

**Purpose**: Root component

```javascript
// Key responsibilities:
- Define main routing
- Setup global state management
- Handle authentication logic
- Render page components
```

### Directory: `client/src/components/`

**Reusable UI Components**

| Component | Purpose |
|-----------|---------|
| `Navbar.jsx` | Navigation header |
| `JobCard.jsx` | Job application card display |
| `SearchFilter.jsx` | Search and filter UI |
| `Analytics.jsx` | Statistics and charts |
| `Modal.jsx` | Popup dialogs |
| `Button.jsx` | Reusable button |
| `Input.jsx` | Form input fields |
| `Loading.jsx` | Loading spinner |

### Directory: `client/src/pages/`

**Full-Page Components**

| Page | Route | Purpose |
|------|-------|---------|
| `Login.jsx` | `/login` | User authentication |
| `Register.jsx` | `/register` | Account creation |
| `Dashboard.jsx` | `/dashboard` | Main application hub |
| `JobForm.jsx` | `/job/new`, `/job/:id/edit` | Create/edit jobs |
| `Profile.jsx` | `/profile` | User profile |
| `NotFound.jsx` | `*` | 404 page |

### Directory: `client/src/services/`

**API Communication Layer**

#### `api.js`
- Axios/Fetch instance setup
- Base URL configuration
- Global error handling
- Token management

#### `authService.js`
- Register API call
- Login API call
- Logout API call
- Profile API call

#### `jobService.js`
- Get jobs API call
- Create job API call
- Update job API call
- Delete job API call
- Search API call
- Analytics API call

### File: `client/src/App.css`

**Application Styles**

```css
- Global styles
- Layout styles
- Responsive design
- Theme colors
```

### File: `client/src/index.css`

**Global Styles**

```css
- Reset styles
- Font definitions
- Base element styles
- Tailwind CSS imports
```

---

## Data Flow

### Authentication Flow

```
User Input
    ↓
LoginPage Component
    ↓
authService.login()
    ↓
POST /api/auth/login
    ↓
authController.login()
    ↓
Generate JWT Token
    ↓
Send Token to Client
    ↓
Store in localStorage
    ↓
Redirect to Dashboard
```

### Job Creation Flow

```
User Fills Form
    ↓
JobForm Component
    ↓
jobService.createJob(data)
    ↓
POST /api/jobs
    ↓
jobController.createJob()
    ↓
Save to MongoDB
    ↓
Return created job
    ↓
Update UI
```

### Data Fetch Flow

```
Dashboard Mounts
    ↓
useEffect triggers
    ↓
jobService.getJobs()
    ↓
GET /api/jobs
    ↓
jobController.getJobs()
    ↓
Query MongoDB
    ↓
Return jobs array
    ↓
Update component state
    ↓
Render jobs
```

---

## Technology Stack Details

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB + Mongoose ODM
- **Authentication**: JWT + bcrypt
- **Validation**: Mongoose schema validation

### Frontend
- **Library**: React
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **HTTP Client**: Axios/Fetch API
- **State Management**: React Context API or Redux

### Development Tools
- **Package Manager**: npm
- **Version Control**: Git
- **Environment**: Node.js development server

---

## Key Dependencies

### Backend (`server/package.json`)
```json
{
  "express": "^4.18.2",
  "mongoose": "^7.0.0",
  "jsonwebtoken": "^9.0.0",
  "bcryptjs": "^2.4.3",
  "dotenv": "^16.0.3",
  "cors": "^2.8.5"
}
```

### Frontend (`client/package.json`)
```json
{
  "react": "^18.2.0",
  "react-router-dom": "^6.11.0",
  "axios": "^1.4.0",
  "vite": "^4.3.0"
}
```

---

## Security Considerations

### Password Security
- Hashed with bcrypt (10 rounds)
- Never stored in plain text
- Validated on login

### JWT Authentication
- Token generated on login
- Stored in client localStorage
- Verified on each request
- Expires after set duration

### CORS Protection
- Configured to allow specific origins
- Prevents unauthorized cross-origin requests
- Production uses explicit domain list

### Environment Variables
- Sensitive data in `.env`
- Never committed to version control
- Loaded at application start

---

## Scalability Considerations

### Current (Monolithic)
- Single server handles all requests
- Good for small to medium apps
- Simple deployment

### Future (Microservices)
- Separate auth service
- Separate job service
- Separate analytics service
- API gateway
- Message queue (RabbitMQ/Kafka)

### Database Optimization
- Indexes on frequently queried fields
- Connection pooling
- Query optimization
- Caching layer (Redis)

---

## Testing Structure (Future)

```
📁 tests/
├── 📁 unit/
│   ├── authController.test.js
│   └── jobController.test.js
├── 📁 integration/
│   ├── auth.integration.test.js
│   └── jobs.integration.test.js
└── 📁 e2e/
    └── login.e2e.test.js
```

---

## Environment-Specific Configuration

### Development
- Debug logging enabled
- CORS allows localhost
- No rate limiting
- Detailed error messages

### Production
- Optimized bundle
- Logging limited
- Rate limiting enabled
- Error messages sanitized
- SSL/TLS encryption

---

## File Naming Conventions

### React Components
- PascalCase: `JobCard.jsx`, `LoginForm.jsx`
- One component per file
- Directory structure mirrors routes

### JavaScript Files
- camelCase: `authService.js`, `jobController.js`
- Functions and variables: camelCase
- Constants: UPPER_SNAKE_CASE

### CSS/Styling
- CSS files: same name as component
- BEM methodology for classes
- Tailwind utility classes when possible

---

**Last Updated**: May 26, 2026  
**Version**: 1.0.0
