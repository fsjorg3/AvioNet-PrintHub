import { createTheme } from '@mui/material/styles';

export const avionetTheme = createTheme({
  palette: {
    primary: { main: '#071B73', dark: '#05145E', light: '#1E40AF', contrastText: '#FFFFFF' },
    secondary: { main: '#FF6B00', contrastText: '#FFFFFF' },
    success: { main: '#10B981' },
    warning: { main: '#EA580C' },
    error: { main: '#B91C1C' },
    background: { default: '#F8FAFC', paper: '#FFFFFF' },
    text: { primary: '#334155', secondary: '#64748B' },
  },
  shape: { borderRadius: 12 },
  typography: { fontFamily: '"Plus Jakarta Sans", Arial, sans-serif', h4: { fontWeight: 800 }, h5: { fontWeight: 700 } },
  components: {
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiPaper: { styleOverrides: { root: { border: '1px solid #E2E8F0' } } },
  },
});
