import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../styles/tokens.css'
import 'jspreadsheet-ce/dist/jspreadsheet.css'
import 'jsuites/dist/jsuites.css'
import '../styles/charts.css'
import Gallery from './Gallery.jsx'

createRoot(document.getElementById('root')).render(<StrictMode><Gallery /></StrictMode>)
