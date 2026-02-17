// The main entry point for the React application.
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css' // Main global styles
import 'react-image-crop/dist/ReactCrop.css' // Base styles for the crop component

// Renders the root App component into the DOM.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
