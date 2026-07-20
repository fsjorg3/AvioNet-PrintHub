import { zodResolver } from '@hookform/resolvers/zod';
import { Add, ContentCopy, ToggleOff, ToggleOn, Visibility } from '@mui/icons-material';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Stack, TextField, Typography } from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { z } from 'zod';
import { adminApi } from '../api/admin';
import type { Kiosk } from '../api/types';
import { queryClient } from '../queryClient';
import { LoadingState } from '../components/PageState';

const schema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio.'),
  pricePerPage: z.number().min(0, 'El precio no puede ser negativo.'),
  grayscalePricePerPage: z.number().min(0),
  colorLowSaturationThreshold: z.number().min(0).max(1),
  colorLowPricePerPage: z.number().min(0),
  colorHighSaturationThreshold: z.number().min(0).max(1),
  colorHighPricePerPage: z.number().min(0),
  bluetoothDisplayName: z.string().max(120),
}).refine(values => values.colorLowSaturationThreshold < values.colorHighSaturationThreshold, { message: 'El umbral bajo debe ser menor que el alto.', path: ['colorHighSaturationThreshold'] });
type FormValues = z.infer<typeof schema>;
type Credential = { id: string; secret: string };

const defaults: FormValues = { name: '', pricePerPage: 1, grayscalePricePerPage: 1, colorLowSaturationThreshold: .2, colorLowPricePerPage: 2, colorHighSaturationThreshold: .8, colorHighPricePerPage: 6, bluetoothDisplayName: '' };

export function KiosksPage() {
  const [dialog, setDialog] = useState(false);
  const [credential, setCredential] = useState<Credential | null>(null);
  const kiosks = useQuery({ queryKey: ['kiosks'], queryFn: adminApi.kiosks });
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults });
  const create = useMutation({
    mutationFn: (data: FormValues) => adminApi.createKiosk(data.name, data.pricePerPage, {
      grayscalePricePerPage: data.grayscalePricePerPage,
      colorLowSaturationThreshold: data.colorLowSaturationThreshold,
      colorLowPricePerPage: data.colorLowPricePerPage,
      colorHighSaturationThreshold: data.colorHighSaturationThreshold,
      colorHighPricePerPage: data.colorHighPricePerPage,
      bluetoothDisplayName: data.bluetoothDisplayName,
    }),
    onSuccess: result => { queryClient.invalidateQueries({ queryKey: ['kiosks'] }); setDialog(false); form.reset(defaults); setCredential({ id: result.id, secret: result.secret }); },
  });
  const status = useMutation({ mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => adminApi.setKioskStatus(id, isActive), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kiosks'] }) });
  const columns: GridColDef<Kiosk>[] = [
    { field: 'name', headerName: 'Kiosco', flex: 1, minWidth: 180 },
    { field: 'price_per_page', headerName: 'Precio/pág.', width: 130, valueFormatter: value => `$${Number(value).toFixed(2)}` },
    { field: 'is_active', headerName: 'Estado', width: 120, valueFormatter: value => value ? 'Activo' : 'Inactivo' },
    { field: 'last_seen_at', headerName: 'Última conexión', flex: 1, minWidth: 170, valueFormatter: value => value || 'Sin conexión' },
    { field: 'actions', headerName: 'Acciones', width: 150, sortable: false, renderCell: ({ row }) => <Stack direction="row"><IconButton component={Link} to={`/kiosks/${row.id}`} aria-label="Ver detalle"><Visibility /></IconButton><IconButton color={row.is_active ? 'warning' : 'success'} onClick={() => status.mutate({ id: row.id, isActive: !row.is_active })} aria-label="Cambiar estado">{row.is_active ? <ToggleOff /> : <ToggleOn />}</IconButton></Stack> },
  ];
  const remoteFields: Array<{ key: keyof FormValues; label: string; step?: string }> = [
    { key: 'grayscalePricePerPage', label: 'Precio escala de grises', step: '.01' }, { key: 'colorLowSaturationThreshold', label: 'Umbral color bajo', step: '.01' }, { key: 'colorLowPricePerPage', label: 'Precio color bajo', step: '.01' }, { key: 'colorHighSaturationThreshold', label: 'Umbral color alto', step: '.01' }, { key: 'colorHighPricePerPage', label: 'Precio color alto', step: '.01' },
  ];
  const token = credential ? `${credential.id}.${credential.secret}` : '';
  if (kiosks.isLoading) return <LoadingState />;
  if (kiosks.isError) return <Alert severity="error">No fue posible cargar los kioscos.</Alert>;
  return <Stack spacing={3}><Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'stretch', sm: 'center' }, gap: 2 }}><Box><Typography variant="h4">Kioscos</Typography><Typography color="text.secondary">Administra precios y disponibilidad.</Typography></Box><Button variant="contained" startIcon={<Add />} onClick={() => setDialog(true)} sx={{ alignSelf: { xs: 'stretch', sm: 'center' } }}>Nuevo kiosco</Button></Box>
    <Box sx={{ width: '100%', minWidth: 0 }}><DataGrid rows={kiosks.data!.kiosks} columns={columns} getRowId={row => row.id} autoHeight disableRowSelectionOnClick pageSizeOptions={[10, 25, 50]} initialState={{ pagination: { paginationModel: { pageSize: 10 } } }} /></Box>
    <Dialog open={dialog} onClose={() => setDialog(false)} fullWidth maxWidth="sm" component="form" onSubmit={form.handleSubmit(data => create.mutate(data))}><DialogTitle>Crear kiosco</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}><TextField autoFocus label="Nombre" fullWidth error={!!form.formState.errors.name} helperText={form.formState.errors.name?.message} {...form.register('name')} /><TextField label="Precio heredado por página" type="number" slotProps={{ htmlInput: { min: 0, step: .01 } }} fullWidth error={!!form.formState.errors.pricePerPage} helperText={form.formState.errors.pricePerPage?.message} {...form.register('pricePerPage', { valueAsNumber: true })} /><Typography variant="subtitle2">Configuración remota inicial</Typography><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>{remoteFields.map(({ key, label, step }) => <TextField key={key} label={label} type="number" slotProps={{ htmlInput: { min: 0, max: key.includes('Threshold') ? 1 : undefined, step } }} error={!!form.formState.errors[key]} helperText={form.formState.errors[key]?.message} {...form.register(key, { valueAsNumber: true })} />)}<TextField label="Nombre visible Bluetooth" error={!!form.formState.errors.bluetoothDisplayName} helperText={form.formState.errors.bluetoothDisplayName?.message} {...form.register('bluetoothDisplayName')} /></Box>{create.isError && <Alert severity="error">No fue posible crear el kiosco.</Alert>}</Stack></DialogContent><DialogActions><Button onClick={() => setDialog(false)}>Cancelar</Button><Button type="submit" variant="contained" loading={create.isPending}>Crear</Button></DialogActions></Dialog>
    <Dialog open={!!credential} onClose={() => setCredential(null)} fullWidth maxWidth="sm"><DialogTitle>Guarda la credencial del kiosco</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}><Alert severity="warning">Esta es la única vez que se muestra el secreto. Guárdalo en el archivo local del kiosco como <code>KioskReportToken</code>.</Alert><TextField label="KioskReportToken" value={token} fullWidth slotProps={{ input: { readOnly: true } }} /><Button startIcon={<ContentCopy />} onClick={() => navigator.clipboard.writeText(token)}>Copiar credencial</Button></Stack></DialogContent><DialogActions><Button variant="contained" onClick={() => setCredential(null)}>Ya la guardé</Button></DialogActions></Dialog>
  </Stack>;
}
