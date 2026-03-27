import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import UploadPage from './pages/UploadPage';
import FilesPage from './pages/FilesPage';
import ExplorationPage from './pages/ExplorationPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/files" element={<FilesPage />} />
          <Route path="/files/:id" element={<ExplorationPage />} />
          <Route path="/" element={<Navigate to="/files" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
