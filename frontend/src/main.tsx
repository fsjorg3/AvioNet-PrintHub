import '@fontsource/plus-jakarta-sans/400.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import '@fontsource/plus-jakarta-sans/800.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router';
import App from './App';
import { AuthProvider } from './auth';
import './index.css';
import { queryClient } from './queryClient';
import { avionetTheme } from './theme';

createRoot(document.getElementById('root')!).render(
  <StrictMode><ThemeProvider theme={avionetTheme}><CssBaseline /><QueryClientProvider client={queryClient}><BrowserRouter><AuthProvider><App /></AuthProvider></BrowserRouter></QueryClientProvider></ThemeProvider></StrictMode>,
);
