import { Alert, Box, Card, CardContent, Chip, Grid, Paper, Stack, Typography } from '@mui/material';
import { BarChart } from '@mui/x-charts/BarChart';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../api/admin';
import { LoadingState } from '../components/PageState';

const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

export function DashboardPage() {
  const kpis = useQuery({ queryKey: ['kpis'], queryFn: adminApi.kpis });
  const consumables = useQuery({ queryKey: ['consumables'], queryFn: adminApi.consumables });
  if (kpis.isLoading || consumables.isLoading) return <LoadingState />;
  if (kpis.isError || consumables.isError) return <Alert severity="error">No fue posible cargar el dashboard.</Alert>;
  const data = kpis.data!;
  return <Stack spacing={3}><Box><Typography variant="h4">Dashboard</Typography><Typography color="text.secondary">Resumen operativo de AvioNet PrintHub.</Typography></Box>
    <Grid container spacing={2}>{[["Ingresos", money.format(data.totalRevenue)], ["Páginas", data.totalPages.toLocaleString('es-MX')], ["Trabajos", data.totalJobs.toLocaleString('es-MX')]].map(([label, value]) => <Grid key={label} size={{ xs: 12, md: 4 }}><Card><CardContent><Typography color="text.secondary">{label}</Typography><Typography variant="h4" color="primary">{value}</Typography></CardContent></Card></Grid>)}</Grid>
    <Grid container spacing={2}><Grid size={{ xs: 12, lg: 7 }}><Paper sx={{ p: { xs: 2, sm: 3 }, minWidth: 0 }}><Typography variant="h6" gutterBottom>Ingresos por kiosco</Typography>{data.byKiosk.length ? <Box sx={{ width: '100%', overflowX: 'auto' }}><BarChart height={320} xAxis={[{ data: data.byKiosk.map(item => item.name), scaleType: 'band' }]} series={[{ data: data.byKiosk.map(item => item.revenue), label: 'Ingresos (MXN)', color: '#FF6B00' }]} /></Box> : <Typography color="text.secondary">Aún no hay trabajos registrados.</Typography>}</Paper></Grid>
      <Grid size={{ xs: 12, lg: 5 }}><Paper sx={{ p: { xs: 2, sm: 3 } }}><Typography variant="h6" gutterBottom>Consumibles actuales</Typography><Stack spacing={1}>{consumables.data!.consumables.length ? consumables.data!.consumables.map(item => <Box key={`${item.kiosk_id}-${item.type}`} sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}><Typography sx={{ overflowWrap: 'anywhere' }}>{item.kiosk_id} · {item.type}</Typography><Chip size="small" label={item.status} color={item.status === 'ok' ? 'success' : item.status === 'low' ? 'warning' : item.status === 'empty' || item.status === 'critical' ? 'error' : 'default'} /></Box>) : <Typography color="text.secondary">Sin reportes de consumibles.</Typography>}</Stack></Paper></Grid></Grid>
  </Stack>;
}
