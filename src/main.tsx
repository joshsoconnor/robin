import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { APIProvider } from '@vis.gl/react-google-maps'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <APIProvider apiKey="AIzaSyB9id2lFl02rKAX2gf9qkiL24oEvhI__GU">
      <App />
    </APIProvider>
  </StrictMode>,
)
