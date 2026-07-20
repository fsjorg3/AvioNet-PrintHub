import { Alert, Box, Button, Paper, Stack, Typography } from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { adminApi } from '../api/admin';
import type { Consumable, PrintJob } from '../api/types';
import { LoadingState } from '../components/PageState';

export function KioskDetailPage() {
  const { id = '' } = useParams();
  const kiosk = useQuery({ queryKey: ['kiosk', id], queryFn: () => adminApi.kiosk(id) });
  const jobs = useQuery({ queryKey: ['kiosk-jobs', id], queryFn: () => adminApi.kioskPrintJobs(id, { page: 1, pageSize: 10 }) });
  const consumables = useQuery({ queryKey: ['kiosk-consumables', id], queryFn: () => adminApi.consumableHistory(id, { page: 1, pageSize: 10 }) });
  if (kiosk.isLoading || jobs.isLoading || consumables.isLoading) return <LoadingState />;
  if (kiosk.isError || jobs.isError || consumables.isError) return <Alert severity="error">No fue posible cargar el detalle del kiosco.</Alert>;
  const jobColumns: GridColDef<PrintJob>[] = [{ field: 'id', headerName: '#', width: 70 }, { field: 'pin', headerName: 'PIN', width: 110 }, { field: 'pages', headerName: 'Páginas', width: 100 }, { field: 'revenue', headerName: 'Ingreso', width: 110, valueFormatter: value => `$${value}` }, { field: 'created_at', headerName: 'Fecha', flex: 1 }];
  const consumableColumns: GridColDef<Consumable>[] = [{ field: 'type', headerName: 'Tipo', flex: 1 }, { field: 'status', headerName: 'Estado', width: 120 }, { field: 'level_percent', headerName: 'Nivel', width: 100, valueFormatter: value => value === null ? 'N/D' : `${value}%` }, { field: 'reported_at', headerName: 'Reporte', flex: 1 }];
  const item = kiosk.data!.kiosk;
  return <Stack spacing={3}><Button component={Link} to="/kiosks" sx={{ alignSelf: 'start' }}>← Volver a kioscos</Button><Box><Typography variant="h4">{item.name}</Typography><Typography color="text.secondary">{item.id} · {item.is_active ? 'Activo' : 'Inactivo'} · ${item.price_per_page.toFixed(2)} por página</Typography></Box><Paper sx={{ p: 2 }}><Typography variant="h6" gutterBottom>Trabajos recientes</Typography><DataGrid autoHeight rows={jobs.data!.items} columns={jobColumns} disableRowSelectionOnClick hideFooter /></Paper><Paper sx={{ p: 2 }}><Typography variant="h6" gutterBottom>Historial de consumibles</Typography><DataGrid autoHeight rows={consumables.data!.items} columns={consumableColumns} disableRowSelectionOnClick hideFooter /></Paper></Stack>;
}
