import { zodResolver } from '@hookform/resolvers/zod';
import { Add, ToggleOff, ToggleOn, Visibility } from '@mui/icons-material';
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

const schema = z.object({ name: z.string().trim().min(1, 'El nombre es obligatorio.'), pricePerPage: z.number().min(0, 'El precio no puede ser negativo.') });
type FormValues = z.infer<typeof schema>;

export function KiosksPage() {
  const [dialog, setDialog] = useState(false);
  const kiosks = useQuery({ queryKey: ['kiosks'], queryFn: adminApi.kiosks });
  const create = useMutation({ mutationFn: (data: FormValues) => adminApi.createKiosk(data.name, data.pricePerPage), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['kiosks'] }); setDialog(false); form.reset(); } });
  const status = useMutation({ mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => adminApi.setKioskStatus(id, isActive), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kiosks'] }) });
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { name: '', pricePerPage: 0 } });
  const columns: GridColDef<Kiosk>[] = [
    { field: 'name', headerName: 'Kiosco', flex: 1, minWidth: 180 },
    { field: 'price_per_page', headerName: 'Precio/pág.', width: 130, valueFormatter: value => `$${Number(value).toFixed(2)}` },
    { field: 'is_active', headerName: 'Estado', width: 120, valueFormatter: value => value ? 'Activo' : 'Inactivo' },
    { field: 'last_seen_at', headerName: 'Última conexión', flex: 1, minWidth: 170, valueFormatter: value => value || 'Sin conexión' },
    { field: 'actions', headerName: 'Acciones', width: 150, sortable: false, renderCell: ({ row }) => <Stack direction="row"><IconButton component={Link} to={`/kiosks/${row.id}`} aria-label="Ver detalle"><Visibility /></IconButton><IconButton color={row.is_active ? 'warning' : 'success'} onClick={() => status.mutate({ id: row.id, isActive: !row.is_active })} aria-label="Cambiar estado">{row.is_active ? <ToggleOff /> : <ToggleOn />}</IconButton></Stack> },
  ];
  if (kiosks.isLoading) return <LoadingState />;
  if (kiosks.isError) return <Alert severity="error">No fue posible cargar los kioscos.</Alert>;
  return <Stack spacing={3}><Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'stretch', sm: 'center' }, gap: 2 }}><Box><Typography variant="h4">Kioscos</Typography><Typography color="text.secondary">Administra precios y disponibilidad.</Typography></Box><Button variant="contained" startIcon={<Add />} onClick={() => setDialog(true)} sx={{ alignSelf: { xs: 'stretch', sm: 'center' } }}>Nuevo kiosco</Button></Box>
    <Box sx={{ width: '100%', minWidth: 0 }}><DataGrid rows={kiosks.data!.kiosks} columns={columns} getRowId={row => row.id} autoHeight disableRowSelectionOnClick pageSizeOptions={[10, 25, 50]} initialState={{ pagination: { paginationModel: { pageSize: 10 } } }} /></Box>
    <Dialog open={dialog} onClose={() => setDialog(false)} fullWidth maxWidth="xs" component="form" onSubmit={form.handleSubmit(data => create.mutate(data))}><DialogTitle>Crear kiosco</DialogTitle><DialogContent><TextField autoFocus margin="dense" label="Nombre" fullWidth error={!!form.formState.errors.name} helperText={form.formState.errors.name?.message} {...form.register('name')} /><TextField margin="dense" label="Precio por página" type="number" slotProps={{ htmlInput: { min: 0, step: .5 } }} fullWidth error={!!form.formState.errors.pricePerPage} helperText={form.formState.errors.pricePerPage?.message} {...form.register('pricePerPage', { valueAsNumber: true })} /></DialogContent><DialogActions><Button onClick={() => setDialog(false)}>Cancelar</Button><Button type="submit" variant="contained" loading={create.isPending}>Crear</Button></DialogActions></Dialog>
  </Stack>;
}
