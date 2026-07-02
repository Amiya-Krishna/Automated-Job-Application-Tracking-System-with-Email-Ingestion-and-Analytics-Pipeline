# Job Application Tracker Portal

[![React](https://img.shields.io/badge/React-19.x-blue?logo=react)](https://react.dev)
[![Node.js](https://img.shields.io/badge/Node.js-16.x+-green?logo=node.js)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-5.x-black?logo=express)](https://expressjs.com)
[![MongoDB](https://img.shields.io/badge/MongoDB-Latest-green?logo=mongodb)](https://www.mongodb.com)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

A full-stack job application tracker built with React, Vite, Express, and MongoDB. Manage job applications, track status changes, and keep interview details and notes in one place.

---

## 🚀 Quick Start

```bash
# Clone the repository
git clone <repository-url>
cd "Job Application Tracker Portal"

# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install

# Copy environment template
cd ..
copy .env.example .env

# Start server in one terminal
cd server
npm start

# Start client in another terminal
cd ../client
npm run dev
```

Open the frontend at `http://localhost:5173`

---

## 📋 Installation Steps

### Prerequisites
- Node.js 16.x or higher
- MongoDB (local or Atlas)
- npm package manager

### Server Setup

```bash
cd server
npm install
```

### Client Setup

```bash
cd client
npm install
```

### Environment Configuration

Copy the example file and update values:

```bash
copy .env.example .env
```

Example `.env` values:

```env
MONGODB_URI=mongodb://localhost:27017/job-tracker
JWT_SECRET=your_jwt_secret_key_here
NODE_ENV=development
PORT=5000
CLIENT_URL=https://job-application-tracker-portal-ao8n.vercel.app,http://localhost:5173
```

### Run Application

**Development Mode**

```bash
# Server
cd server
npm start

# Client
cd client
npm run dev
```

**Production Build**

```bash
cd client
npm run build
cd ../server
npm start
```

---

### 🟢 System Architecture

![System Architecture](outputs/system_architecture.png)

### 🟢 Data Flow

![Data Flow](outputs/data_flow.png)

### 🟢 Authentication Flow

![Authentication Flow](outputs/authentication_flow.png)


---

## ⚙️ Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `MONGODB_URI` | MongoDB connection URI | `mongodb://localhost:27017/job-tracker` |
| `JWT_SECRET` | Secret key for JWT signing | `your_secret_key_12345` |
| `NODE_ENV` | App environment | `development` or `production` |
| `PORT` | Backend port | `5000` |
| `CLIENT_URL` | Frontend URL for CORS | `http://localhost:5173` |

---

## 🔌 API Endpoints

### Authentication

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/auth/register` | Register a new user | ❌ |
| POST | `/api/auth/login` | Login and receive JWT token | ❌ |

### Job Applications

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/jobs` | Get all jobs for the authenticated user | ✅ |
| POST | `/api/jobs` | Create a new job entry | ✅ |
| PUT | `/api/jobs/:id` | Update job details | ✅ |
| DELETE | `/api/jobs/:id` | Remove a job entry | ✅ |

> Protected routes require the request header `token: <JWT token>`.

---

## ✨ Features

- **Authentication**
  - User registration
  - Login with JWT
  - Password hashing with bcryptjs
- **Job Tracking**
  - Create, update, and delete job applications
  - Track company, role, status, interview date, and notes
  - User-specific data isolation
- **Modern Frontend**
  - React 19 with Vite
  - React Router navigation
  - Responsive UI with Tailwind CSS
  - API integration via Axios
- **Backend**
  - Express 5 server
  - MongoDB with Mongoose models
  - Protected routes using middleware

---

## 📸 Screenshots

### 🟢 Dashboard

![Dashboard](outputs/Dashboard.png)

### 🚀 Login 

![Login](outputs/Login_Page.png)

### 🚀 Registration

![Registration](outputs/Registration_Page.png)

### 🟢 Postman

![Postman](outputs/Postman%20request.png)

### 🚀 MongoDB

![MongoDB](outputs/MongoDB%20users%20collection.png)

### 🚀 Server

![Server](outputs/Server_terminal.png)

---

## 📁 Project Structure
```
Job Application Tracker Portal/
|
├── client/                          # React frontend
│   ├── src/
│   │   ├── components/              # Reusable React components
│   │   ├── pages/                   # Page components
│   │   ├── App.jsx                  # Main app component
│   │   ├── main.jsx                 # Frontend entry point
│   │   └── index.css                # Global styles
│   ├── package.json                 # Client dependencies and scripts
│   └── vite.config.js               # Vite configuration
|
├── server/                          # Node backend
│   ├── config/                      # Database connection files
│   ├── controllers/                 # Business logic handlers
│   ├── middleware/                  # Auth middleware
│   ├── models/                      # Mongoose models
│   ├── routes/                      # API route definitions
│   ├── package.json                 # Server dependencies and scripts
│   └── server.js                    # Backend entry point
|
├── docs/                            # Project documentation
├── .env.example                     # Environment variable template
└── README.md                        # Project documentation
```

---

## 🤝 Contributing

Contributions are welcome.

1. Fork the repository
2. Create a branch: `git checkout -b feature/name`
3. Make your changes
4. Commit and push
5. Open a pull request

---

## 📄 License

This project is licensed under the **MIT License**.

---

## 👨‍💻 Author

Amiya Krishna Chaurasiya

B.Tech CSE Student

Aspiring Data Scientist and AI/ML Engineer

GitHub: https://github.com/Amiya-Krishna

LinkedIn: https://www.linkedin.com/in/amiya-krishna

---

## ⭐ Support

If you like this project:

⭐ Star the repository
🍴 Fork it
🤝 Contribute