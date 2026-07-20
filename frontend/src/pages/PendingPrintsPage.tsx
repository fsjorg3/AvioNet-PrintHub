import { Box, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { DataGrid, type GridColDef, type GridPaginationModel } from '@mui/x-data-grid';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { adminApi } from '../api/admin';
import type { PendingPrint } from '../api/types';
import { ErrorState, LoadingState } from '../components/PageState';

export function PendingPrintsPage() {
  const [model, setModel] = useState<GridPaginationModel>({ page: 0, pageSize: 25 });
  const [status, setStatus] = useState('');
  const [pin, setPin] = useState('');
  const query = useQuery({ queryKey: ['pending-prints', model, status, pin], queryFn: () => adminApi.pendingPrints({ page: model.page + 1, pageSize: model.pageSize, status, pin }) });
  const columns: GridColDef<PendingPrint>[] = [
    { field: 'pin', headerName: 'PIN', width: 110 }, { field: 'filename', headerName: 'Archivo', flex: 1, minWidth: 180 }, { field: 'phone', headerName: 'Teléfono', width: 150 }, { field: 'status', headerName: 'Estado', width: 120 }, { field: 'created_at', headerName: 'Recibido', minWidth: 165 }, { field: 'expires_at', headerName: 'Expira', minWidth: 165, valueFormatter: value => value || 'Eliminado' },
  ];
  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <ErrorState message="No fue posible cargar la cola de impresión." />;
  return <Stack spacing={3}><Box><Typography variant="h4">Cola de impresión</Typography><Typography color="text.secondary">Documentos recibidos desde WhatsApp.</Typography></Box><Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><TextField fullWidth label="Buscar PIN" value={pin} onChange={event => { setPin(event.target.value); setModel(current => ({ ...current, page: 0 })); }} sx={{ maxWidth: { sm: 260 } }} /><TextField fullWidth select label="Estado" value={status} onChange={event => { setStatus(event.target.value); setModel(current => ({ ...current, page: 0 })); }} sx={{ maxWidth: { sm: 220 } }}><MenuItem value="">Todos</MenuItem><MenuItem value="pending">Pendiente</MenuItem><MenuItem value="downloaded">Descargado</MenuItem><MenuItem value="expired">Expirado</MenuItem></TextField></Stack><Box sx={{ width: '100%', minWidth: 0 }}><DataGrid autoHeight rows={query.data!.items} columns={columns} getRowId={row => row.pin} loading={query.isFetching} paginationMode="server" rowCount={query.data!.pagination.total} paginationModel={model} onPaginationModelChange={setModel} pageSizeOptions={[10, 25, 50]} disableRowSelectionOnClick /></Box></Stack>;
}
