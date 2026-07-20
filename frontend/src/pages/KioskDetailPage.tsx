import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Link, useParams } from 'react-router';
import { z } from 'zod';
import { adminApi } from '../api/admin';
import type { Consumable, Kiosk, PrintJob } from '../api/types';
import { LoadingState } from '../components/PageState';
import { queryClient } from '../queryClient';

const configurationSchema = z.object({
  grayscalePricePerPage: z.number().min(0),
  colorLowSaturationThreshold: z.number().min(0).max(1),
  colorLowPricePerPage: z.number().min(0),
  colorHighSaturationThreshold: z.number().min(0).max(1),
  colorHighPricePerPage: z.number().min(0),
  bluetoothDisplayName: z.string().max(120),
}).refine(values => values.colorLowSaturationThreshold < values.colorHighSaturationThreshold, {
  message: 'El umbral bajo debe ser menor que el alto.', path: ['colorHighSaturationThreshold'],
});
type ConfigurationValues = z.infer<typeof configurationSchema>;

function configDefaults(item: Kiosk): ConfigurationValues {
  const config = item.configuration;
  return {
    grayscalePricePerPage: config?.grayscalePricePerPage ?? item.price_per_page,
    colorLowSaturationThreshold: config?.colorLowSaturationThreshold ?? 0.2,
    colorLowPricePerPage: config?.colorLowPricePerPage ?? item.price_per_page,
    colorHighSaturationThreshold: config?.colorHighSaturationThreshold ?? 0.8,
    colorHighPricePerPage: config?.colorHighPricePerPage ?? item.price_per_page,
    bluetoothDisplayName: config?.bluetoothDisplayName ?? '',
  };
}

function ConfigurationForm({ item }: { item: Kiosk }) {
  const form = useForm<ConfigurationValues>({ resolver: zodResolver(configurationSchema), defaultValues: configDefaults(item) });
  const save = useMutation({
    mutationFn: (configuration: ConfigurationValues) => adminApi.updateKiosk(item.id, { configuration }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kiosk', item.id] }),
  });
  const fields: Array<{ key: keyof ConfigurationValues; label: string; step?: string }> = [
    { key: 'grayscalePricePerPage', label: 'Precio escala de grises', step: '0.01' },
    { key: 'colorLowSaturationThreshold', label: 'Umbral color bajo', step: '0.01' },
    { key: 'colorLowPricePerPage', label: 'Precio color bajo', step: '0.01' },
    { key: 'colorHighSaturationThreshold', label: 'Umbral color alto', step: '0.01' },
    { key: 'colorHighPricePerPage', label: 'Precio color alto', step: '0.01' },
  ];
  return <Paper component="form" onSubmit={form.handleSubmit(values => save.mutate(values))} sx={{ p: { xs: 2, sm: 3 } }}>
    <Stack spacing={2}>
      <Box><Typography variant="h6">Configuración remota</Typography><Typography color="text.secondary" variant="body2">El kiosco consulta estos valores al iniciar, cada 5 minutos y antes de cotizar.</Typography></Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
        {fields.map(({ key, label, step }) => <TextField key={key} label={label} type="number" slotProps={{ htmlInput: { min: 0, max: key.includes('Threshold') ? 1 : undefined, step } }} error={!!form.formState.errors[key]} helperText={form.formState.errors[key]?.message} {...form.register(key, { valueAsNumber: true })} />)}
        <TextField label="Nombre visible Bluetooth" error={!!form.formState.errors.bluetoothDisplayName} helperText={form.formState.errors.bluetoothDisplayName?.message} {...form.register('bluetoothDisplayName')} />
      </Box>
      <Typography variant="body2" color="text.secondary">Versión: {item.configuration?.version || 'sin publicar'} · Último cambio: {item.configuration?.updatedAt || 'pendiente'} · Origen: {item.configuration?.source || 'local pendiente'}</Typography>
      {save.isError && <Alert severity="error">No fue posible guardar la configuración remota.</Alert>}
      {save.isSuccess && <Alert severity="success">Configuración guardada. Se aplicará en el kiosco antes de su próxima cotización.</Alert>}
      <Button type="submit" variant="contained" loading={save.isPending} sx={{ alignSelf: 'start' }}>Guardar configuración</Button>
    </Stack>
  </Paper>;
}

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
  return <Stack spacing={3}><Button component={Link} to="/kiosks" sx={{ alignSelf: 'start' }}>← Volver a kioscos</Button><Box><Typography variant="h4" sx={{ overflowWrap: 'anywhere' }}>{item.name}</Typography><Typography color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{item.id} · {item.is_active ? 'Activo' : 'Inactivo'} · ${item.price_per_page.toFixed(2)} por página</Typography></Box><ConfigurationForm key={item.configuration?.version || 0} item={item} /><Paper sx={{ p: { xs: 1.5, sm: 2 } }}><Typography variant="h6" gutterBottom>Trabajos recientes</Typography><Box sx={{ width: '100%', minWidth: 0 }}><DataGrid autoHeight rows={jobs.data!.items} columns={jobColumns} disableRowSelectionOnClick hideFooter /></Box></Paper><Paper sx={{ p: { xs: 1.5, sm: 2 } }}><Typography variant="h6" gutterBottom>Historial de consumibles</Typography><Box sx={{ width: '100%', minWidth: 0 }}><DataGrid autoHeight rows={consumables.data!.items} columns={consumableColumns} disableRowSelectionOnClick hideFooter /></Box></Paper></Stack>;
}
