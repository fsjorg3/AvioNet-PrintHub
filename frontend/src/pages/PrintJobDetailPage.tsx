import { Alert, Button, Paper, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { adminApi } from '../api/admin';
import { LoadingState } from '../components/PageState';

export function PrintJobDetailPage() {
  const { id = '' } = useParams();
  const job = useQuery({ queryKey: ['print-job', id], queryFn: () => adminApi.printJob(id) });
  if (job.isLoading) return <LoadingState />;
  if (job.isError) return <Alert severity="error">No fue posible cargar el trabajo solicitado.</Alert>;
  const item = job.data!.job;
  return <Stack spacing={3}><Button component={Link} to="/print-jobs" sx={{ alignSelf: 'start' }}>← Volver al historial</Button><Typography variant="h4">Trabajo #{item.id}</Typography><Paper sx={{ p: { xs: 2, sm: 3 } }}><Stack spacing={1}><Typography sx={{ overflowWrap: 'anywhere' }}><strong>Kiosco:</strong> {item.kiosk_name}</Typography><Typography><strong>PIN:</strong> {item.pin || 'Manual'}</Typography><Typography><strong>Páginas:</strong> {item.pages}</Typography><Typography><strong>Ingreso:</strong> ${item.revenue.toFixed(2)}</Typography><Typography><strong>Fecha:</strong> {item.created_at}</Typography></Stack></Paper></Stack>;
}
