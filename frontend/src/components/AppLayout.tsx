import { useState } from 'react';
import { AppBar, Box, Button, Divider, Drawer, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Toolbar, Typography, useMediaQuery, useTheme } from '@mui/material';
import { Dashboard, Factory, Inventory2, Logout, Menu, Print, ReceiptLong } from '@mui/icons-material';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { adminApi } from '../api/admin';
import { queryClient } from '../queryClient';
import { useAuth } from '../authContext';

const drawerWidth = 252;
const desktopAppBarHeight = 72;
const links = [
  { to: '/dashboard', label: 'Dashboard', icon: <Dashboard /> },
  { to: '/kiosks', label: 'Kioscos', icon: <Factory /> },
  { to: '/pending-prints', label: 'Cola de impresión', icon: <Print /> },
  { to: '/print-jobs', label: 'Trabajos', icon: <ReceiptLong /> },
  { to: '/consumables', label: 'Consumibles', icon: <Inventory2 /> },
];

export function AppLayout() {
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down('md'));
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const logout = useMutation({
    mutationFn: adminApi.logout,
    onSuccess: () => {
      queryClient.clear();
      navigate('/login');
    },
  });

  const menu = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
      <Toolbar sx={{ minHeight: { xs: 64, md: desktopAppBarHeight } }}>
        <Box>
          <Typography variant="h6" color="primary" sx={{ fontWeight: 800 }}>AvioNet</Typography>
          <Typography variant="caption" color="text.secondary">PrintHub Admin</Typography>
        </Box>
      </Toolbar>
      <Divider />
      <List sx={{ px: 1, py: 1 }}>
        {links.map(({ to, label, icon }) => (
          <ListItemButton
            key={to}
            component={NavLink}
            to={to}
            onClick={() => setOpen(false)}
            sx={{
              borderRadius: 2,
              mb: 0.5,
              '&.active': {
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                '& .MuiListItemIcon-root': { color: 'inherit' },
              },
            }}
          >
            <ListItemIcon>{icon}</ListItemIcon>
            <ListItemText primary={label} />
          </ListItemButton>
        ))}
      </List>
      <Box sx={{ mt: 'auto', p: 2 }}>
        <Typography variant="caption" color="text.secondary">Sesión: {user}</Typography>
        <Button fullWidth sx={{ mt: 1 }} color="inherit" startIcon={<Logout />} onClick={() => logout.mutate()}>
          Cerrar sesión
        </Button>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="fixed" sx={{ zIndex: theme.zIndex.drawer + 1, bgcolor: 'primary.main' }}>
        <Toolbar sx={{ minHeight: { xs: 64, md: desktopAppBarHeight } }}>
          {compact && <IconButton color="inherit" edge="start" sx={{ mr: 1 }} onClick={() => setOpen(true)} aria-label="Abrir navegación"><Menu /></IconButton>}
          <Typography variant="h6" sx={{ fontWeight: 700, fontSize: { xs: '1.1rem', sm: '1.25rem' } }}>AvioNet PrintHub</Typography>
        </Toolbar>
      </AppBar>
      <Drawer
        variant={compact ? 'temporary' : 'permanent'}
        open={compact ? open : true}
        onClose={() => setOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          width: { md: drawerWidth },
          flexShrink: { md: 0 },
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            boxSizing: 'border-box',
            top: { md: desktopAppBarHeight },
            height: { md: `calc(100% - ${desktopAppBarHeight}px)` },
          },
        }}
      >
        {menu}
      </Drawer>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { xs: '100%', md: `calc(100% - ${drawerWidth}px)` },
          minWidth: 0,
          pt: { xs: 10, md: 11 },
          px: { xs: 2, sm: 3, md: 4, lg: 5 },
          pb: { xs: 3, md: 5 },
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
}
