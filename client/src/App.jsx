import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import BankManager from './pages/BankManager';
import BillingProcess from './pages/BillingProcess';
import FileLibrary from './pages/FileLibrary';

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/banks" element={<BankManager />} />
          <Route path="/billing" element={<BillingProcess />} />
          <Route path="/library" element={<FileLibrary />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
