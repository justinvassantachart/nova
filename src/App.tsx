import './App.css';
import FileExplorer from './components/FileExplorer';
import Editor from './components/Editor';
import RightPane from './components/RightPane';
import Toolbar from './components/Toolbar';
import { useEffect } from 'react';

export default function App() {
  // Initialize VFS on mount
  useEffect(() => {
    import('./vfs/volume').then(({ initVFS }) => initVFS());
  }, []);

  return (
    <div className="nova-app">
      <Toolbar />
      <FileExplorer />
      <Editor />
      <RightPane />
    </div>
  );
}
