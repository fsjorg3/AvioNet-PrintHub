import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Box, Button, Paper, TextField, Typography } from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router';
import { z } from 'zod';
import { adminApi } from '../api/admin';
import { ApiClientError } from '../api/client';
import { useAuth } from '../authContext';

const schema = z.object({ user: z.string().min(1, 'Escribe tu usuario.'), password: z.string().min(1, 'Escribe tu contraseña.') });
type FormValues = z.infer<typeof schema>;

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refresh } = useAuth();
  const form = useForm<FormValues>({ resolver: zodResolver(schema) });
  const login = useMutation({ mutationFn: ({ user, password }: FormValues) => adminApi.login(user, password), onSuccess: async () => { await refresh(); navigate(location.state?.from || '/dashboard', { replace: true }); } });
  const error = login.error instanceof ApiClientError ? login.error.message : login.error ? 'No fue posible iniciar sesión.' : null;
  return <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2, background: 'linear-gradient(135deg, #071B73 0%, #1E40AF 100%)' }}>
    <Paper component="form" onSubmit={form.handleSubmit(values => login.mutate(values))} sx={{ width: '100%', maxWidth: 420, p: 4, border: 0 }}>
      <Typography variant="h4" color="primary" gutterBottom>AvioNet</Typography><Typography variant="h6" gutterBottom>PrintHub Admin</Typography><Typography color="text.secondary" sx={{ mb: 3 }}>Inicia sesión para administrar kioscos e impresiones.</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <TextField label="Usuario" fullWidth autoComplete="username" margin="normal" error={!!form.formState.errors.user} helperText={form.formState.errors.user?.message} {...form.register('user')} />
      <TextField label="Contraseña" type="password" fullWidth autoComplete="current-password" margin="normal" error={!!form.formState.errors.password} helperText={form.formState.errors.password?.message} {...form.register('password')} />
      <Button type="submit" fullWidth variant="contained" size="large" sx={{ mt: 3 }} loading={login.isPending}>Ingresar</Button>
    </Paper>
  </Box>;
}
