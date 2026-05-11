import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App'
import { AuthProvider } from '@/shared/context/AuthProvider'
import { ProtectedRoute } from '@/lms/components/ProtectedRoute'
import Login from '@/lms/pages/Login'
import RoleSelect from '@/lms/pages/RoleSelect'
import TeacherDashboard from '@/lms/pages/TeacherDashboard'
import AssignmentEditor from '@/lms/pages/AssignmentEditor'
import StudentDashboard from '@/lms/pages/StudentDashboard'
import StudentAssignment from '@/lms/pages/StudentAssignment'
import RootRedirect from '@/lms/pages/RootRedirect'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<Login />} />
          <Route
            path="/role"
            element={
              <ProtectedRoute>
                <RoleSelect />
              </ProtectedRoute>
            }
          />
          <Route
            path="/teacher"
            element={
              <ProtectedRoute role="teacher">
                <TeacherDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/teacher/assignments/:id"
            element={
              <ProtectedRoute role="teacher">
                <AssignmentEditor />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student"
            element={
              <ProtectedRoute role="student">
                <StudentDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/assignments/:id"
            element={
              <ProtectedRoute role="student">
                <StudentAssignment />
              </ProtectedRoute>
            }
          />
          {/* Standalone IDE — no auth, no host context, original behavior. */}
          <Route
            path="/ide"
            element={
              <div className="h-screen w-screen">
                <App />
              </div>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
