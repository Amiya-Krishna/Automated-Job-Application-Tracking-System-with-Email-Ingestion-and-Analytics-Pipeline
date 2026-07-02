# Getting Started Guide

Welcome to the Job Application Tracker Portal! This guide will help you set up and run the project in less than 10 minutes.

---

## Prerequisites

Before you start, ensure you have:

- **Node.js** 16.x or higher ([Download](https://nodejs.org))
- **npm** (comes with Node.js) or **yarn**
- **MongoDB** ([Local](https://www.mongodb.com/try/download/community) or [Atlas Cloud](https://www.mongodb.com/cloud/atlas))
- **Git** ([Download](https://git-scm.com))
- A code editor (VSCode recommended)

**Check your versions:**
```bash
node --version
npm --version
git --version
```

---

## Step 1: Clone the Repository

```bash
git clone <repository-url>
cd "Job Application Tracker Portal"
```

---

## Step 2: Setup MongoDB

### Option A: Local MongoDB
```bash
# Start MongoDB service
# Windows:
mongod

# Mac/Linux:
brew services start mongodb-community
```

### Option B: MongoDB Atlas (Cloud)
1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a free account
3. Create a cluster
4. Get your connection string
5. Update `MONGODB_URI` in `.env`

---

## Step 3: Configure Environment Variables

```bash
# Copy the template
cp .env.example .env

# Edit .env with your values
```

**Minimal .env:**
```env
MONGODB_URI=mongodb://localhost:27017/job-tracker
JWT_SECRET=your-secret-key-here
NODE_ENV=development
PORT=5000
CLIENT_URL=https://job-application-tracker-portal-ao8n.vercel.app,http://localhost:5173
```

---

## Step 4: Install Server Dependencies

```bash
cd server
npm install
```

---

## Step 5: Install Client Dependencies

```bash
cd ../client
npm install
```

---

## Step 6: Start the Development Servers

**Open two terminals:**

**Terminal 1 - Start Backend Server:**
```bash
cd server
npm start
```

Expected output:
```
Server is running on http://localhost:5000
MongoDB connected successfully
```

**Terminal 2 - Start Frontend Client:**
```bash
cd client
npm run dev
```

Expected output:
```
➜  Local:   http://localhost:5173/
```

---

## Step 7: Access the Application

Open your browser and go to:
```
http://localhost:5173
```

You should see the login page. Create a new account and start tracking!

---

## Verify Everything Works

### Backend Health Check
```bash
curl http://localhost:5000/api/health
```

### Frontend Loading
- [ ] Login page loads
- [ ] Can create a new account
- [ ] Can log in
- [ ] Can access dashboard
- [ ] Can add a job application

---

## Troubleshooting

### MongoDB Connection Error
```
Error: connect ECONNREFUSED 127.0.0.1:27017
```
**Solution**: Ensure MongoDB is running
- Windows: Start MongoDB service
- Mac: `brew services start mongodb-community`
- Cloud: Check your Atlas connection string

### Port Already in Use
```
Error: listen EADDRINUSE: address already in use :::5000
```
**Solution**: 
```bash
# Change PORT in .env
PORT=5001

# Or kill the process using the port
# Windows:
netstat -ano | findstr :5000
taskkill /PID <PID> /F

# Mac/Linux:
lsof -i :5000
kill -9 <PID>
```

### Module Not Found
```
Error: Cannot find module 'express'
```
**Solution**: 
```bash
cd server
npm install
```

### CORS Error
```
Access to XMLHttpRequest has been blocked by CORS policy
```
**Solution**: Ensure `.env` has correct `CLIENT_URL`:
```env
CLIENT_URL=https://job-application-tracker-portal-ao8n.vercel.app,http://localhost:5173
```

---

## Project Structure Overview

```
├── server/
│   ├── models/              # Database schemas
│   ├── routes/              # API endpoints
│   ├── controllers/         # Request handlers
│   ├── middleware/          # Auth & error handling
│   ├── server.js            # Entry point
│   └── package.json
├── client/
│   ├── src/
│   │   ├── components/      # UI components
│   │   ├── pages/          # Page components
│   │   ├── services/       # API calls
│   │   └── main.jsx        # Entry point
│   └── vite.config.js
└── .env
```

---

## Next Steps

1. **Explore the Dashboard** - Add some job applications
2. **Read [API_ENDPOINTS.md](API_ENDPOINTS.md)** - Learn about API endpoints
3. **Check [INSTALLATION.md](INSTALLATION.md)** - Detailed setup guide
4. **Review Code** - Explore the codebase
5. **Deploy** - Deploy to production when ready

---

## Quick Commands Reference

```bash
# Start both servers (from root directory)
# Terminal 1:
cd server && npm start

# Terminal 2:
cd client && npm run dev

# Build for production
cd client && npm run build

# Run tests (if configured)
npm test

# Install new package (from respective directory)
npm install package-name

# Stop server
Ctrl + C
```

---

## Need Help?

- Check [INSTALLATION.md](INSTALLATION.md) for detailed setup
- Review [API_ENDPOINTS.md](API_ENDPOINTS.md) for API documentation
- Check server console for error messages
- Verify all environment variables are set correctly

---

**Happy tracking! 🚀**
