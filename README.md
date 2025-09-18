# 🎓 **Zinnol App - Smart Education Management Platform**

[![Backend Tests](https://github.com/chukwuma7703/Zinnol-App-Phase1-Full/actions/workflows/backend-tests.yml/badge.svg)](https://github.com/chukwuma7703/Zinnol-App-Phase1-Full/actions/workflows/backend-tests.yml)
[![codecov](https://codecov.io/gh/chukwuma7703/Zinnol-App-Phase1-Full/branch/main/graph/badge.svg)](https://codecov.io/gh/chukwuma7703/Zinnol-App-Phase1-Full)
[![Node.js Version](https://img.shields.io/badge/node-22.x-brightgreen.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> **Revolutionizing education management with AI-powered insights, automated grading, and comprehensive school administration tools.**

## 🚀 **Features**

### **🎯 Core Functionality**
- **Student Management** - Comprehensive student profiles and tracking
- **Exam Management** - Create, conduct, and grade exams efficiently
- **Result Processing** - Automated grading with OCR support
- **Teacher Tools** - Assignment management and performance analytics
- **School Administration** - Multi-school support with role-based access

### **🤖 AI-Powered Features**
- **Smart OCR** - Automated answer sheet scanning and grading
- **Predictive Analytics** - Early identification of at-risk students
- **AI Coaching** - Personalized teaching recommendations
- **Performance Insights** - Data-driven educational analytics

### **📱 Modern Architecture**
- **Real-time Updates** - Socket.io for live notifications
- **Mobile-First Design** - Responsive across all devices
- **Offline Capability** - Progressive Web App features
- **Secure Authentication** - JWT with refresh tokens and MFA

## 📊 **Project Stats**

- **Test Coverage:** 88.64% (371+ tests)
- **Performance:** 2,448x faster than manual processing
- **Scalability:** Supports 10,000+ students per instance
- **Reliability:** Enterprise-grade error handling and monitoring

## 🛠️ **Tech Stack**

### **Backend**
- **Runtime:** Node.js 22.x
- **Framework:** Express.js
- **Database:** MongoDB with Mongoose
- **Caching:** Redis
- **Authentication:** JWT + Firebase Admin
- **File Processing:** Sharp, Tesseract.js
- **AI/ML:** OpenAI API, Google Cloud Vision

### **Frontend**
- **Framework:** React 18
- **Build Tool:** Vite
- **Styling:** Tailwind CSS
- **State Management:** Context API
- **Charts:** Chart.js, React Chart.js 2

### **DevOps & Quality**
- **Testing:** Jest (88.64% coverage)
- **CI/CD:** GitHub Actions
- **Code Quality:** ESLint, Prettier
- **Monitoring:** Sentry
- **Documentation:** Comprehensive API docs

## 🚀 **Quick Start**

### **Prerequisites**
- Node.js 22.x or higher
- MongoDB 6.x or higher
- Redis 6.x or higher
- Git

### **Installation**

```bash
# Clone the repository
git clone https://github.com/chukwuma7703/Zinnol-App-Phase1-Full.git
cd Zinnol-App-Phase1-Full

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install

# Set up environment variables
cp backend/.env.example backend/.env
# Edit backend/.env with your configuration

# Start development servers
cd backend && npm run dev
cd frontend && npm run dev
```

### **Environment Setup**

```bash
# Backend environment variables (backend/.env)
MONGO_URI=mongodb://127.0.0.1:27017/zinnolDB
REDIS_URL=redis://127.0.0.1:6379
JWT_SECRET=your_jwt_secret_here
FIREBASE_PROJECT_ID=your_firebase_project_id
OPENAI_API_KEY=your_openai_api_key
```

## 🧪 **Testing**

### **Run Tests**
```bash
cd backend

# Unit tests with coverage
npm run test:unit:focused:coverage

# Integration tests
npm run test:integration

# Full test suite
npm run test

# Watch mode for development
npm run test:watch
```

### **Coverage Reports**
- **Local:** Generated in `backend/coverage/`
- **CI/CD:** Automatically uploaded to Codecov
- **Target:** Maintaining 90%+ coverage

## 📚 **API Documentation**

### **Authentication**
```bash
POST /api/auth/login
POST /api/auth/register
POST /api/auth/refresh-token
POST /api/auth/logout
```

### **Student Management**
```bash
GET    /api/students
POST   /api/students
GET    /api/students/:id
PUT    /api/students/:id
DELETE /api/students/:id
```

### **Exam Management**
```bash
GET    /api/exams
POST   /api/exams
GET    /api/exams/:id
PUT    /api/exams/:id
POST   /api/exams/:id/start
POST   /api/exams/:id/submit
```

### **Results & Analytics**
```bash
GET    /api/results
POST   /api/results
GET    /api/analytics/school/:schoolId
GET    /api/analytics/student/:studentId
POST   /api/results/ocr-upload
```

## 🏗️ **Architecture**

### **System Overview**
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend API   │    │   Database      │
│   (React)       │◄──►│   (Express.js)  │◄──►│   (MongoDB)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │   External APIs │
                       │   (OpenAI, etc) │
                       └─────────────────┘
```

### **Key Components**
- **Authentication Service** - JWT-based auth with refresh tokens
- **Student Management** - CRUD operations with validation
- **Exam Engine** - Real-time exam conduct and grading
- **OCR Service** - Automated answer sheet processing
- **Analytics Engine** - Performance insights and reporting
- **Notification System** - Real-time updates via Socket.io

## 🚀 **Deployment**

### **Production Deployment**
```bash
# Build frontend
cd frontend && npm run build

# Start production server
cd backend && npm start

# Or use PM2 for process management
pm2 start backend/server.js --name zinnol-backend
```

### **Docker Deployment**
```bash
# Build and run with Docker Compose
docker-compose up -d

# Scale services
docker-compose up -d --scale backend=3
```

### **Environment Requirements**
- **CPU:** 2+ cores (4+ recommended)
- **RAM:** 4GB minimum (8GB+ recommended)
- **Storage:** 50GB+ for data and logs
- **Network:** Stable internet for AI APIs

## 📈 **Performance**

### **Benchmarks**
- **Response Time:** <200ms average API response
- **Throughput:** 1000+ concurrent users supported
- **Processing Speed:** 2,448x faster than manual grading
- **Uptime:** 99.9% availability target

### **Optimization Features**
- **Caching:** Redis for frequently accessed data
- **Database Indexing:** Optimized MongoDB queries
- **CDN Integration:** Fast static asset delivery
- **Lazy Loading:** Efficient frontend resource loading

## 🤝 **Contributing**

### **Development Workflow**
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass (`npm run test`)
6. Commit your changes (`git commit -m 'Add amazing feature'`)
7. Push to the branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

### **Code Standards**
- **ESLint:** Follow the configured linting rules
- **Prettier:** Code formatting enforced
- **Testing:** Maintain 90%+ test coverage
- **Documentation:** Update docs for new features

## 📄 **License**

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 **Acknowledgments**

- **OpenAI** - AI-powered features
- **Google Cloud** - Vision API for OCR
- **MongoDB** - Reliable data storage
- **React Community** - Frontend framework
- **Jest** - Testing framework

## 📞 **Support**

- **Documentation:** [Wiki](https://github.com/chukwuma7703/Zinnol-App-Phase1-Full/wiki)
- **Issues:** [GitHub Issues](https://github.com/chukwuma7703/Zinnol-App-Phase1-Full/issues)
- **Discussions:** [GitHub Discussions](https://github.com/chukwuma7703/Zinnol-App-Phase1-Full/discussions)
- **Email:** support@zinnol.com

---

**Built with ❤️ for the future of education**