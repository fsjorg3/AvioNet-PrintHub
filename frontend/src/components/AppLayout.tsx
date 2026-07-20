import { useState } from 'react';
import { AppBar, Box, Button, Divider, Drawer, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Toolbar, Typography, useMediaQuery } from '@mui/material';
import { Dashboard, Factory, Inventory2, Logout, Menu, Print, ReceiptLong } from '@mui/icons-material';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { adminApi } from '../api/admin';
import { queryClient } from '../queryClient';
import { useAuth } from '../authContext';

const drawerWidth = 252;
const links = [
  { to: '/dashboard', label: 'Dashboard', icon: <Dashboard /> },
  { to: '/kiosks', label: 'Kioscos', icon: <Factory /> },
  { to: '/pending-prints', label: 'Cola de impresión', icon: <Print /> },
  { to: '/print-jobs', label: 'Trabajos', icon: <ReceiptLong /> },
  { to: '/consumables', label: 'Consumibles', icon: <Inventory2 /> },
];

export function AppLayout() {
  const compact = useMediaQuery('(max-width:900px)');
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const logout = useMutation({ mutationFn: adminApi.logout, onSuccess: () => { queryClient.clear(); navigate('/login'); } });
  const menu = (
    <>
      <Toolbar><Box><Typography variant="h6" color="primary" sx={{ fontWeight: 800 }}>AvioNet</Typography><Typography variant="caption" color="text.secondary">PrintHub Admin</Typography></Box></Toolbar>
      <Divider />
      <List sx={{ px: 1, py: 1 }}>
        {links.map(({ to, label, icon }) => <ListItemButton key={to} component={NavLink} to={to} onClick={() => setOpen(false)} sx={{ borderRadius: 2, mb: .5, '&.active': { bgcolor: 'primary.main', color: 'primary.contrastText', '& .MuiListItemIcon-root': { color: 'inherit' } } }}><ListItemIcon>{icon}</ListItemIcon><ListItemText primary={label} /></ListItemButton>)}
      </List>
      <Box sx={{ mt: 'auto', p: 2 }}><Typography variant="caption" color="text.secondary">Sesión: {user}</Typography><Button fullWidth sx={{ mt: 1 }} color="inherit" startIcon={<Logout />} onClick={() => logout.mutate()}>Cerrar sesión</Button></Box>
    </>
  );
  return <Box sx={{ display: 'flex', minHeight: '100vh' }}>
    <AppBar position="fixed" sx={{ zIndex: theme => theme.zIndex.drawer + 1, bgcolor: '#071B73' }}><Toolbar>{compact && <IconButton color="inherit" onClick={() => setOpen(true)}><Menu /></IconButton>}<Typography variant="h6" sx={{ fontWeight: 700 }}>AvioNet PrintHub</Typography></Toolbar></AppBar>
    <Drawer variant={compact ? 'temporary' : 'permanent'} open={compact ? open : true} onClose={() => setOpen(false)} ModalProps={{ keepMounted: true }} sx={{ '& .MuiDrawer-paper': { width: drawerWidth, boxSizing: 'border-box', display: 'flex' } }}>{menu}</Drawer>
    <Box component="main" sx={{ flexGrow: 1, pt: 10, px: { xs: 2, md: 4 }, pb: 4, minWidth: 0 }}><Outlet /></Box>
  </Box>;
}
